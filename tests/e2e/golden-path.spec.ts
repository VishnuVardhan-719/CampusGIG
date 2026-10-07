import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/lib/db";

const fixturePrefix = "Golden demo poster";

// This suite signs in as the seeded demo accounts and drives a real contract, so the rows
// it creates are removed again and residue from an interrupted run is swept first. The
// demo database has to look exactly as `npm run seed` left it: seeded completed work must
// not grow every time someone runs the browser test.
async function removeDemoRunFixtures(): Promise<number> {
  const tasks = await db.task.findMany({
    where: { isDemo: false, title: { startsWith: fixturePrefix } },
    select: { id: true, contract: { select: { id: true } } },
  });
  if (!tasks.length) return 0;
  const taskIds = tasks.map(task => task.id);
  const contractIds = tasks.flatMap(task => task.contract ? [task.contract.id] : []);
  const [applications, submissions, reviews] = await Promise.all([
    db.application.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } }),
    db.submission.findMany({ where: { contractId: { in: contractIds } }, select: { id: true } }),
    db.review.findMany({ where: { contractId: { in: contractIds } }, select: { id: true } }),
  ]);
  const auditEntityIds = [...taskIds, ...contractIds, ...applications.map(row => row.id), ...submissions.map(row => row.id), ...reviews.map(row => row.id)];
  await db.$transaction(async tx => {
    await tx.portfolioItem.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.skillEvidence.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.review.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.transaction.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.submission.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.message.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.dispute.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.attachment.deleteMany({ where: { contractId: { in: contractIds } } });
    await tx.notification.deleteMany({ where: { href: { in: [...taskIds.map(id => `/tasks/${id}`), ...contractIds.map(id => `/contracts/${id}`)] } } });
    await tx.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });
    await tx.contract.deleteMany({ where: { id: { in: contractIds } } });
    await tx.application.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.bookmark.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskSkill.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });
  });
  return tasks.length;
}

test.beforeAll(async () => {
  const swept = await removeDemoRunFixtures();
  if (swept) console.log(`[e2e] swept ${swept} task fixture(s) left by an interrupted run`);
});

test.afterAll(async () => {
  const removed = await removeDemoRunFixtures();
  if (removed !== 1) console.log(`[e2e] cleaned up ${removed} task fixture(s)`);
  await db.$disconnect();
});

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: role.toLowerCase(), exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
async function saved(page: Page, button: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page).toHaveURL(/success=Saved/);
  await expect(page.locator(".notice.error")).toHaveCount(0);
}

test("post, apply, hire, revise, approve, release, review and verify work", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [client, student, admin] = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [];
  for (const p of [client, student, admin]) p.on("pageerror", e => errors.push(e.message));
  const title = `${fixturePrefix} ${randomUUID().slice(0, 8)}`;
  try {
    await login(client, "Client");
    await client.goto("/tasks/new");
    await client.getByLabel("Task title", { exact: true }).fill(title);
    await client.getByLabel(/^Description & deliverables/).fill("Create an accessible Figma poster for our campus design event. Deliver an editable file and a print-ready PDF with readable text.");
    await client.getByLabel("Category", { exact: true }).fill("Design");
    await client.getByLabel("Figma", { exact: true }).check();
    await client.getByLabel("Minimum budget (₹)").fill("1000");
    await client.getByLabel("Maximum budget (₹)").fill("3000");
    await client.getByLabel("Estimated hours", { exact: true }).fill("5");
    await client.getByLabel("Deadline", { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    await client.getByRole("button", { name: "Analyze brief", exact: true }).click();
    await expect(client.getByText("Rule-based fallback · AI unavailable", { exact: true })).toBeVisible();
    await saved(client, "Publish task ↗");
    const taskPath = await client.getByRole("link", { name: title, exact: true }).getAttribute("href");
    expect(taskPath).toMatch(/^\/tasks\//);
    await login(student, "Student");
    await student.goto(taskPath!);
    await student.getByLabel("Your proposal", { exact: true }).fill("I will design a readable Figma poster and provide the editable source and a print-ready PDF after your feedback.");
    await student.getByLabel("Proposed price (₹)").fill("3000");
    await saved(student, "Send application ↗");
    await client.goto(taskPath!);
    await saved(client, "Hire & fund sandbox escrow");
    const contractPath = await client.getByRole("link", { name: title, exact: true }).getAttribute("href");
    expect(contractPath).toMatch(/^\/contracts\//);
    await student.goto(contractPath!);
    await saved(student, "Start work");
    let finishUpload!: () => void;
    const uploadWait = new Promise<void>(resolve => { finishUpload = resolve; });
    await student.route("**/api/uploads", async route => {
      await uploadWait;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Regression check: continue with links" }) });
    });
    await student.getByLabel("Supporting file (optional)").setInputFiles({ name: "poster.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nDemo") });
    await expect(student.getByRole("status").filter({ hasText: "Uploading" })).toBeVisible();
    const beforeUpload = student.url();
    await student.getByRole("button", { name: "Submit work for review", exact: true }).click();
    await student.waitForTimeout(500);
    expect(student.url()).toBe(beforeUpload);
    finishUpload();
    await expect(student.getByText("Regression check: continue with links", { exact: true })).toBeVisible();
    await student.unroute("**/api/uploads");
    await student.getByLabel("Submission description").fill("First version includes accessible type and editable poster layout.");
    await student.getByLabel(/^External links/).fill("https://example.com/campusgig/poster-v1");
    await saved(student, "Submit work for review");
    await client.goto(contractPath!);
    await client.getByText("Request a revision", { exact: true }).click();
    await client.getByLabel("What should change?", { exact: true }).fill("Please increase the event title contrast and add the venue.");
    await saved(client, "Request revision");
    await student.goto(contractPath!);
    await saved(student, "Resume work");
    await student.getByLabel("Submission description").fill("Updated poster has high-contrast event title and the complete venue details.");
    await student.getByLabel(/^External links/).fill("https://example.com/campusgig/poster-v2");
    await saved(student, "Submit work for review");
    await client.goto(contractPath!);
    await saved(client, "Approve submission");
    await saved(client, "Release sandbox payment");
    await expect(client.getByText("Payout Release", { exact: true })).toBeVisible();
    await expect(client.getByText("₹2,850").first()).toBeVisible();
    await client.getByLabel("Your review", { exact: true }).fill("Excellent delivery, clear communication and quick revision.");
    await saved(client, "Publish review");
    await student.goto("/profile");
    await student.getByRole("link", { name: /View public profile/ }).click();
    await expect(student.getByRole("heading", { name: "Work-backed skill evidence", exact: true })).toBeVisible();
    await expect(student.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
    await expect(student.getByText("Verified Work", { exact: true }).first()).toBeVisible();
    await login(admin, "Admin");
    await admin.goto("/admin");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled(contexts.map(c => c.close()));
  }
});