import {defineConfig,devices} from "@playwright/test";
// The browser suite drives the developer's own dev server (Next 16 refuses a second
// instance for one project), so the spec removes the task and contract it creates and
// sweeps residue from interrupted runs. See tests/e2e/golden-path.spec.ts.
const port=Number(process.env.E2E_PORT??3000);
const baseURL=`http://localhost:${port}`;
export default defineConfig({
  testDir:"./tests/e2e",
  fullyParallel:false,
  workers:1,
  timeout:300000,
  expect:{timeout:20000},
  retries:0,
  reporter:"list",
  use:{baseURL,actionTimeout:15000,trace:"retain-on-failure",...devices["Desktop Chrome"]},
  webServer:{command:`npm run dev -- --port ${port}`,url:`${baseURL}/login`,reuseExistingServer:true,timeout:180000},
});