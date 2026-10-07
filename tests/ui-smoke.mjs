import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.UI_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir("artifacts/ui", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", error => errors.push(error.message));
async function inspect(path, name) {
  const response = await page.goto(`${base}${path}`);
  if (!response?.ok()) throw new Error(`${path}: HTTP ${response?.status()}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `artifacts/ui/${name}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: `artifacts/ui/${name}-mobile.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error(`${path}: horizontal overflow at 360px`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(`PASS ${path} · desktop / 360px`);
}
try {
  await inspect("/", "landing");
  await inspect("/tasks", "marketplace");
  await inspect("/rankings", "rankings");
  await inspect("/explore", "talent-field");
  for (const role of ["student", "client", "admin"]) {
    await page.goto(`${base}/login`);
    await page.getByRole("button", { name: role, exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await inspect("/dashboard", `${role}-dashboard`);
    await inspect("/profile", `${role}-profile`);
    await inspect("/notifications", `${role}-inbox`);
    if (role === "student") {
      await inspect("/tasks", "student-marketplace");
      const taskHref = await page.locator(".task-card h3 a").first().getAttribute("href");
      if (taskHref) await inspect(taskHref, "task-detail");
      await inspect("/contracts", "contracts");
      const contractHref = await page.locator(".task-card h3 a").first().getAttribute("href");
      if (contractHref) await inspect(contractHref, "workspace");
      await page.goto(`${base}/profile`);
      const profileHref = await page.getByRole("link", { name: "View public profile" }).getAttribute("href");
      if (profileHref) await inspect(profileHref, "public-profile");
    }
    if (role === "client") await inspect("/tasks/new", "new-task");
    if (role === "admin") await inspect("/admin", "administration");
    await page.context().clearCookies();
    await page.goto(base + "/");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS no browser page errors");
} finally {
  await browser.close();
}