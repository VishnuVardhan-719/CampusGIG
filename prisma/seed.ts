import "dotenv/config";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { buildContractScope } from "../src/lib/domain";
import type { Prisma } from "../src/generated/prisma/client";
import { ContractStatus, TaskStatus, WorkMode, Difficulty } from "../src/generated/prisma/enums";

export const DEMO_PASSWORD = "CampusGig@2026";
const createdAt = new Date("2026-10-01T09:00:00.000Z");
const completedAt = new Date("2026-10-01T12:00:00.000Z");
const deadline = new Date("2026-11-15T18:00:00.000Z");
const demoLabel = "Synthetic demo fixture; not real paid work or institutional verification.";

const skills = [
  ["react", "React", "Development"], ["typescript", "TypeScript", "Development"],
  ["python", "Python", "Development"], ["figma", "Figma", "Design"],
  ["design", "Graphic design", "Design"], ["video", "Video editing", "Media"],
  ["writing", "Content writing", "Writing"], ["excel", "Excel", "Data"],
  ["photo", "Photography", "Media"], ["social", "Social media", "Marketing"],
  ["slides", "Presentation design", "Design"], ["research", "Research", "Research"],
] as const;

const students = [
  { name: "Aarav Sharma", college: "Demo Institute of Technology", degree: "B.Tech Computer Science", city: "Bengaluru", skills: ["react", "typescript", "figma"] },
  { name: "Meera Iyer", college: "Demo Arts College", degree: "B.Des Communication Design", city: "Chennai", skills: ["design", "figma", "slides"] },
  { name: "Kabir Khan", college: "Demo Engineering College", degree: "B.Tech Information Technology", city: "Hyderabad", skills: ["python", "excel", "research"] },
  { name: "Ananya Rao", college: "Demo Media College", degree: "B.A. Media Studies", city: "Pune", skills: ["video", "photo", "social"] },
  { name: "Rohan Patel", college: "Demo Design Institute", degree: "B.Des Interaction Design", city: "Mumbai", skills: ["figma", "design", "react"] },
  { name: "Zoya Ali", college: "Demo Liberal Arts College", degree: "B.A. English", city: "Delhi", skills: ["writing", "research", "social"] },
  { name: "Dev Menon", college: "Demo Science College", degree: "B.Sc. Statistics", city: "Kochi", skills: ["excel", "python", "research"] },
  { name: "Ishita Das", college: "Demo Visual Arts College", degree: "B.A. Photography", city: "Kolkata", skills: ["photo", "video", "design"] },
  { name: "Sahil Gupta", college: "Demo Business College", degree: "B.B.A. Marketing", city: "Jaipur", skills: ["social", "writing", "design"] },
  { name: "Nisha Kulkarni", college: "Demo Commerce College", degree: "B.Com", city: "Pune", skills: ["slides", "excel", "design"] },
] as const;

const clients = [
  ["Priya Nair", "Sprout Labs", "Startup", "Bengaluru"],
  ["Arjun Verma", "Founders Circle", "Student founder", "Delhi"],
  ["Sneha Joshi", "Campus Creative Club", "College club", "Pune"],
  ["Vikram Shah", "Maple Cafe", "Local business", "Mumbai"],
  ["Sara Thomas", "Green Steps", "NGO", "Kochi"],
  ["Aditya Bose", "North Star Events", "Event organizer", "Kolkata"],
] as const;

const taskFixtures = [
  ["Restaurant landing page", "Development", ["react", "typescript"], 250000, 400000, 8, "REMOTE"],
  ["Instagram poster pack", "Design", ["design", "figma"], 100000, 180000, 4, "REMOTE"],
  ["College fest highlight reel", "Media", ["video", "social"], 180000, 300000, 6, "HYBRID"],
  ["Excel donation data cleanup", "Data", ["excel", "research"], 120000, 200000, 5, "REMOTE"],
  ["College fest website accessibility fix", "Development", ["react", "typescript"], 200000, 350000, 7, "REMOTE"],
  ["Cafe logo redesign", "Design", ["design", "figma"], 150000, 250000, 6, "REMOTE"],
  ["Python inventory automation", "Development", ["python", "excel"], 300000, 500000, 10, "REMOTE"],
  ["Cafe product photography", "Media", ["photo", "design"], 200000, 320000, 5, "ONSITE"],
  ["YouTube thumbnail set", "Design", ["design", "figma"], 80000, 150000, 3, "REMOTE"],
  ["Investor presentation redesign", "Design", ["slides", "design"], 250000, 450000, 8, "REMOTE"],
  ["NGO social media calendar", "Marketing", ["social", "writing"], 180000, 280000, 6, "REMOTE"],
  ["Founder portfolio website", "Development", ["react", "figma"], 350000, 550000, 12, "REMOTE"],
  ["Volunteer onboarding handbook", "Writing", ["writing", "research"], 150000, 250000, 6, "REMOTE"],
  ["Event registration desk support", "Events", ["excel", "social"], 120000, 180000, 6, "ONSITE"],
  ["Customer survey summary", "Research", ["research", "excel"], 200000, 300000, 8, "REMOTE"],
  ["Student app usability review", "Design", ["figma", "research"], 180000, 300000, 7, "HYBRID"],
  ["Podcast audio and video cut", "Media", ["video", "writing"], 200000, 350000, 8, "REMOTE"],
  ["Cafe menu copy refresh", "Writing", ["writing", "design"], 100000, 180000, 4, "REMOTE"],
  ["Community photo walk coverage", "Media", ["photo", "social"], 220000, 350000, 5, "ONSITE"],
  ["Monthly outreach dashboard", "Data", ["excel", "python"], 280000, 420000, 9, "HYBRID"],
] as const;

assert.equal(students.length, 10);
assert.equal(clients.length, 6);
assert.equal(taskFixtures.length, 20);
assert.equal(new Set(taskFixtures.map((t) => t[0])).size, 20);
for (const [, , required, min, max, hours] of taskFixtures) {
  assert(Number.isInteger(min) && Number.isInteger(max) && min > 0 && max >= min && hours > 0);
  assert(required.every((id) => skills.some((skill) => skill[0] === id)));
}

export const demoStudentId = (index: number) => `demo-student-${index + 1}`;
export const demoClientId = (index: number) => `demo-client-${index + 1}`;
export const demoTaskId = (index: number) => `demo-task-${String(index + 1).padStart(2, "0")}`;

async function seedFixtures(tx: Prisma.TransactionClient, passwordHash: string) {
  for (const [slug, name, category] of skills) {
    await tx.skill.upsert({ where: { id: `demo-skill-${slug}` }, update: {}, create: { id: `demo-skill-${slug}`, name, category } });
  }
  for (const [index, student] of students.entries()) {
    const id = demoStudentId(index);
    await tx.user.upsert({ where: { id }, update: {}, create: {
      id, email: index === 0 ? "student@campusgig.demo" : `student${index + 1}@campusgig.demo`,
      name: student.name, passwordHash, role: "STUDENT", isDemo: true, createdAt,
      studentProfile: { create: {
        college: student.college, degree: student.degree, year: 2 + index % 3,
        bio: `${demoLabel} I enjoy ${student.skills.join(", ")} projects with clear deliverables.`,
        city: student.city, weeklyHours: 8 + index % 5 * 2, workMode: index % 3 === 0 ? "HYBRID" : "REMOTE",
      } },
    } });
    for (const [position, slug] of student.skills.entries()) {
      const skillId = `demo-skill-${slug}`;
      await tx.studentSkill.upsert({ where: { userId_skillId: { userId: id, skillId } }, update: {}, create: { userId: id, skillId, proficiency: position === 0 ? 4 : 3 } });
    }
    await tx.notification.upsert({ where: { id: `demo-notification-student-${index + 1}` }, update: {}, create: {
      id: `demo-notification-student-${index + 1}`, userId: id, title: "Welcome to the CampusGig demo", body: demoLabel, href: "/tasks", createdAt,
    } });
  }
  for (const [index, [name, organizationName, organizationType, city]] of clients.entries()) {
    const id = demoClientId(index);
    await tx.user.upsert({ where: { id }, update: {}, create: {
      id, email: index === 0 ? "client@campusgig.demo" : `client${index + 1}@campusgig.demo`,
      name, passwordHash, role: "CLIENT", isDemo: true, createdAt,
      clientProfile: { create: { organizationName, organizationType, city, description: demoLabel, website: "https://example.com" } },
    } });
    await tx.organization.upsert({ where: { id: `demo-organization-${index + 1}` }, update: {}, create: {
      id: `demo-organization-${index + 1}`, ownerId: id, name: organizationName, type: organizationType, description: demoLabel,
    } });
  }
  await tx.user.upsert({ where: { id: "demo-admin" }, update: {}, create: {
    id: "demo-admin", email: "admin@campusgig.demo", passwordHash, name: "Demo Administrator", role: "ADMIN", isDemo: true, createdAt,
  } });
  for (const [index, [title, category, requiredSkills, budgetMin, budgetMax, estimatedHours, mode]] of taskFixtures.entries()) {
    const id = demoTaskId(index);
    const clientId = demoClientId(index % clients.length);
    const status = index < 4 ? TaskStatus.COMPLETED : index === 4 ? TaskStatus.IN_PROGRESS : index === 5 ? TaskStatus.SUBMITTED : TaskStatus.OPEN;
    const task = await tx.task.upsert({ where: { id }, update: {}, create: {
      id, clientId, title, category, description: `${demoLabel} Deliver ${title.toLowerCase()} with editable source files, a short handoff note, and one revision. No academic assessment work.`,
      budgetMin, budgetMax, estimatedHours, workMode: WorkMode[mode], deadline,
      difficulty: estimatedHours >= 10 ? Difficulty.ADVANCED : estimatedHours >= 6 ? Difficulty.INTERMEDIATE : Difficulty.BEGINNER,
      location: mode === "REMOTE" ? "Remote" : clients[index % clients.length][3], status, isDemo: true, createdAt,
      skills: { create: requiredSkills.map((slug) => ({ skillId: `demo-skill-${slug}` })) },
    }, include: { skills: { include: { skill: true } } } });
    if (index >= 6) continue;
    const studentId = demoStudentId([0, 1, 3, 6, 0, 4][index]);
    const applicationId = `demo-application-${index + 1}`;
    const contractId = `demo-contract-${index + 1}`;
    const agreedAmount = Math.round((budgetMin + budgetMax) / 2);
    const platformFee = Math.round(agreedAmount * 0.05);
    const studentPayout = agreedAmount - platformFee;
    assert.equal(platformFee + studentPayout, agreedAmount);
    await tx.application.upsert({ where: { id: applicationId }, update: {}, create: {
      id: applicationId, taskId: id, studentId, proposal: `${demoLabel} I will share an initial draft and check the acceptance criteria before handoff.`,
      estimatedHours, proposedPrice: agreedAmount, status: "HIRED", createdAt,
    } });
    await tx.contract.upsert({ where: { id: contractId }, update: {}, create: {
      id: contractId, taskId: id, applicationId, studentId, clientId, agreedAmount, deadline,
      status: index < 4 ? ContractStatus.COMPLETED : index === 4 ? ContractStatus.IN_PROGRESS : ContractStatus.SUBMITTED,
      completedAt: index < 4 ? completedAt : null, isDemo: true, createdAt,
      scopeSnapshot: buildContractScope(task, task.skills.map((s) => s.skill.name), createdAt),
    } });
    await tx.transaction.upsert({ where: { contractId_type: { contractId, type: "ESCROW_FUND" } }, update: {}, create: {
      id: `demo-escrow-${index + 1}`, contractId, clientId, studentId, amount: agreedAmount, platformFee, studentPayout,
      type: "ESCROW_FUND", status: "ESCROWED", isDemo: true, createdAt,
    } });
    await tx.message.upsert({ where: { id: `demo-message-${index + 1}` }, update: {}, create: {
      id: `demo-message-${index + 1}`, contractId, senderId: clientId, body: `${demoLabel} Please include the editable sources in your handoff.`, createdAt,
    } });
    if (index === 4) continue;
    await tx.submission.upsert({ where: { id: `demo-submission-${index + 1}` }, update: {}, create: {
      id: `demo-submission-${index + 1}`, contractId, description: `${demoLabel} Example handoff only; example.com is not a real deliverable.`,
      externalLinks: ["https://example.com"], fileUrls: [], status: index < 4 ? "APPROVED" : "PENDING", submittedAt: completedAt,
      reviewedAt: index < 4 ? completedAt : null,
    } });
    if (index >= 4) continue;
    // Same ledger shape the running app produces on release: a payout row carrying the
    // student payout and a separate fee row, so seeded and live ledgers read identically.
    await tx.transaction.upsert({ where: { contractId_type: { contractId, type: "PAYOUT_RELEASE" } }, update: {}, create: {
      id: `demo-release-${index + 1}`, contractId, clientId, studentId, amount: studentPayout, platformFee: 0, studentPayout,
      type: "PAYOUT_RELEASE", status: "RELEASED", isDemo: true, createdAt: completedAt, releasedAt: completedAt,
    } });
    await tx.transaction.upsert({ where: { contractId_type: { contractId, type: "PLATFORM_FEE" } }, update: {}, create: {
      id: `demo-fee-${index + 1}`, contractId, clientId, studentId, amount: platformFee, platformFee, studentPayout: 0,
      type: "PLATFORM_FEE", status: "RELEASED", isDemo: true, createdAt: completedAt, releasedAt: completedAt,
    } });
    const rating = index % 2 === 0 ? 5 : 4;
    await tx.review.upsert({ where: { contractId_reviewerId: { contractId, reviewerId: clientId } }, update: {}, create: {
      id: `demo-review-${index + 1}`, contractId, reviewerId: clientId, revieweeId: studentId, rating,
      qualityRating: rating, communicationRating: 5, timelinessRating: 5,
      comment: `${demoLabel} Example feedback: clear handoff and timely delivery.`, isDemo: true, createdAt: completedAt,
    } });
    await tx.portfolioItem.upsert({ where: { id: `demo-portfolio-${index + 1}` }, update: {}, create: {
      id: `demo-portfolio-${index + 1}`, studentId, contractId, title: `${title} (synthetic demo)`, description: demoLabel,
      url: `/contracts/${contractId}`, isDemo: true, createdAt: completedAt,
      skills: { connect: requiredSkills.map((slug) => ({ id: `demo-skill-${slug}` })) },
    } });
    for (const slug of requiredSkills) {
      const skillId = `demo-skill-${slug}`;
      for (const sourceType of ["COMPLETION", "REVIEW"] as const) {
        await tx.skillEvidence.upsert({
          where: { studentId_skillId_contractId_sourceType: { studentId, skillId, contractId, sourceType } }, update: {},
          create: {
            id: `demo-evidence-${index + 1}-${slug}-${sourceType.toLowerCase()}`,
            studentId, skillId, contractId, sourceType, score: sourceType === "COMPLETION" ? 1 : rating / 5,
            isDemo: true, metadata: { label: demoLabel, sandboxPayment: true }, createdAt: completedAt,
          },
        });
      }
    }
  }
  for (const index of [6, 11]) {
    await tx.bookmark.upsert({ where: { userId_taskId: { userId: demoStudentId(0), taskId: demoTaskId(index) } }, update: {}, create: {
      userId: demoStudentId(0), taskId: demoTaskId(index), createdAt,
    } });
  }
  await tx.auditLog.upsert({ where: { id: "demo-audit-seed" }, update: {}, create: {
    id: "demo-audit-seed", actorId: "demo-admin", action: "DEMO_FIXTURES_CREATED", entityType: "Demo", entityId: "campusgig-demo-v1", metadata: { label: demoLabel }, createdAt,
  } });
  assert.equal(await tx.user.count({ where: { id: { in: [...students.map((_, i) => demoStudentId(i)), ...clients.map((_, i) => demoClientId(i)), "demo-admin"] } } }), 17);
  assert.equal(await tx.task.count({ where: { id: { in: taskFixtures.map((_, i) => demoTaskId(i)) } } }), 20);
}

export async function seedDemo(tx?: Prisma.TransactionClient) {
  // Fixed salt is only for reproducible, public demo credentials. Signup uses a random salt.
  const passwordHash = await hash(DEMO_PASSWORD, "$2b$10$abcdefghijklmnopqrstuu");
  if (tx) await seedFixtures(tx, passwordHash);
  else await prisma.$transaction((transaction) => seedFixtures(transaction, passwordHash), { maxWait: 10_000, timeout: 120_000 });
  console.log("CampusGig demo seeded: 10 students, 6 clients, 1 admin, 20 tasks. All work evidence is synthetic; payments are sandbox only.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("prisma/seed.ts")) {
  const run = process.argv.includes("--check")
    ? Promise.resolve().then(() => console.log("Demo fixture checks passed: 10 students, 6 clients, 20 distinct tasks; valid integer-paise budgets and skill references. No database writes."))
    : seedDemo();
  run.catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}