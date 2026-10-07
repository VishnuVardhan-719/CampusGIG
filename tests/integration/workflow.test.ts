import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import * as service from "../../src/server/services";
import { MAX_REVISION_COUNT, contractScopeSchema } from "../../src/lib/domain";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) throw new Error("Integration tests require an explicitly configured local database");
// Refuse the shared demo database outright. An interrupted run once left fixture accounts
// visible on the public rankings board, so these tests only ever write to a throwaway one.
if (await db.user.count({ where: { email: { endsWith: "@campusgig.demo" } } }) > 0) {
  throw new Error("Integration tests refused: this database holds demo accounts. Run `npm run test:integration`, which uses a throwaway database.");
}

// Reads the message a rejected write produced, so a constraint test fails loudly if the
// database accepted state it should have refused (message comes back null).
async function rejectionMessage(promise: Promise<unknown>): Promise<string | null> {
  try { await promise; return null; }
  catch (error) {
    if (!(error instanceof Error)) return String(error);
    return `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}`;
  }
}

describe("server-authorized sandbox workflow", () => {
  const users: string[] = [];
  let client: string, student: string, stranger: string, admin: string, skill: string;
  const taskInput = () => ({ title: "Build a landing page", description: "Create an accessible landing page for a local community project.", category: "Web", difficulty: "BEGINNER", budgetMin: 100000, budgetMax: 300000, deadline: new Date(Date.now() + 7 * 86400000), estimatedHours: 5, workMode: "REMOTE", skillIds: [skill] });
  async function task() { return service.createTask(client, taskInput()); }
  async function application(taskId: string, actor = student) { return service.applyToTask(actor, { taskId, proposal: "I can deliver an accessible and tested landing page.", estimatedHours: 5, proposedPrice: 300000 }); }
  async function contract() { const t = await task(); const a = await application(t.id); return service.hireApplicant(client, a.id); }
  async function submitted() { const c = await contract(); await service.startContract(student, c.id); await service.submitWork(student, { contractId: c.id, description: "Completed the responsive landing page.", externalLinks: ["https://example.com/work"] }); return c; }
  async function completed() { const c = await submitted(); await service.approveSubmission(client, c.id); await service.releasePayment(client, c.id); return c; }
  beforeAll(async () => {
    for (const role of ["CLIENT", "STUDENT", "STUDENT", "ADMIN"] as const) {
      const u = await db.user.create({ data: { name: "Integration fixture", email: `${randomUUID()}@integration.invalid`, passwordHash: "not-a-login", role } }); users.push(u.id);
    }
    [client, student, stranger, admin] = users;
    skill = (await db.skill.create({ data: { name: `Integration ${randomUUID()}`, category: "Web" } })).id;
  });
  afterAll(async () => {
    const tasks = await db.task.findMany({ where: { clientId: { in: users } }, select: { id: true } });
    const taskIds = tasks.map(t => t.id);
    const contracts = await db.contract.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } });
    const contractIds = contracts.map(c => c.id);
    await db.$transaction(async tx => {
      await tx.portfolioItem.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.skillEvidence.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.review.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.transaction.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.submission.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.message.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.dispute.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.attachment.deleteMany({ where: { contractId: { in: contractIds } } });
      await tx.contract.deleteMany({ where: { id: { in: contractIds } } });
      await tx.application.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.report.deleteMany({ where: { reporterId: { in: users } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
      if (skill) await tx.skill.delete({ where: { id: skill } });
    });
  });

  it("completes revision workflow once with balanced payment and traceable skill evidence", async () => {
    const c = await submitted();
    expect.soft(await db.notification.count({ where: { userId: client, title: "Application received", href: `/tasks/${c.taskId}` } })).toBe(1);
    await service.requestRevision(client, c.id, "Please improve mobile layout.");
    await expect(service.submitWork(student, { contractId: c.id, description: "Updated mobile layout", externalLinks: [] })).rejects.toThrow();
    await service.startContract(student, c.id);
    await service.submitWork(student, { contractId: c.id, description: "Updated mobile layout", externalLinks: ["https://example.com/revision"] });
    await service.approveSubmission(client, c.id);
    await service.releasePayment(client, c.id);
    await service.releasePayment(client, c.id);
    const saved = await db.contract.findUniqueOrThrow({ where: { id: c.id }, include: { task: true, transactions: true, evidence: true, submissions: true, portfolioItems: { include: { skills: true } } } });
    expect(saved.status).toBe("COMPLETED"); expect(saved.task.status).toBe("COMPLETED");
    expect(saved.transactions.filter(t => t.type === "PAYOUT_RELEASE")).toHaveLength(1);
    expect(saved.transactions.find(t => t.type === "PAYOUT_RELEASE")?.amount).toBe(285000);
    expect(saved.transactions.find(t => t.type === "PLATFORM_FEE")?.amount).toBe(15000);
    expect(saved.evidence).toHaveLength(1); expect(saved.evidence[0]).toMatchObject({ studentId: student, skillId: skill, contractId: c.id, sourceType: "COMPLETION", isDemo: false });
    expect(saved.submissions.map(s => s.status).sort()).toEqual(["APPROVED", "REVISION_REQUESTED"]);
    expect(saved.portfolioItems).toHaveLength(1);
    expect(saved.portfolioItems[0]).toMatchObject({ studentId: student, contractId: c.id, title: saved.task.title, url: "https://example.com/revision", isDemo: false });
    expect(saved.portfolioItems[0].description).toContain(saved.task.description);
    expect(saved.portfolioItems[0].description).toContain("Updated mobile layout");
    expect(saved.portfolioItems[0].skills.map(s => s.id)).toEqual([skill]);
  });
  it("enforces the one-revision allowance on the server without leaving partial state", async () => {
    const c = await submitted();
    await service.requestRevision(client, c.id, "Please shorten the hero section and fix the footer spacing.");
    expect((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).revisionCount).toBe(MAX_REVISION_COUNT);
    expect(await db.auditLog.count({ where: { action: "REVISION_REQUESTED", entityId: c.id } })).toBe(1);
    await service.startContract(student, c.id);
    await service.submitWork(student, { contractId: c.id, description: "Second version with the requested changes.", externalLinks: ["https://example.com/v2"] });
    await expect(service.requestRevision(client, c.id, "One more pass please.")).rejects.toThrow(/revision limit/i);
    const after = await db.contract.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status).toBe("SUBMITTED");
    expect(after.revisionCount).toBe(MAX_REVISION_COUNT);
    expect(await db.submission.count({ where: { contractId: c.id, status: "REVISION_REQUESTED" } })).toBe(1);
    expect(await db.submission.count({ where: { contractId: c.id, status: "PENDING" } })).toBe(1);
    // The client can still accept the work; only unlimited rework is blocked.
    await service.approveSubmission(client, c.id);
    await service.releasePayment(client, c.id);
    expect((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("COMPLETED");
  });
  it("freezes the agreed brief so a later task edit cannot rewrite the contract", async () => {
    const c = await contract();
    const frozen = contractScopeSchema.parse(c.scopeSnapshot);
    expect(frozen).toMatchObject({ title: "Build a landing page", category: "Web", difficulty: "BEGINNER", budgetMin: 100000, budgetMax: 300000, estimatedHours: 5, workMode: "REMOTE", revisionAllowance: MAX_REVISION_COUNT });
    expect(frozen.requiredSkills).toEqual([(await db.skill.findUniqueOrThrow({ where: { id: skill } })).name]);
    expect(Math.abs(Date.now() - Date.parse(frozen.capturedAt))).toBeLessThan(60_000);
    await db.task.update({ where: { id: c.taskId }, data: { title: "A completely different brief", description: "Scope creep attempt", budgetMin: 1, budgetMax: 5000000, estimatedHours: 99 } });
    const reread = contractScopeSchema.parse((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).scopeSnapshot);
    expect(reread).toEqual(frozen);
  });
  it("records an auditable trail across the core workflow", async () => {
    const c = await completed();
    await service.reviewContract(client, { contractId: c.id, rating: 5, qualityRating: 5, communicationRating: 4, timelinessRating: 5, comment: "Clear handoff and timely delivery." });
    const rows = await db.auditLog.findMany({ where: { actorId: { in: [client, student] } }, select: { action: true, actorId: true, entityId: true, metadata: true } });
    const trail = rows.filter(entry => entry.entityId === c.id || (entry.metadata as { contractId?: string } | null)?.contractId === c.id);
    const actions = new Set(trail.map(entry => entry.action));
    for (const expected of ["CONTRACT_CREATED", "SUBMISSION_SUBMITTED", "SUBMISSION_APPROVED", "CONTRACT_COMPLETED", "EVIDENCE_RECORDED", "REVIEW_CREATED"]) {
      expect(actions.has(expected), `missing audit action ${expected}`).toBe(true);
    }
    expect(trail.find(entry => entry.action === "CONTRACT_CREATED")?.metadata).toMatchObject({ agreedAmount: 300000, revisionAllowance: MAX_REVISION_COUNT });
    expect(trail.find(entry => entry.action === "CONTRACT_COMPLETED")?.metadata).toMatchObject({ agreedAmount: 300000, studentPayout: 285000, platformFee: 15000, skillEvidence: 1 });
    expect(trail.filter(entry => entry.action === "CONTRACT_CREATED")).toHaveLength(1);
  });
  it("refuses state the database guardrails forbid, even through a raw write", async () => {
    const c = await contract();
    const overLimit = await rejectionMessage(db.contract.update({ where: { id: c.id }, data: { revisionCount: MAX_REVISION_COUNT + 1 } }));
    expect(overLimit).toMatch(/Contract_revisionCount_within_limit/);
    const unbalanced = await rejectionMessage(db.transaction.create({ data: { contractId: c.id, clientId: client, studentId: student, amount: 100000, platformFee: 100000, studentPayout: 1, type: "REFUND", status: "REFUNDED" } }));
    expect(unbalanced).toMatch(/Transaction_row_shape/);
    const inflatedRating = await rejectionMessage(db.review.create({ data: { contractId: c.id, reviewerId: client, revieweeId: student, rating: 9, qualityRating: 5, communicationRating: 5, timelinessRating: 5, comment: "Synthetic constraint probe" } }));
    expect(inflatedRating).toMatch(/Review_ratings_in_range/);
    const inventedEvidence = await rejectionMessage(db.skillEvidence.create({ data: { studentId: student, skillId: skill, contractId: c.id, sourceType: "COMPLETION", score: 42 } }));
    expect(inventedEvidence).toMatch(/SkillEvidence_score_fraction/);
    const impossibleTask = await rejectionMessage(db.task.update({ where: { id: c.taskId }, data: { estimatedHours: 0 } }));
    expect(impossibleTask).toMatch(/Task_estimatedHours_positive/);
  });
  it("rechecks active state and rejects role spoofing", async () => {
    await expect(service.createTask(student, taskInput())).rejects.toThrow();
    await db.user.update({ where: { id: stranger }, data: { isActive: false } });
    await expect(service.getActor(stranger)).rejects.toThrow();
    await expect(service.markNotificationsRead(stranger)).rejects.toThrow();
    await db.user.update({ where: { id: stranger }, data: { isActive: true } });
  });
  it("validates task money, enums, deadlines, skill IDs and moderation", async () => {
    for (const invalid of [{ budgetMax: 1 }, { budgetMin: 1.5 }, { difficulty: "FAKE" }, { deadline: new Date(0) }, { skillIds: ["missing"] }, { description: "Please complete my graded assignment for me." }]) await expect(service.createTask(client, { ...taskInput(), ...invalid })).rejects.toThrow();
  });
  it("requires at least one skill so completed work always has skill evidence", async () => {
    await expect(service.createTask(client, { ...taskInput(), skillIds: [] })).rejects.toThrow();
  });
  it("concurrent release produces one payout and rollback preserves approval when escrow is missing", async () => {
    const c = await submitted(); await service.approveSubmission(client, c.id);
    await db.transaction.deleteMany({ where: { contractId: c.id, type: "ESCROW_FUND" } });
    await expect(service.releasePayment(client, c.id)).rejects.toThrow("escrow");
    expect((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("APPROVED");
    expect((await db.task.findUniqueOrThrow({ where: { id: c.taskId } })).status).toBe("SUBMITTED");
    expect(await db.skillEvidence.count({ where: { contractId: c.id } })).toBe(0);
    expect(await db.transaction.count({ where: { contractId: c.id } })).toBe(0);
    await db.transaction.create({ data: { contractId: c.id, clientId: client, studentId: student, amount: 300000, platformFee: 15000, studentPayout: 285000, type: "ESCROW_FUND", status: "ESCROWED" } });
    const results = await Promise.all([service.releasePayment(client, c.id), service.releasePayment(client, c.id)]);
    expect(results.every(r => r.status === "COMPLETED")).toBe(true);
    expect(await db.transaction.count({ where: { contractId: c.id, type: "PAYOUT_RELEASE" } })).toBe(1);
    expect(await db.skillEvidence.count({ where: { contractId: c.id } })).toBe(1);
  });
  it("allows one application per student, only to open tasks and within budget", async () => {
    const t = await task(); const a = await application(t.id);
    expect(a.matchScore).toBeTypeOf("number"); expect(a.matchExplanation).toBeTruthy();
    await expect(application(t.id)).rejects.toThrow();
    await expect(service.applyToTask(stranger, { taskId: t.id, proposal: "A detailed valid proposal", estimatedHours: 2, proposedPrice: 400000 })).rejects.toThrow();
    await service.hireApplicant(client, a.id); await expect(application(t.id, stranger)).rejects.toThrow();
  });
  it("atomic hiring selects exactly one applicant and repeat hire returns same contract", async () => {
    const t = await task(); const a = await application(t.id); const b = await application(t.id, stranger);
    const results = await Promise.allSettled([service.hireApplicant(client, a.id), service.hireApplicant(client, b.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toMatchObject({ message: expect.stringMatching(/^(Another applicant has already been hired|Task is no longer open)$/) });
    const c = await db.contract.findUniqueOrThrow({ where: { taskId: t.id } });
    expect((await service.hireApplicant(client, c.applicationId)).id).toBe(c.id);
    expect(await db.transaction.count({ where: { contractId: c.id, type: "ESCROW_FUND" } })).toBe(1);
  });
  it("denies cross-user contract writes and premature payment/review", async () => {
    const c = await contract();
    await expect(service.startContract(stranger, c.id)).rejects.toThrow();
    await expect(service.startContract(client, c.id)).rejects.toThrow();
    await expect(service.releasePayment(client, c.id)).rejects.toThrow();
    await expect(service.approveSubmission(stranger, c.id)).rejects.toThrow();
    await expect(service.sendMessage(stranger, c.id, "Hello")).rejects.toThrow();
    await expect(service.reviewContract(client, { contractId: c.id, rating: 5, qualityRating: 5, communicationRating: 5, timelinessRating: 5, comment: "Great work" })).rejects.toThrow();
  });
  it("rejects executable links and forged or cross-user attachments", async () => {
    const c = await contract(); await service.startContract(student, c.id);
    await expect(service.submitWork(student, { contractId: c.id, description: "Finished work", externalLinks: ["javascript:alert(1)"] })).rejects.toThrow();
    await expect(service.submitWork(student, { contractId: c.id, description: "Finished work", externalLinks: [], fileUrls: [`/api/uploads/${randomUUID()}`] })).rejects.toThrow();
    const attachment = await db.attachment.create({ data: { userId: stranger, contractId: c.id, originalName: "test.pdf", mimeType: "application/pdf", size: 10, storageKey: randomUUID() } });
    await expect(service.submitWork(student, { contractId: c.id, description: "Finished work", externalLinks: [], fileUrls: [`/api/uploads/${attachment.id}`] })).rejects.toThrow();
    await db.attachment.update({ where: { id: attachment.id }, data: { userId: student } });
    await service.submitWork(student, { contractId: c.id, description: "Finished work", externalLinks: [], fileUrls: [`/api/uploads/${attachment.id}`] });
  });
  it("allows one review per completed participant with client-only review evidence", async () => {
    const c = await completed(); const input = { contractId: c.id, rating: 5, qualityRating: 4, communicationRating: 5, timelinessRating: 5, comment: "Excellent accessible delivery" };
    await expect(service.reviewContract(stranger, input)).rejects.toThrow();
    await expect(service.reviewContract(client, { ...input, rating: 6 })).rejects.toThrow();
    await service.reviewContract(client, input); await expect(service.reviewContract(client, input)).rejects.toThrow();
    await service.reviewContract(student, input);
    expect(await db.skillEvidence.count({ where: { contractId: c.id, sourceType: "REVIEW", studentId: student } })).toBe(1);
  });
  it("updates only permitted profile fields and validates skill references", async () => {
    await service.updateProfile(student, { name: "Updated student", college: "Test college", degree: "BSc", year: 2, bio: "Learning web design", city: "Pune", weeklyHours: 12, workMode: "REMOTE", skillIds: [skill, skill], role: "ADMIN", isActive: false, verificationStatus: "VERIFIED" });
    const u = await db.user.findUniqueOrThrow({ where: { id: student }, include: { skills: true, studentProfile: true } });
    expect(u.role).toBe("STUDENT"); expect(u.isActive).toBe(true); expect(u.verificationStatus).toBe("UNVERIFIED"); expect(u.skills).toHaveLength(1);
    await expect(service.updateProfile(student, { name: "Valid", college: "Test", degree: "BSc", year: 1, city: "Pune", weeklyHours: 1, workMode: "REMOTE", skillIds: ["missing"] })).rejects.toThrow();
    await service.updateProfile(client, { name: "Updated client", organizationName: "Test org", organizationType: "Startup", city: "Pune", website: "https://example.com", description: "Client bio" });
    await service.updateProfile(client, { name: "Updated client", organizationName: "Test org", organizationType: "Startup", city: "Pune", website: "https://example.com", description: "Client bio" });
    // Identity-relevant edits are audited; an unchanged resave records nothing new.
    const identityAudits = await db.auditLog.findMany({ where: { actorId: student, action: "PROFILE_UPDATED" }, select: { metadata: true } });
    expect(identityAudits).toHaveLength(1);
    expect(identityAudits[0].metadata).toMatchObject({ role: "STUDENT" });
    expect(await db.auditLog.count({ where: { actorId: client, action: "PROFILE_UPDATED" } })).toBe(1);
  });
  it("persists bookmarks, messages, reports and notification read tracking", async () => {
    const c = await contract();
    await service.toggleBookmark(student, c.taskId); expect(await db.bookmark.count({ where: { userId: student, taskId: c.taskId } })).toBe(1);
    await service.toggleBookmark(student, c.taskId); expect(await db.bookmark.count({ where: { userId: student, taskId: c.taskId } })).toBe(0);
    expect((await service.sendMessage(student, c.id, "Ready to begin")).senderId).toBe(student);
    expect((await service.reportTask(student, c.taskId, "Potentially misleading task details")).status).toBe("OPEN");
    await service.markNotificationsRead(student); expect(await db.notification.count({ where: { userId: student, readAt: null } })).toBe(0);
  });
  it("restricts admin moderation and audits state changes without reopening contracted tasks", async () => {
    const t = await task(); await expect(service.moderateTaskAdmin(student, t.id, "cancel")).rejects.toThrow();
    expect((await service.moderateTaskAdmin(admin, t.id, "cancel")).status).toBe("CANCELLED");
    expect((await service.moderateTaskAdmin(admin, t.id, "reopen")).status).toBe("OPEN");
    await expect(service.setUserActiveAdmin(client, stranger, false)).rejects.toThrow();
    await service.setUserActiveAdmin(admin, stranger, false); await expect(service.getActor(stranger)).rejects.toThrow(); await service.setUserActiveAdmin(admin, stranger, true);
    const c = await contract(); await expect(service.moderateTaskAdmin(admin, c.taskId, "cancel")).rejects.toThrow();
    expect(await db.auditLog.count({ where: { actorId: admin } })).toBeGreaterThanOrEqual(4);
  });
  it("freezes disputed contracts and resolves sandbox escrow through an audited admin refund", async () => {
    const c = await contract(); await service.startContract(student, c.id);
    await expect(service.openDispute(stranger, c.id, "Issue with work requirements")).rejects.toThrow();
    const dispute = await service.openDispute(student, c.id, "Issue with work requirements");
    await expect(service.submitWork(student, { contractId: c.id, description: "Work complete", externalLinks: [] })).rejects.toThrow();
    await expect(service.resolveDispute(client, dispute.id, "Refund client")).rejects.toThrow();
    await service.resolveDispute(admin, dispute.id, "Refund client");
    expect((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
    expect(await db.transaction.count({ where: { contractId: c.id, type: "REFUND", amount: 300000 } })).toBe(1);
    expect(await db.skillEvidence.count({ where: { contractId: c.id } })).toBe(0);
  });
});