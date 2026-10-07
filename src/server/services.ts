import { z } from "zod";
import { db } from "../lib/db";
import { assertRevisionAllowed, assertRole, buildContractScope, moderateTask, nextContractStatus, splitPayment } from "../lib/domain";
import type { ContractEvent, Role } from "../lib/domain";
import { getStudentMatch } from "../lib/match-data";
import type { Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;
const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(10000);
const money = z.number().int().positive().max(2147483647);
const hours = z.number().int().positive().max(1000);
const skillIds = z.array(id).max(30).transform(v => [...new Set(v)]);
const workMode = z.enum(["REMOTE", "ONSITE", "HYBRID"]);
const httpUrl = z.url({ protocol: /^https?$/ }).max(2048);

async function actor(tx: Tx, userId: string, roles?: readonly Role[]) {
  const user = await tx.user.findUnique({ where: { id: id.parse(userId) }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive) throw new Error("Account unavailable or inactive");
  if (roles) assertRole(user.role, roles);
  return user;
}
export async function getActor(userId: string) { return actor(db, userId); }
function authorized<T>(actorId: string, roles: readonly Role[], fn: (tx: Tx, user: Awaited<ReturnType<typeof actor>>) => Promise<T>) {
  return db.$transaction(async tx => fn(tx, await actor(tx, actorId, roles)), { maxWait: 10000, timeout: 15000 });
}
async function validateSkills(tx: Tx, ids: string[]) {
  if (await tx.skill.count({ where: { id: { in: ids } } }) !== ids.length) throw new Error("Unknown skill");
}
async function ownedContract(tx: Tx, contractId: string, userId: string, side?: "student" | "client") {
  const c = await tx.contract.findUniqueOrThrow({ where: { id: id.parse(contractId) } });
  if (side ? c[side === "student" ? "studentId" : "clientId"] !== userId : c.clientId !== userId && c.studentId !== userId) throw new Error("Forbidden contract");
  return c;
}
async function transition(tx: Tx, c: Awaited<ReturnType<typeof ownedContract>>, event: ContractEvent, changes?: Prisma.ContractUpdateManyMutationInput) {
  const status = nextContractStatus(c.status, event);
  const changed = await tx.contract.updateMany({ where: { id: c.id, status: c.status }, data: { ...changes, status } });
  if (changed.count !== 1) throw new Error("Contract changed; refresh and try again");
  return status;
}
async function notify(tx: Tx, userId: string, contractId: string, title: string, body: string) {
  await tx.notification.create({ data: { userId, title, body, href: `/contracts/${contractId}` } });
}

const createSchema = z.object({
  title: z.string().trim().min(5).max(160), description: text.min(20), category: text.max(80),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]), budgetMin: money, budgetMax: money,
  deadline: z.union([z.date(), z.string()]).transform(v => new Date(v)).refine(v => Number.isFinite(v.getTime()) && v.getTime() > Date.now(), "Deadline must be in the future"),
  estimatedHours: hours, workMode, location: z.string().trim().max(120).default(""), skillIds: skillIds.refine(v => v.length > 0, "Select at least one required skill"),
  aiSummary: z.string().trim().max(10000).optional(),
}).refine(v => v.budgetMax >= v.budgetMin, "Maximum budget must be at least minimum budget");
export async function createTask(actorId: string, input: unknown) {
  const { skillIds: skills, ...data } = createSchema.parse(input);
  const moderation = moderateTask(`${data.title} ${data.description}`);
  if (!moderation.allowed) throw new Error(moderation.reasons.join("; "));
  return authorized(actorId, ["CLIENT"], async (tx, user) => {
    await validateSkills(tx, skills);
    const task = await tx.task.create({ data: { ...data, clientId: user.id, status: "OPEN", skills: { create: skills.map(skillId => ({ skillId })) } } });
    await audit(tx, user.id, "TASK_CREATED", "Task", task.id, { category: task.category, budgetMin: task.budgetMin, budgetMax: task.budgetMax, deadline: task.deadline.toISOString(), requiredSkills: skills.length });
    return task;
  });
}
const applySchema = z.object({ taskId: id, proposal: text.min(20), estimatedHours: hours, proposedPrice: money });
export async function applyToTask(actorId: string, input: unknown) {
  const data = applySchema.parse(input);
  const user = await getActor(actorId); assertRole(user.role, ["STUDENT"]);
  const task = await db.task.findUniqueOrThrow({ where: { id: data.taskId }, include: { skills: { include: { skill: true } } } });
  const match = await getStudentMatch(user.id, task);
  return authorized(actorId, ["STUDENT"], async (tx, currentUser) => {
    const locked = await tx.task.updateMany({ where: { id: task.id, status: "OPEN", deadline: { gt: new Date() }, budgetMin: { lte: data.proposedPrice }, budgetMax: { gte: data.proposedPrice } }, data: { status: "OPEN" } });
    if (!locked.count || task.clientId === currentUser.id) throw new Error("Task is unavailable or proposed price is outside budget");
    if (await tx.application.findUnique({ where: { taskId_studentId: { taskId: task.id, studentId: currentUser.id } } })) throw new Error("You have already applied to this task");
    const application = await tx.application.create({ data: { ...data, studentId: currentUser.id, matchScore: match.score, matchExplanation: match } });
    await audit(tx, currentUser.id, "APPLICATION_SUBMITTED", "Application", application.id, { taskId: task.id, proposedPrice: data.proposedPrice, matchScore: match.score });
    await tx.notification.create({ data: { userId: task.clientId, title: "Application received", body: `A student applied to ${task.title}. Review their proposal.`, href: `/tasks/${task.id}` } });
    return application;
  });
}
export async function hireApplicant(actorId: string, applicationId: string) {
  return authorized(actorId, ["CLIENT"], async (tx, user) => {
    const a = await tx.application.findUniqueOrThrow({ where: { id: id.parse(applicationId) }, include: { task: { include: { skills: { include: { skill: true } } } } } });
    if (a.task.clientId !== user.id) throw new Error("Forbidden task");
    const existing = await tx.contract.findUnique({ where: { taskId: a.taskId } });
    if (existing) { if (existing.applicationId === a.id) return existing; throw new Error("Another applicant has already been hired"); }
    if (!["PENDING", "SHORTLISTED"].includes(a.status)) throw new Error("Application is unavailable");
    await actor(tx, a.studentId, ["STUDENT"]);
    const changed = await tx.task.updateMany({ where: { id: a.taskId, clientId: user.id, status: "OPEN", deadline: { gt: new Date() } }, data: { status: "ASSIGNED" } });
    if (!changed.count) {
      const concurrent = await tx.contract.findUnique({ where: { taskId: a.taskId } });
      if (concurrent?.applicationId === a.id) return concurrent;
      throw new Error("Task is no longer open");
    }
    const scope = buildContractScope(a.task, a.task.skills.map(s => s.skill.name));
    const c = await tx.contract.create({ data: { taskId: a.taskId, applicationId: a.id, studentId: a.studentId, clientId: user.id, agreedAmount: a.proposedPrice, deadline: a.task.deadline, scopeSnapshot: scope } });
    await audit(tx, user.id, "CONTRACT_CREATED", "Contract", c.id, { taskId: c.taskId, agreedAmount: c.agreedAmount, revisionAllowance: scope.revisionAllowance, scopeCapturedAt: scope.capturedAt });
    await tx.application.update({ where: { id: a.id }, data: { status: "HIRED" } });
    await tx.application.updateMany({ where: { taskId: a.taskId, id: { not: a.id }, status: { in: ["PENDING", "SHORTLISTED"] } }, data: { status: "REJECTED" } });
    await tx.transaction.create({ data: { contractId: c.id, clientId: c.clientId, studentId: c.studentId, ...splitPayment(c.agreedAmount), type: "ESCROW_FUND", status: "ESCROWED" } });
    await notify(tx, c.studentId, c.id, "You have been hired", "Sandbox escrow recorded. Start your contract when ready.");
    return c;
  });
}

export async function startContract(actorId: string, contractId: string) {
  return authorized(actorId, ["STUDENT"], async (tx, user) => {
    const c = await ownedContract(tx, contractId, user.id, "student");
    await transition(tx, c, "START");
    await tx.task.update({ where: { id: c.taskId }, data: { status: "IN_PROGRESS" } });
    await notify(tx, c.clientId, c.id, "Work started", "The student has started work on your contract.");
    return tx.contract.findUniqueOrThrow({ where: { id: c.id } });
  });
}
const submitSchema = z.object({ contractId: id, description: text, externalLinks: z.array(httpUrl).max(20), fileUrls: z.array(z.string().regex(/^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).max(10).default([]) });
export async function submitWork(actorId: string, input: unknown) {
  const data = submitSchema.parse(input);
  return authorized(actorId, ["STUDENT"], async (tx, user) => {
    const c = await ownedContract(tx, data.contractId, user.id, "student");
    const attachmentIds = [...new Set(data.fileUrls.map(url => url.slice("/api/uploads/".length)))];
    if (await tx.attachment.count({ where: { id: { in: attachmentIds }, userId: user.id, contractId: c.id } }) !== attachmentIds.length) throw new Error("Invalid or unauthorized attachment");
    await transition(tx, c, "SUBMIT");
    const submission = await tx.submission.create({ data });
    await audit(tx, user.id, "SUBMISSION_SUBMITTED", "Submission", submission.id, { contractId: c.id, externalLinks: data.externalLinks.length, files: attachmentIds.length });
    await tx.task.update({ where: { id: c.taskId }, data: { status: "SUBMITTED" } });
    await notify(tx, c.clientId, c.id, "Work submitted", "Review the submission, approve it or request a revision.");
    return submission;
  });
}
async function reviewSubmission(actorId: string, contractId: string, revisionReason?: string) {
  return authorized(actorId, ["CLIENT"], async (tx, user) => {
    const c = await ownedContract(tx, contractId, user.id, "client");
    if (revisionReason) assertRevisionAllowed(c.revisionCount);
    await transition(tx, c, revisionReason ? "REQUEST_REVISION" : "APPROVE", revisionReason ? { revisionCount: { increment: 1 } } : undefined);
    await audit(tx, user.id, revisionReason ? "REVISION_REQUESTED" : "SUBMISSION_APPROVED", "Contract", c.id, revisionReason
      ? { reason: revisionReason, revisionCount: c.revisionCount + 1, reasonLength: revisionReason.length }
      : { agreedAmount: c.agreedAmount });
    const submission = await tx.submission.findFirst({ where: { contractId: c.id, status: "PENDING" }, orderBy: { submittedAt: "desc" } });
    if (!submission) throw new Error("No pending submission");
    await tx.submission.update({ where: { id: submission.id }, data: { status: revisionReason ? "REVISION_REQUESTED" : "APPROVED", reviewedAt: new Date() } });
    if (revisionReason) {
      await tx.task.update({ where: { id: c.taskId }, data: { status: "IN_PROGRESS" } });
      await tx.message.create({ data: { contractId: c.id, senderId: user.id, body: `Revision requested: ${revisionReason}` } });
    }
    await notify(tx, c.studentId, c.id, revisionReason ? "Revision requested" : "Submission approved", revisionReason ?? "Your work is approved. Awaiting sandbox payment release.");
    return tx.contract.findUniqueOrThrow({ where: { id: c.id } });
  });
}
export async function requestRevision(actorId: string, contractId: string, reason: string) { return reviewSubmission(actorId, contractId, text.parse(reason)); }
export async function approveSubmission(actorId: string, contractId: string) { return reviewSubmission(actorId, contractId); }

export async function releasePayment(actorId: string, contractId: string) {
  return authorized(actorId, ["CLIENT"], async (tx, user) => {
    const c = await ownedContract(tx, contractId, user.id, "client");
    if (c.status === "COMPLETED") return c;
    const changed = await tx.contract.updateMany({ where: { id: c.id, status: "APPROVED" }, data: { status: nextContractStatus(c.status, "RELEASE_PAYMENT"), completedAt: new Date() } });
    if (!changed.count) {
      const current = await tx.contract.findUniqueOrThrow({ where: { id: c.id } });
      if (current.status === "COMPLETED") return current;
      throw new Error("Contract changed; refresh and try again");
    }
    const split = splitPayment(c.agreedAmount);
    const escrow = await tx.transaction.updateMany({ where: { contractId: c.id, type: "ESCROW_FUND", status: "ESCROWED", amount: c.agreedAmount }, data: { status: "RELEASED", releasedAt: new Date() } });
    if (!escrow.count) throw new Error("Sandbox escrow is unavailable");
    for (const [type, amount] of [["PAYOUT_RELEASE", split.studentPayout], ["PLATFORM_FEE", split.platformFee]] as const) {
      await tx.transaction.create({ data: { contractId: c.id, studentId: c.studentId, clientId: c.clientId, amount, platformFee: type === "PLATFORM_FEE" ? amount : 0, studentPayout: type === "PAYOUT_RELEASE" ? amount : 0, type, status: "RELEASED", releasedAt: new Date() } });
    }
    const task = await tx.task.update({ where: { id: c.taskId }, data: { status: "COMPLETED" } });
    const skills = await tx.taskSkill.findMany({ where: { taskId: c.taskId } });
    await tx.skillEvidence.createMany({ data: skills.map(s => ({ studentId: c.studentId, skillId: s.skillId, contractId: c.id, sourceType: "COMPLETION" as const, score: 1, metadata: { taskId: c.taskId, source: "completed_contract" } })) });
    await audit(tx, user.id, "CONTRACT_COMPLETED", "Contract", c.id, { agreedAmount: c.agreedAmount, studentPayout: split.studentPayout, platformFee: split.platformFee, skillEvidence: skills.length, taskId: c.taskId });
    await audit(tx, user.id, "EVIDENCE_RECORDED", "Contract", c.id, { studentId: c.studentId, source: "COMPLETION", skillIds: skills.map(s => s.skillId) });
    const submission = await tx.submission.findFirst({ where: { contractId: c.id, status: "APPROVED" }, orderBy: { submittedAt: "desc" } });
    if (!submission) throw new Error("No approved submission available for completed work");
    await tx.portfolioItem.create({ data: {
      studentId: c.studentId, contractId: c.id, title: task.title,
      description: `${task.description}\n\n${submission.description}`,
      url: submission.externalLinks[0] ?? submission.fileUrls[0] ?? `/contracts/${c.id}`,
      isDemo: c.isDemo, skills: { connect: skills.map(s => ({ id: s.skillId })) },
    } });
    await notify(tx, c.studentId, c.id, "Sandbox payment released", "Contract complete. Your completed work now backs your skill evidence.");
    return tx.contract.findUniqueOrThrow({ where: { id: c.id } });
  });
}
const rating = z.number().int().min(1).max(5);
const reviewSchema = z.object({ contractId: id, rating, qualityRating: rating, communicationRating: rating, timelinessRating: rating, comment: text.max(3000) });
export async function reviewContract(actorId: string, input: unknown) {
  const data = reviewSchema.parse(input);
  return authorized(actorId, ["CLIENT", "STUDENT"], async (tx, user) => {
    const c = await ownedContract(tx, data.contractId, user.id);
    if (c.status !== "COMPLETED") throw new Error("Only completed contracts can be reviewed");
    if (await tx.review.findUnique({ where: { contractId_reviewerId: { contractId: c.id, reviewerId: user.id } } })) throw new Error("You have already reviewed this contract");
    const revieweeId = user.id === c.clientId ? c.studentId : c.clientId;
    const review = await tx.review.create({ data: { ...data, reviewerId: user.id, revieweeId } });
    await audit(tx, user.id, "REVIEW_CREATED", "Review", review.id, { contractId: c.id, revieweeId, rating: data.rating, qualityRating: data.qualityRating });
    if (user.id === c.clientId) {
      const skills = await tx.taskSkill.findMany({ where: { taskId: c.taskId } });
      await tx.skillEvidence.createMany({ data: skills.map(s => ({ studentId: c.studentId, skillId: s.skillId, contractId: c.id, sourceType: "REVIEW" as const, score: data.qualityRating / 5, metadata: { reviewId: review.id, rating: data.rating } })) });
    }
    await notify(tx, revieweeId, c.id, "New contract review", "A participant reviewed your completed contract.");
    return review;
  });
}

const basicProfile = z.object({ name: text.max(120), city: text.max(120) });
const studentProfile = basicProfile.extend({ college: text.max(200), degree: text.max(120), year: z.number().int().min(1).max(10), bio: z.string().trim().max(3000).default(""), weeklyHours: z.number().int().min(0).max(168), workMode, skillIds: skillIds.default([]) });
const clientProfile = basicProfile.extend({ organizationName: text.max(200), organizationType: text.max(100), description: z.string().trim().max(3000).default(""), website: z.union([httpUrl, z.literal("")]).optional() });
export async function updateProfile(actorId: string, input: unknown) {
  return authorized(actorId, ["STUDENT", "CLIENT"], async (tx, user) => {
    if (user.role === "STUDENT") {
      const { name, skillIds: skills, ...profile } = studentProfile.parse(input);
      await validateSkills(tx, skills);
      const before = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, studentProfile: true } });
      await tx.user.update({ where: { id: user.id }, data: { name } });
      await tx.studentProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...profile }, update: profile });
      await tx.studentSkill.deleteMany({ where: { userId: user.id, skillId: { notIn: skills } } });
      await tx.studentSkill.createMany({ data: skills.map(skillId => ({ userId: user.id, skillId })), skipDuplicates: true });
      await auditProfileChange(tx, user.id, user.role,
        { name: before.name, college: before.studentProfile?.college ?? "", degree: before.studentProfile?.degree ?? "", year: before.studentProfile?.year ?? "" },
        { name, college: profile.college, degree: profile.degree, year: profile.year });
    } else {
      const { name, website, ...profile } = clientProfile.parse(input);
      const before = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, clientProfile: true } });
      await tx.user.update({ where: { id: user.id }, data: { name } });
      const data = { ...profile, website: website || null };
      await tx.clientProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
      await auditProfileChange(tx, user.id, user.role,
        { name: before.name, organizationName: before.clientProfile?.organizationName ?? "" },
        { name, organizationName: profile.organizationName });
    }
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, role: true, studentProfile: true, clientProfile: true } });
  });
}
export async function toggleBookmark(actorId: string, taskId: string) {
  return authorized(actorId, ["STUDENT"], async (tx, user) => {
    await tx.task.findUniqueOrThrow({ where: { id: id.parse(taskId) } });
    const where = { userId_taskId: { userId: user.id, taskId } };
    if (await tx.bookmark.findUnique({ where })) { await tx.bookmark.delete({ where }); return; }
    return tx.bookmark.create({ data: { userId: user.id, taskId } });
  });
}
export async function markNotificationsRead(actorId: string) {
  await authorized(actorId, ["STUDENT", "CLIENT", "ADMIN"], async (tx, user) => tx.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }));
}
export async function sendMessage(actorId: string, contractId: string, body: string) {
  const message = text.parse(body);
  return authorized(actorId, ["STUDENT", "CLIENT"], async (tx, user) => {
    const c = await ownedContract(tx, contractId, user.id);
    const result = await tx.message.create({ data: { contractId: c.id, senderId: user.id, body: message } });
    await notify(tx, user.id === c.clientId ? c.studentId : c.clientId, c.id, "New contract message", "A participant sent you a message.");
    return result;
  });
}
export async function reportTask(actorId: string, taskId: string, reason: string) {
  const description = text.parse(reason);
  return authorized(actorId, ["STUDENT", "CLIENT"], async (tx, user) => {
    const task = await tx.task.findUniqueOrThrow({ where: { id: id.parse(taskId) } });
    return tx.report.create({ data: { reporterId: user.id, taskId: task.id, reason: description.slice(0, 200), description } });
  });
}
export async function openDispute(actorId: string, contractId: string, reason: string) {
  const description = text.parse(reason);
  return authorized(actorId, ["STUDENT", "CLIENT"], async (tx, user) => {
    const c = await ownedContract(tx, contractId, user.id);
    await transition(tx, c, "DISPUTE");
    const dispute = await tx.dispute.create({ data: { contractId: c.id, openedById: user.id, reason: description.slice(0, 200), description } });
    await audit(tx, user.id, "DISPUTE_OPENED", "Dispute", dispute.id, { contractId: c.id, actorRole: user.role });
    await notify(tx, user.id === c.clientId ? c.studentId : c.clientId, c.id, "Contract disputed", "Work and sandbox payment are frozen pending admin review.");
    return dispute;
  });
}
async function audit(tx: Tx, actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
}
// Identity-critical profile edits are recorded so a later verification decision can
// be reviewed against what actually changed. Previous values are not logged.
async function auditProfileChange(tx: Tx, userId: string, role: string, previous: Record<string, string | number>, next: Record<string, string | number>) {
  const changedFields = Object.keys(next).filter((key) => String(previous[key] ?? "") !== String(next[key] ?? ""));
  if (changedFields.length) await audit(tx, userId, "PROFILE_UPDATED", "User", userId, { role, changedFields });
}
export async function moderateTaskAdmin(actorId: string, taskId: string, action: "cancel" | "reopen") {
  z.enum(["cancel", "reopen"]).parse(action);
  return authorized(actorId, ["ADMIN"], async (tx, user) => {
    const task = await tx.task.findUniqueOrThrow({ where: { id: id.parse(taskId) } });
    const result = await tx.task.updateMany({ where: { id: task.id, status: action === "cancel" ? { in: ["OPEN", "DRAFT"] } : "CANCELLED", contract: { is: null } }, data: { status: action === "cancel" ? "CANCELLED" : "OPEN" } });
    if (!result.count) throw new Error("Cannot moderate this task state; contracted work requires dispute resolution");
    await audit(tx, user.id, `TASK_${action.toUpperCase()}`, "Task", task.id, { previousStatus: task.status });
    return tx.task.findUniqueOrThrow({ where: { id: task.id } });
  });
}
export async function setUserActiveAdmin(actorId: string, userId: string, active: boolean) {
  const value = z.boolean().parse(active);
  return authorized(actorId, ["ADMIN"], async (tx, user) => {
    if (user.id === userId && !value) throw new Error("You cannot disable your own admin account");
    const target = await tx.user.update({ where: { id: id.parse(userId) }, data: { isActive: value }, select: { id: true, role: true, isActive: true } });
    await audit(tx, user.id, "USER_ACTIVE", "User", target.id, { active: value });
    return target;
  });
}
export async function resolveDispute(actorId: string, disputeId: string, resolution: string) {
  const notes = text.parse(resolution);
  return authorized(actorId, ["ADMIN"], async (tx, user) => {
    const d = await tx.dispute.findUniqueOrThrow({ where: { id: id.parse(disputeId) }, include: { contract: true } });
    const changed = await tx.dispute.updateMany({ where: { id: d.id, status: { in: ["OPEN", "UNDER_REVIEW"] } }, data: { status: "RESOLVED", resolution: notes, adminNotes: notes } });
    if (!changed.count) throw new Error("Dispute is already resolved");
    const c = d.contract;
    if (!(await tx.contract.updateMany({ where: { id: c.id, status: "DISPUTED" }, data: { status: "CANCELLED" } })).count) throw new Error("Contract is not disputed");
    if (!(await tx.transaction.updateMany({ where: { contractId: c.id, type: "ESCROW_FUND", status: "ESCROWED", amount: c.agreedAmount }, data: { status: "REFUNDED", releasedAt: new Date() } })).count) throw new Error("Sandbox escrow is unavailable");
    await tx.transaction.create({ data: { contractId: c.id, clientId: c.clientId, studentId: c.studentId, amount: c.agreedAmount, studentPayout: 0, platformFee: 0, type: "REFUND", status: "REFUNDED", releasedAt: new Date() } });
    await tx.task.update({ where: { id: c.taskId }, data: { status: "CANCELLED" } });
    await audit(tx, user.id, "DISPUTE_REFUND", "Dispute", d.id, { contractId: c.id, resolution: notes });
    await notify(tx, c.clientId, c.id, "Dispute resolved", "Sandbox escrow was refunded. " + notes);
    await notify(tx, c.studentId, c.id, "Dispute resolved", "Contract cancelled after admin review. " + notes);
    return tx.dispute.findUniqueOrThrow({ where: { id: d.id } });
  });
}