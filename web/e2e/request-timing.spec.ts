import { expect, test } from "./fixtures";

// web/lib/request-timing.ts: a request that takes 3 s or more is reported to the API with the
// proxy's and the API's own time, so a slow lesson can be traced to the network or the servers.
test("a slow request is reported with where its time went", async ({ studentPage: page }) => {
  // Hold the module map back in the browser, as a bad network would.
  await page.route("**/api/backend/modules/map**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3200));
    await route.continue();
  });
  const reportResponse = page.waitForResponse(
    (response) => response.url().includes("/api/backend/client-timings") && response.request().method() === "POST",
    { timeout: 30_000 },
  );

  await page.goto("/modules");
  await expect(page.getByRole("heading", { name: "Модуль картасы" })).toBeVisible();

  const response = await reportResponse;
  expect(response.status()).toBe(200);
  const batch = response.request().postDataJSON();
  const slow = batch.reports.find((report: { kind: string; path: string }) => report.kind === "slow" && report.path === "modules/map");
  expect(slow).toBeTruthy();
  expect(slow.page).toBe("/modules");
  expect(slow.duration_ms).toBeGreaterThanOrEqual(3000);
  // The real proxy and API answered, so their parts are known and far below the device's wait.
  for (const part of ["proxy_ms", "api_ms", "app_ms"]) {
    expect(typeof slow[part]).toBe("number");
    expect(slow[part]).toBeLessThan(slow.duration_ms);
  }
  expect(JSON.stringify(batch)).not.toContain("@");
  expect((await response.json()).recorded).toBeGreaterThanOrEqual(1);
});
