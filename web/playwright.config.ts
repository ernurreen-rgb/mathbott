import { defineConfig, devices } from '@playwright/test';
import { webURL, apiURL } from './e2e/support/settings.cjs';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: './output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  use: {
    baseURL: webURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/support/server.cjs backend',
      url: `${apiURL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node e2e/support/server.cjs web',
      url: `${webURL}/api/auth/providers`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
