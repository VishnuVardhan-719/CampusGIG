import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedDemo, demoStudentId, demoTaskId } from "../prisma/seed";

function requireLocalOptIn() {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true" || process.env.ALLOW_DEMO_RESET !== "true" || !process.argv.includes("--confirm")) {
    throw new Error("Reset refused. Requires non-production DEMO_MODE=true, ALLOW_DEMO_RESET=true, and --confirm.");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Reset refused: DATABASE_URL must explicitly target loopback PostgreSQL.");
  }
  if ([...url.searchParams.keys()].some((key) => ["host", "hostaddr", "service", "options"].includes(key.toLowerCase()))) {
    throw new Error("Reset refused: database host override parameters are not allowed.");
  }
}

async function resetDemo() {
  requireLocalOptIn();
  const fixture = { id: { startsWith: "demo-" } };
  const taskIds = Array.from({ length: 20 }, (_, i) => demoTaskId(i));
  // Reset only fixture work. Preserve accounts, profiles, claimed skills and non-fixture rows.
  await prisma.$transaction(async (tx) => {
    await tx.skillEvidence.deleteMany({ where: fixture });
    await tx.portfolioItem.deleteMany({ where: fixture });
    await tx.review.deleteMany({ where: fixture });
    await tx.transaction.deleteMany({ where: fixture });
    await tx.message.deleteMany({ where: fixture });
    await tx.submission.deleteMany({ where: fixture });
    await tx.auditLog.deleteMany({ where: fixture });
    await tx.notification.deleteMany({ where: fixture });
    await tx.contract.deleteMany({ where: fixture });
    await tx.application.deleteMany({ where: fixture });
    await tx.bookmark.deleteMany({ where: { userId: demoStudentId(0), taskId: { in: [demoTaskId(6), demoTaskId(11)] } } });
    await tx.taskSkill.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });
    await seedDemo(tx);
  }, { maxWait: 10_000, timeout: 120_000 });
}

resetDemo().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());