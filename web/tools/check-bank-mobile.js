// Continue after check-bank-workspace.js, using the same disposable fixture.
async (page) => {
  const passed = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  check(await fits(), "Mobile task view has no horizontal page overflow");
  await page.screenshot({ path: "output/playwright/bank-task-mobile.png" });
  await page.getByRole("button", { name: "Өңдеу", exact: true }).click();
  check(await fits(), "Mobile editor keeps long MathLive content within the page");
  await page.screenshot({ path: "output/playwright/bank-editor-mobile.png" });
  await page.getByRole("button", { name: "Бас тарту", exact: true }).click();
  await page.getByRole("button", { name: "Есептер тізіміне", exact: true }).click();
  await page.getByRole("heading", { name: "Тапсырмалар банкі", exact: true }).waitFor();
  check(await fits(), "Mobile library fits without sideways scrolling");
  await page.screenshot({ path: "output/playwright/bank-library-mobile.png" });
  await page.getByRole("button", { name: "Есеп қосу", exact: true }).click();
  await page.getByLabel("Тапсырма түрі", { exact: true }).selectOption("input");
  await page.getByLabel("Тапсырма мәтіні", { exact: true }).click();
  await page.getByLabel("Тапсырма мәтіні", { exact: true }).pressSequentially("Тексеру есебі: 137+4");
  await page.getByLabel("Дұрыс жауап", { exact: true }).click();
  await page.getByLabel("Дұрыс жауап", { exact: true }).pressSequentially("141");
  const createdEvent = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/admin/bank/tasks"));
  await page.getByRole("button", { name: "Құру", exact: true }).click();
  const created = await createdEvent;
  check(created.ok(), "New written-answer task can be created through real MathLive inputs");
  const task = await created.json();
  await page.getByRole("heading", { name: `Банк №${task.id}`, exact: true }).waitFor();
  check(task.answer === "141" && task.question_type === "input", "New task retains its answer and opens in the wide task view");
  await page.getByText("Әрекеттер", { exact: true }).click();
  check(await fits(), "Mobile task action menu remains within the viewport");
  await page.screenshot({ path: "output/playwright/bank-task-menu-mobile.png" });
  return { passed, total: passed.length, createdTaskId: task.id, url: page.url() };
}
