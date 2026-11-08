// Playwright CLI setup for the isolated backend fixture. The OAuth session is
// mocked in this browser only; every backend request goes to 127.0.0.1:8100.
// Start bot/scripts/preview_bank_workspace.py and `npm run start -- -p 3100`,
// then: playwright-cli run-code --filename tools/preview-bank-browser.js
async (page) => {
  await page.route(/https:\/\/[^/]*ingest[^/]*sentry\.io\//, (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.route("**/api/auth/session", async (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { email: "bank-preview@example.test", name: "Банк тексеруі" }, expires: "2099-01-01T00:00:00.000Z" }),
  }));
  await page.route("**/api/backend/**", async (route) => {
    const request = route.request();
    const source = new URL(request.url());
    const target = new URL(`http://127.0.0.1:8100${source.pathname.replace(/^\/api\/backend/, "/api")}${source.search}`);
    target.searchParams.set("email", "bank-preview@example.test");
    const headers = { ...request.headers() };
    for (const key of ["host", "cookie", "content-length", "x-proxy-request-signature", "x-proxy-request-signature-v2"]) delete headers[key];
    const response = await route.fetch({ url: target.toString(), headers });
    await route.fulfill({ response });
  });
  await page.goto("http://127.0.0.1:3100/admin/bank");
  await page.getByRole("heading", { name: "Тапсырмалар банкі", exact: true }).waitFor();
  await page.getByTestId("bank-task-row").first().waitFor();
  return { url: page.url(), visibleTasks: await page.getByTestId("bank-task-row").count() };
}
