import { test, expect, joinGame, startGame } from './fixtures';
import { webURL } from './support/settings.cjs';

test('PIN and nickname validation keeps guests on the join page', async ({ page }) => {
  await page.goto('/join');
  await page.getByRole('button', { name: 'Ойынға кіру' }).click();
  await expect(page.getByText('6 таңбалы PIN кодты енгізіңіз')).toBeVisible();
  await page.getByPlaceholder('000000').fill('000000');
  await page.getByRole('button', { name: 'Ойынға кіру' }).click();
  await expect(page.getByText('Лақап атыңызды (аты-жөніңізді) жазыңыз')).toBeVisible();
  await page.getByPlaceholder('Мысалы: Арман немесе Айша').fill('E2E оқушы');
  const lookup = page.waitForResponse((res) => res.url().endsWith('/pin/000000'));
  await page.getByRole('button', { name: 'Ойынға кіру' }).click();
  expect((await lookup).status()).toBe(404);
  await expect(page.getByText('Session not found', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/join');
});

test('guest joins a private game, answers, reloads and reviews the result', async ({ page, host, game }, testInfo) => {
  // Private source material stays hidden while its invited guests can play by PIN.
  expect((await page.request.get(`/api/backend/quizzes/${game.quizId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/backend/quizzes/${game.quizId}/questions`)).status()).toBe(404);
  await page.goto('/quizzes');
  await expect(page.getByText('Квиздер табылмады', { exact: true })).toBeVisible();
  await expect(page.getByText(game.title)).toHaveCount(0);

  const player = await joinGame(page, game);
  await startGame(host, page, game);
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.getByText('Дұрыс! Өте жақсы!', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Дұрыс! Өте жақсы!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Келесі сұраққа өту' }).click();
  await expect(page.getByRole('banner').getByText('Сұрақ 2 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await expect(page.getByText('Қате жауап', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Келесі сұраққа өту' }).click();
  await expect(page.getByRole('heading', { name: 'Тамаша нәтиже!' })).toBeVisible();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await expect(page.getByText('Дұрыс жауаптар:')).toHaveText('Дұрыс жауаптар: 1 / 2');
  await page.reload();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  const screenshot = testInfo.outputPath('quiz-result.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('quiz-result', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('link', { name: 'Қателермен жұмыс', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Қателермен жұмыс' })).toBeVisible();
  await expect(page.getByText(/1 қате немесе жауапсыз сұрақ/)).toBeVisible();
  await expect(page.getByText('Сұрақ 1 · Дұрыс', { exact: true })).toBeVisible();
  await expect(page.getByText('Сұрақ 2 · Қате / жауап берілмеді', { exact: true })).toBeVisible();

  const saved = await page.request.get(`/api/backend/quiz-sessions/${game.id}/review?participant_id=${player.participant.id}`, {
    headers: { 'X-Quiz-Participant-Token': player.participant_token },
  });
  await expect(saved).toBeOK();
  const result = await saved.json();
  expect(result.items).toHaveLength(2);
  expect(result.items.map((item: { is_correct: boolean }) => item.is_correct)).toEqual([true, false]);
});

test('a lost server acknowledgement recovers the committed answer once', async ({ page, host, game }) => {
  const player = await joinGame(page, game);
  await startGame(host, page, game);
  const answerURL = `**/quiz-sessions/${game.id}/answers`;
  let committedScore = 0;
  let answerBody: Record<string, unknown> = {};
  await page.route(answerURL, async (route) => {
    answerBody = route.request().postDataJSON();
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    committedScore = (await committed.json()).total_score;
    // The DB commit succeeds, but the browser never receives its acknowledgement.
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.getByText('Дұрыс! Өте жақсы!', { exact: true })).toBeVisible();
  expect(committedScore).toBeGreaterThan(0);
  const headers = { 'X-Quiz-Participant-Token': player.participant_token, Origin: webURL };
  const replay = await page.request.post(`/api/backend/quiz-sessions/${game.id}/answers`, { headers, data: answerBody });
  await expect(replay).toBeOK();
  expect((await replay.json()).total_score).toBe(committedScore);
  const progress = await page.request.get(`/api/backend/quiz-sessions/${game.id}/progress`, { headers });
  await expect(progress).toBeOK();
  const saved = await progress.json();
  expect(saved.participant.correct_count).toBe(1);
  expect(saved.participant.total_answered).toBe(1);
  expect(saved.participant.score).toBe(committedScore);
});

test('an interrupted answer can be retried without scoring twice', async ({ page, host, game }) => {
  const player = await joinGame(page, game);
  await startGame(host, page, game);
  const answerURL = `**/quiz-sessions/${game.id}/answers`;
  await page.route(answerURL, (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Қайта жіберу', exact: true })).toBeVisible();

  const progressURL = `/api/backend/quiz-sessions/${game.id}/progress`;
  const headers = { 'X-Quiz-Participant-Token': player.participant_token };
  const unsaved = await page.request.get(progressURL, { headers });
  await expect(unsaved).toBeOK();
  expect((await unsaved.json()).participant.correct_count).toBe(0);

  await page.unroute(answerURL);
  await page.getByRole('button', { name: 'Қайта жіберу', exact: true }).click();
  await expect(page.getByText('Дұрыс! Өте жақсы!', { exact: true })).toBeVisible();
  const saved = await page.request.get(progressURL, { headers });
  await expect(saved).toBeOK();
  const beforeReload = await saved.json();
  expect(beforeReload.participant.correct_count).toBe(1);
  expect(beforeReload.participant.score).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText('Дұрыс! Өте жақсы!', { exact: true })).toBeVisible();
  const afterReload = await page.request.get(progressURL, { headers });
  await expect(afterReload).toBeOK();
  expect((await afterReload.json()).participant.score).toBe(beforeReload.participant.score);
});
