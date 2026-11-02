import type { APIRequestContext, Page } from 'playwright/test';
import { test, expect, type Trial } from './fixtures';
import { learnerEmail } from './support/settings.cjs';

type Draft = { answers: Record<string, string>; current_task_index: number };
const choice = (page: Page, label: 'A' | 'B') => page.getByRole('button', {
  name: label === 'A' ? /^A\s*4$/ : /^B\s*5$/,
});
const mathAnswer = (page: Page) => page.locator('math-field[aria-label="Математикалық жауап"]');
const draftURL = (trial: Trial) => `/api/backend/trial-tests/${trial.id}/draft`;

async function readDraft(account: APIRequestContext, trial: Trial): Promise<Draft> {
  const response = await account.get(draftURL(trial), { params: { email: learnerEmail } });
  await expect(response).toBeOK();
  return response.json();
}

async function openTrial(page: Page, trial: Trial) {
  await page.goto(`/trial-test/${trial.id}`);
  await expect(page.getByRole('heading', { name: trial.title, exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Тест барысы' })).toBeVisible();
}

async function writeMathAnswer(page: Page) {
  const field = mathAnswer(page);
  await expect(field).toBeVisible();
  // Type through the real MathLive keyboard/input events, without setting app state.
  await field.click();
  await field.pressSequentially('6');
  await expect(field).toHaveJSProperty('value', '6');
}

test('draft autosaves choices, MathLive input and position across reloads, separately per account', async ({ signedInPage: page, learner, otherLearner, trial }) => {
  await openTrial(page, trial);
  await choice(page, 'A').click();
  await page.getByRole('button', { name: 'Келесі', exact: true }).click();
  await writeMathAnswer(page);
  const saved: Draft = { answers: { [trial.tasks[0].id]: 'A', [trial.tasks[1].id]: '6' }, current_task_index: 1 };
  await expect.poll(() => readDraft(learner, trial)).toEqual(saved);
  await page.reload();
  await expect(mathAnswer(page)).toHaveJSProperty('value', '6');
  await expect(page.getByRole('progressbar', { name: 'Тест барысы' })).toHaveAttribute('aria-valuenow', '100');

  // The signed identity wins over a different email in query/body parameters.
  await expect(readDraft(otherLearner, trial)).resolves.toEqual({ answers: {}, current_task_index: 0 });
  const otherDraft: Draft = { answers: { [trial.tasks[0].id]: 'B' }, current_task_index: 0 };
  await expect(await otherLearner.put(draftURL(trial), { data: { email: learnerEmail, ...otherDraft } })).toBeOK();
  await expect(readDraft(otherLearner, trial)).resolves.toEqual(otherDraft);
  await expect(readDraft(learner, trial)).resolves.toEqual(saved);
  await page.getByRole('button', { name: 'Алдыңғы', exact: true }).click();
  await expect(choice(page, 'A')).toHaveAttribute('aria-pressed', 'true');
});

test('SPA departure and closing a tab flush the final answer before the autosave timer', async ({ signedInPage: page, context, learner, trial }) => {
  // Freeze the debounce timer, but exercise real React unmount/pagehide and HTTP writes.
  await page.clock.install();
  await openTrial(page, trial);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(draftURL(trial))) writes.push(request.postData() || '');
  });
  await choice(page, 'A').click();
  expect(writes).toHaveLength(0);
  // Next Link performs a real SPA navigation rather than dispatching lifecycle events.
  await page.locator('a[href="/trial-test"]:visible').first().click();
  await expect(page).toHaveURL('/trial-test');
  await expect.poll(() => readDraft(learner, trial)).toEqual({ answers: { [trial.tasks[0].id]: 'A' }, current_task_index: 0 });
  expect(writes).toHaveLength(1);

  await page.clock.resume();
  await openTrial(page, trial);
  await expect(choice(page, 'A')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const beforeEdit = writes.length;
  await choice(page, 'B').click();
  expect(writes).toHaveLength(beforeEdit);
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  await expect.poll(() => readDraft(learner, trial)).toEqual({ answers: { [trial.tasks[0].id]: 'B' }, current_task_index: 0 });
  const reopened = await context.newPage();
  await reopened.clock.resume();
  await openTrial(reopened, trial);
  await expect(choice(reopened, 'B')).toHaveAttribute('aria-pressed', 'true');
});

test('failed draft loading does not replace saved answers with an empty draft', async ({ signedInPage: page, learner, trial }) => {
  const saved: Draft = { answers: { [trial.tasks[0].id]: 'A' }, current_task_index: 0 };
  await expect(await learner.put(draftURL(trial), { data: { email: learnerEmail, ...saved } })).toBeOK();
  const pattern = `**/trial-tests/${trial.id}/draft**`;
  await page.route(pattern, (route) => route.request().method() === 'GET'
    ? route.abort('internetdisconnected') : route.continue());
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(draftURL(trial))) writes += 1;
  });
  await page.goto(`/trial-test/${trial.id}`);
  await expect(page.getByText('Сақталған жауаптарды жүктеу мүмкін болмады. Бетті қайта жүктеңіз.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Тестті аяқтау' })).toHaveCount(0);
  await page.goto('/quizzes');
  await expect(readDraft(learner, trial)).resolves.toEqual(saved);
  expect(writes).toBe(0);
  await page.unroute(pattern);
  await openTrial(page, trial);
  await expect(choice(page, 'A')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('progressbar', { name: 'Тест барысы' })).toHaveAttribute('aria-valuenow', '50');
});

test('a lost submit acknowledgement recovers one result, clears the draft and starts a blank retake', async ({ signedInPage: page, learner, trial, isMobile }, testInfo) => {
  await openTrial(page, trial);
  await choice(page, 'A').click();
  await page.getByRole('button', { name: 'Келесі', exact: true }).click();
  await writeMathAnswer(page);
  await expect.poll(() => readDraft(learner, trial)).toEqual({
    answers: { [trial.tasks[0].id]: 'A', [trial.tasks[1].id]: '6' }, current_task_index: 1,
  });
  let resultId = 0;
  let submitted: Record<string, unknown> = {};
  await page.route(`**/trial-tests/${trial.id}/submit`, async (route) => {
    submitted = route.request().postDataJSON();
    const committed = await route.fetch();
    await expect(committed).toBeOK();
    resultId = (await committed.json()).result_id;
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Тестті аяқтау', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тест нәтижесі', exact: true })).toBeVisible();
  await expect(page).toHaveURL(`/trial-test/${trial.id}/results?attempt=${resultId}`);
  await expect(page.getByText('100.0%', { exact: true })).toBeVisible();
  if (!isMobile) {
    // Wait for navigation/layout transitions and ensure the fixed sidebar cannot
    // cover the results workspace before taking its diagnostic screenshot.
    await expect.poll(async () => {
      const sidebar = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox();
      const workspace = await page.getByRole('main').boundingBox();
      return !!sidebar && !!workspace && workspace.x >= sidebar.x + sidebar.width - 1;
    }).toBe(true);
  }
  const screenshot = testInfo.outputPath('trial-result.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('trial-result', { path: screenshot, contentType: 'image/png' });
  await expect(readDraft(learner, trial)).resolves.toEqual({ answers: {}, current_task_index: 0 });

  const replay = await learner.post(`/api/backend/trial-tests/${trial.id}/submit`, { data: submitted });
  await expect(replay).toBeOK();
  expect((await replay.json()).result_id).toBe(resultId);
  const history = await learner.get(`/api/backend/trial-tests/${trial.id}/results`, { params: { email: learnerEmail } });
  await expect(history).toBeOK();
  expect(await history.json()).toHaveLength(1);
  await page.getByRole('link', { name: 'Қайта өту', exact: true }).click();
  await expect(page.getByRole('heading', { name: trial.title, exact: true })).toBeVisible();
  await expect(choice(page, 'A')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('progressbar', { name: 'Тест барысы' })).toHaveAttribute('aria-valuenow', '0');
  await expect(readDraft(learner, trial)).resolves.toEqual({ answers: {}, current_task_index: 0 });
});
