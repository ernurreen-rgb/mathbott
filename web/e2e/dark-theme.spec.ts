import { crc32, deflateSync } from "node:zlib";
import type { Page, TestInfo } from "@playwright/test";

import { expect, test } from "./fixtures";

// The dark theme on the student pages: it follows a dark device before the first paint, a saved
// choice wins while signed in, and signed-out visitors follow the device. Every page is also
// saved as a full-page screenshot in the test output (test-results/) for a look by eye.

const THEME_KEY = "qazmath.theme";

/**
 * Records the theme the page had when its first visible element was parsed, i.e. before anything
 * could be painted. (Next puts a hidden metadata outlet first in <body>; it is never painted.)
 */
async function watchFirstPaintTheme(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { __themeAtFirstContent?: string | null };
    new MutationObserver((_, observer) => {
      const content = document.body && Array.from(document.body.children).find(
        (node) => node.tagName !== "SCRIPT" && !(node as HTMLElement).hidden,
      );
      if (!content) return;
      record.__themeAtFirstContent = document.documentElement.getAttribute("data-theme");
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

/** React reports hydration mismatches on the console; the theme must not cause any. */
function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/hydrat/i.test(error.message)) errors.push(error.message);
  });
  return errors;
}

async function expectTheme(page: Page, theme: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = background.match(/\d+/g)!.map(Number);
  const brightness = (r + g + b) / 3;
  if (theme === "dark") expect(brightness, background).toBeLessThan(40);
  else expect(brightness, background).toBeGreaterThan(215);
}

async function snapshot(page: Page, testInfo: TestInfo, name: string) {
  // Not "networkidle": the presence heartbeat keeps the network busy on signed-in pages.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

const firstPaintTheme = (page: Page) =>
  page.evaluate(() => (window as { __themeAtFirstContent?: string | null }).__themeAtFirstContent);

/** A white picture with a dark triangle: the kind of drawing a task statement carries. */
function taskPicture(width = 240, height = 120): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3, 255);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const base = y === height - 15 && x > 30 && x < width - 30;
      const slope = (height - 30) / (width / 2 - 30);
      const left = x >= 30 && x <= width / 2 && Math.abs((x - 30) * slope - (height - 15 - y)) < 1.5;
      const right = x >= width / 2 && x <= width - 30 && Math.abs((width - 30 - x) * slope - (height - 15 - y)) < 1.5;
      if (base || left || right) row.fill(20, 1 + x * 3, 4 + x * 3);
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Gives the first task of lesson 1 ("2 + 3") a picture, served by the test itself. */
async function addPictureToFirstTask(page: Page) {
  const picture = taskPicture();
  await page.route("**/api/backend/images/e2e-theme.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: picture }),
  );
  await page.route(/\/api\/backend\/lessons\/1(\?|$)/, async (route) => {
    const response = await route.fetch();
    const lesson = await response.json();
    const visit = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      const record = value as Record<string, unknown>;
      if (record.text === "2 + 3") {
        record.image_filename = "e2e-theme.png";
        return true;
      }
      return Object.values(record).some(visit);
    };
    visit(lesson);
    await route.fulfill({ response, json: lesson });
  });
}

/** Background of the element or, when it is transparent, of the nearest painted ancestor. */
async function paintedBackground(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color.match(/\d+/g)!.map(Number);
    }
    return [0, 0, 0];
  });
}

async function typeAnswer(page: Page, value: string) {
  const field = page.locator("math-field");
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

test.describe("on a device set to dark", () => {
  test.use({ colorScheme: "dark" });

  test("the student pages are dark from the first paint", async ({ studentPage: page }, testInfo) => {
    await watchFirstPaintTheme(page);
    const hydrationErrors = collectHydrationErrors(page);

    for (const [path, name, ready] of [
      ["/modules", "modules", page.getByRole("heading", { name: "Модуль картасы" })],
      ["/modules/1", "module-map", page.getByRole("heading", { name: "Арифметика" })],
      ["/trial-test", "trial-tests", page.getByRole("link", { name: /E2E сынақ тесті/ })],
      ["/quizzes", "quizzes", page.getByRole("heading", { level: 1 })],
      ["/achievements", "achievements", page.getByRole("heading", { level: 1 })],
      ["/profile", "profile", page.getByRole("link", { name: "Баптаулар", exact: true })],
      ["/settings", "settings", page.getByRole("radiogroup", { name: "Көрініс" })],
    ] as const) {
      await page.goto(path);
      await expect(ready).toBeVisible();
      await expectTheme(page, "dark");
      expect(await firstPaintTheme(page), path).toBe("dark");
      await snapshot(page, testInfo, `dark-system-${name}`);
    }

    // The switch on /settings shows that the device decides.
    await expect(page.getByRole("radio", { name: "Жүйелік" })).toHaveAttribute("aria-checked", "true");
    expect(hydrationErrors).toEqual([]);
  });

  test("a lesson keeps the answer field, the picture and the verdicts readable", async ({ studentPage: page }, testInfo) => {
    await addPictureToFirstTask(page);
    const hydrationErrors = collectHydrationErrors(page);

    // The answer field, a wrong answer, the task picture on its white backdrop.
    await page.goto("/lessons/1");
    await expectTheme(page, "dark");
    await expect(page.getByText("Есеп 1 / 2")).toBeVisible();
    const picture = page.getByRole("img", { name: "Тапсырма", exact: true });
    await expect(picture).toBeVisible();
    await expect(picture).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await typeAnswer(page, "4");
    await snapshot(page, testInfo, "dark-system-lesson-answer");
    await page.getByRole("button", { name: "Тексеру", exact: true }).click();
    const feedback = page.getByRole("status");
    await expect(feedback.getByText("Қате", { exact: true })).toBeVisible();
    const [wrongR, wrongG] = await paintedBackground(page, '[role="status"]');
    expect(wrongR).toBeGreaterThan(wrongG);
    await snapshot(page, testInfo, "dark-system-lesson-wrong");
    await feedback.getByRole("button", { name: "Келесі" }).click();

    await page.getByRole("button", { name: "Дұрыс деп таңдау" }).click();
    await expect(feedback).not.toContainText("Қате");
    const [rightR, rightG] = await paintedBackground(page, '[role="status"]');
    expect(rightG).toBeGreaterThan(rightR);
    await snapshot(page, testInfo, "dark-system-lesson-right");
    expect(hydrationErrors).toEqual([]);
  });

  test("a trial test and its results are dark", async ({ studentPage: page }, testInfo) => {
    const hydrationErrors = collectHydrationErrors(page);
    await page.goto("/trial-test/1");
    await expectTheme(page, "dark");
    await typeAnswer(page, "3");
    await page.getByRole("button", { name: "Келесі", exact: true }).click();
    await page.getByRole("article", { name: "Тапсырма 2" }).getByRole("button", { name: "B 4", exact: true }).click();
    await snapshot(page, testInfo, "dark-system-trial-task");
    await page.getByRole("button", { name: "Тестті аяқтау" }).click();
    await expect(page).toHaveURL(/\/trial-test\/1\/results/);
    await expect(page.getByRole("main").getByText("Тест нәтижесі", { exact: true })).toBeVisible();
    await snapshot(page, testInfo, "dark-system-trial-results");

    expect(hydrationErrors).toEqual([]);
  });

  test("a signed-out visitor sees the dark sign-in page", async ({ page }, testInfo) => {
    await watchFirstPaintTheme(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Google арқылы кіру/ })).toBeVisible();
    await expectTheme(page, "dark");
    expect(await firstPaintTheme(page)).toBe("dark");
    await snapshot(page, testInfo, "dark-system-sign-in");
  });
});

test.describe("on a device set to light", () => {
  test.use({ colorScheme: "light" });

  test("a saved dark choice wins while signed in and can be changed on the settings page", async ({ studentPage: page }, testInfo) => {
    await page.addInitScript((key) => {
      // Only the first page load: later reloads keep what the switch saved.
      if (!sessionStorage.getItem("e2e-theme-seeded")) {
        localStorage.setItem(key, "dark");
        sessionStorage.setItem("e2e-theme-seeded", "1");
      }
    }, THEME_KEY);
    await watchFirstPaintTheme(page);
    const hydrationErrors = collectHydrationErrors(page);

    await page.goto("/settings");
    const dark = page.getByRole("radio", { name: "Қараңғы" });
    await expect(dark).toHaveAttribute("aria-checked", "true");
    await expectTheme(page, "dark");
    expect(await firstPaintTheme(page)).toBe("dark");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#15121d");
    await snapshot(page, testInfo, "saved-dark-settings");

    await page.goto("/modules/1");
    await expect(page.getByRole("heading", { name: "Арифметика" })).toBeVisible();
    await expectTheme(page, "dark");
    expect(await firstPaintTheme(page)).toBe("dark");
    await snapshot(page, testInfo, "saved-dark-module-map");

    // Light, then back to following the device (light here).
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Ашық" }).click();
    await expectTheme(page, "light");
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe("light");
    await page.reload();
    await expectTheme(page, "light");
    await expect(page.getByRole("radio", { name: "Ашық" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: "Қараңғы" }).click();
    await expectTheme(page, "dark");
    await page.getByRole("radio", { name: "Жүйелік" }).click();
    await expectTheme(page, "light");
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBeNull();
    await expect(page.locator("#qm-theme-color")).toHaveCount(0);

    expect(hydrationErrors).toEqual([]);
  });

  test("a signed-out visitor follows the device, not a saved choice", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "dark"), THEME_KEY);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Google арқылы кіру/ })).toBeVisible();
    await expectTheme(page, "light");
  });
});
