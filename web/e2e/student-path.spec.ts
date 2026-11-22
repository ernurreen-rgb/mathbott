import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// The course comes from bot/scripts/seed_e2e.py: lesson 1 "Қосу" has four mini-lessons
// (2 + 3 = 5 and a true/false task; 4 + 4; 1 + 1; 3 + 3), lesson 2 "Азайту" starts with 10 - 3.

/** Types into the MathLive answer field with real key presses, as a student does. */
async function typeAnswer(page: Page, value: string) {
  const field = page.locator("math-field");
  // MathLive loads after the page, and after a click it moves the focus to its own key sink a
  // moment later; key presses before that are lost. A student never types that fast.
  await page.waitForFunction(() => customElements.get("math-field") !== undefined);
  await field.click();
  await page.waitForFunction(() => {
    const root = document.querySelector("math-field")?.shadowRoot;
    const sink = root?.querySelector("[part=keyboard-sink], .ML__keyboard-sink");
    return !!sink && root?.activeElement === sink;
  });
  await page.keyboard.type(value);
  await expect(field).toHaveJSProperty("value", value);
}

async function check(page: Page) {
  await page.getByRole("button", { name: "Тексеру", exact: true }).click();
}

test("a visitor without a session is sent to sign in and keeps the page they wanted", async ({ page }) => {
  await page.goto("/lessons/1");
  await expect(page).toHaveURL(/\/\?callbackUrl=%2Flessons%2F1$/);
  await expect(page.getByRole("button", { name: /Google арқылы кіру/ })).toBeVisible();
});

test("a signed-in student lands on the modules map", async ({ studentPage: page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/modules$/);
  await expect(page.getByRole("heading", { name: "Модуль картасы" })).toBeVisible();
});

test("a new student solves a lesson, reviews the mistake and goes straight on", async ({ studentPage: page }) => {
  // Headless Chrome reports notifications as blocked; a student's browser has usually never asked.
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));

  // A brand-new account: the API creates it on the first request ("User not found" regression).
  await page.goto("/modules");
  await page.locator('a[href="/modules/1"]').click();
  await expect(page.getByRole("heading", { name: "Арифметика" })).toBeVisible();
  await page.getByRole("link", { name: /^Қосу\./ }).click();
  await expect(page).toHaveURL(/\/lessons\/1$/);

  // Mini-lesson 1: a wrong first answer, then the true/false task.
  await expect(page.getByText("Есеп 1 / 2")).toBeVisible();
  await typeAnswer(page, "4");
  await check(page);
  const feedback = page.getByRole("status");
  await expect(feedback.getByText("Қате", { exact: true })).toBeVisible();
  await feedback.getByRole("button", { name: "Келесі" }).click();

  await expect(page.getByText("Есеп 2 / 2")).toBeVisible();
  await page.getByRole("button", { name: "Дұрыс деп таңдау" }).click();
  await expect(feedback).not.toContainText("Қате");
  await feedback.getByRole("button", { name: "Келесі" }).click();

  // Back to the mistake: the second try is right, which completes the mini-lesson.
  await expect(page.getByText("Қатені түзету")).toBeVisible();
  await typeAnswer(page, "5");
  await check(page);
  await expect(feedback).not.toContainText("Қате");
  await feedback.getByRole("button", { name: "Келесі" }).click();

  // The summary offers the streak reminder above its buttons; «Кейін» puts it off for a few days.
  const reminderOffer = page.getByRole("region", { name: "Серия үзілмесін" });
  await expect(reminderOffer).toBeVisible();
  await reminderOffer.getByRole("button", { name: "Кейін" }).click();
  await expect(reminderOffer).toBeHidden();

  // It also offers the review of the one first-try mistake.
  await page.getByRole("button", { name: /Қателерді талдау \(1\)/ }).click();

  // The mistake review serves the task again; finishing it continues with mini-lesson 2.
  await expect(page).toHaveURL(/\/lessons\/1\/review\/11/);
  await typeAnswer(page, "5");
  await check(page);
  await page.getByRole("button", { name: "Жалғастыру" }).click();

  await expect(page).toHaveURL(/\/lessons\/1(\?.*)?$/);
  const rest = [["4 plus 4", "8"], ["1 plus 1", "2"], ["3 plus 3", "6"]];
  for (const [index, [task, answer]] of rest.entries()) {
    await expect(page.getByRole("img", { name: task })).toBeVisible();
    await typeAnswer(page, answer);
    await check(page);
    await expect(feedback).not.toContainText("Қате");
    if (index < rest.length - 1) {
      await feedback.getByRole("button", { name: "Келесі" }).click();
      await page.getByRole("button", { name: "Келесі кіші сабақ" }).click();
    }
  }

  // The lesson is complete with nothing left to review: after the congratulations the student is
  // back on the module map, where lesson 2 is now the current one.
  await expect(page).toHaveURL(/\/modules\/1(#section-1)?$/);
  await expect(page.getByRole("link", { name: /^Қосу\. Аяқталды\./ })).toBeVisible();
  await page.getByRole("link", { name: /^Азайту\. Қазір оқитын сабақ\./ }).click();
  await expect(page).toHaveURL(/\/lessons\/2$/);
  await expect(page.getByRole("img", { name: "10 minus 3" })).toBeVisible();
});

test("a student takes a trial test and sees the result", async ({ studentPage: page }) => {
  await page.goto("/trial-test");
  await page.getByRole("link", { name: /E2E сынақ тесті/ }).click();
  await expect(page).toHaveURL(/\/trial-test\/1$/);

  await typeAnswer(page, "3");
  await page.getByRole("button", { name: "Келесі", exact: true }).click();
  const task2 = page.getByRole("article", { name: "Тапсырма 2" });
  await task2.getByRole("button", { name: "B 4", exact: true }).click();
  await page.getByRole("button", { name: "Тестті аяқтау" }).click();

  await expect(page).toHaveURL(/\/trial-test\/1\/results/);
  const results = page.getByRole("main");
  await expect(results.getByText("Тест нәтижесі", { exact: true })).toBeVisible();
  await expect(results).toContainText("2 / 2");
  await expect(results).toContainText("100.0%");
  // Both answers were graded right: the written one and the chosen option.
  const numbers = results.getByRole("region", { name: "Тапсырма нөмірлері" });
  await expect(numbers.getByRole("button", { name: "Тапсырма 1: Дұрыс" })).toBeVisible();
  await expect(numbers.getByRole("button", { name: "Тапсырма 2: Дұрыс" })).toBeVisible();
});

test("a student's menu asks once per tab whether they are an admin, not on every page", async ({ studentPage: page }) => {
  // Every page renders its own menu; it used to ask the API on each one.
  const checks: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith("/admin/check")) checks.push(response.status());
  });

  await page.goto("/modules");
  await expect(page.getByRole("heading", { name: "Модуль картасы" })).toBeVisible();
  await expect.poll(() => checks.length).toBeGreaterThan(0);
  await page.locator('a[href="/modules/1"]').click();
  await expect(page.getByRole("heading", { name: "Арифметика" })).toBeVisible();
  await page.locator('a[href="/trial-test"]:visible').first().click();
  await expect(page).toHaveURL(/\/trial-test$/);
  await page.locator('a[href="/quizzes"]:visible').first().click();
  await expect(page).toHaveURL(/\/quizzes$/);
  // A reload starts the page over; the tab still remembers the answer.
  await page.reload();
  await page.locator('a[href="/modules"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Модуль картасы" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // One answer for the whole tab. (A brand-new account may first be asked about before the API has
  // created it; that "not found" is not remembered, so one more ask is allowed.)
  expect(checks.filter((status) => status === 200)).toHaveLength(1);
  expect(checks.length).toBeLessThanOrEqual(2);
  await expect(page.locator('a[href="/admin/"]')).toHaveCount(0);
});
