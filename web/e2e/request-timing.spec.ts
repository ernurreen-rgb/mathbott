import { expect, test } from "./fixtures";

// web/lib/request-timing.ts: a request that takes 3 s or more is reported to the API with the
// proxy's and the API's own time, so a slow lesson can be traced to the network or the servers.
test("a slow request is reported with where its time went", async ({ studentPage: page }) => {
  // Hold the module map back in the browser, as a bad network would.
  await page.route("**/api/backend/modules/map**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3200));
    await route.continue();
  });
  type Report = { kind: string; path: string };
  const isSlowMap = (report: Report) => report.kind === "slow" && report.path === "modules/map";
  // Sampled reports of other requests may go in an earlier batch: wait for the one with this report.
  const reportRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/backend/client-timings") && request.method() === "POST" &&
      (request.postDataJSON()?.reports ?? []).some(isSlowMap),
    { timeout: 30_000 },
  );

  await page.goto("/modules");
  await expect(page.getByRole("heading", { name: "Модуль картасы" })).toBeVisible();

  const request = await reportRequest;
  const response = await request.response();
  expect(response?.status()).toBe(200);
  const batch = request.postDataJSON();
  const slow = batch.reports.find(isSlowMap);
  expect(slow).toBeTruthy();
  expect(slow.page).toBe("/modules");
  expect(slow.duration_ms).toBeGreaterThanOrEqual(3000);
  // The real proxy and API answered, so their parts are known and far below the device's wait.
  for (const part of ["proxy_ms", "api_ms", "app_ms"]) {
    expect(typeof slow[part]).toBe("number");
    expect(slow[part]).toBeLessThan(slow.duration_ms);
  }
  expect(JSON.stringify(batch)).not.toContain("@");
  expect((await response!.json()).recorded).toBeGreaterThanOrEqual(1);
});
