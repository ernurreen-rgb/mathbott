import { defineConfig, devices } from "@playwright/test";

import { E2E_ENV, E2E_PORTS, E2E_WEB_URL } from "./e2e/env";

// Browser tests of the student path (web/e2e). They start their own API on a throwaway
// PostgreSQL database (bot/scripts/seed_e2e.py recreates it) and a production build of the web app.
// See "Browser Tests" in docs/development/development-workflow.md for how to run them locally.
const python = process.env.E2E_PYTHON || "python";
const webCommand =
  process.env.E2E_WEB_COMMAND || `npm run build && npx next start -p ${E2E_PORTS.web}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_WEB_URL,
    locale: "kk-KZ",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `"${python}" scripts/seed_e2e.py && "${python}" -m uvicorn main:app --host 127.0.0.1 --port ${E2E_PORTS.api}`,
      cwd: "../bot",
      url: `http://127.0.0.1:${E2E_PORTS.api}/api/health`,
      env: E2E_ENV.api,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: webCommand,
      url: E2E_WEB_URL,
      env: E2E_ENV.web,
      timeout: 600_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
