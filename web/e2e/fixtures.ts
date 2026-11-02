import { randomUUID } from 'node:crypto';
import { test as base, expect, type APIRequest, type APIRequestContext, type Page } from 'playwright/test';
import { encode } from 'next-auth/jwt';
import { authSecret, teacherEmail, webURL, adminEmail, learnerEmail, otherLearnerEmail } from './support/settings.cjs';

type Game = { id: number; pin_code: string; quizId: number; title: string };
type Player = { participant: { id: number }; participant_token: string };
export type Trial = { id: number; title: string; tasks: { id: number }[] };

export async function sessionCookie(email: string) {
  const token = await encode({
    secret: authSecret,
    token: { email, name: 'E2E account', sub: email },
    maxAge: 3600,
  });
  return { name: 'next-auth.session-token', value: token, domain: '127.0.0.1',
    path: '/', httpOnly: true, secure: false, sameSite: 'Lax' as const, expires: -1 };
}

async function accountRequest(request: APIRequest, email: string) {
  return request.newContext({
    baseURL: webURL,
    extraHTTPHeaders: { Origin: webURL },
    storageState: { cookies: [await sessionCookie(email)], origins: [] },
  });
}

export const test = base.extend<{
  host: APIRequestContext;
  game: Game;
  admin: APIRequestContext;
  learner: APIRequestContext;
  otherLearner: APIRequestContext;
  signedInPage: Page;
  trial: Trial;
}>({
  host: async ({ playwright }, provide) => {
    // A normal encrypted NextAuth JWT for the isolated fixture, never an auth route/backdoor.
    // This exercises authenticated proxy requests, not Google's OAuth exchange.
    const host = await accountRequest(playwright.request, teacherEmail);
    await provide(host);
    await host.dispose();
  },
  admin: async ({ playwright }, provide) => {
    const account = await accountRequest(playwright.request, adminEmail);
    await provide(account);
    await account.dispose();
  },
  learner: async ({ playwright }, provide) => {
    const account = await accountRequest(playwright.request, learnerEmail);
    await provide(account);
    await account.dispose();
  },
  otherLearner: async ({ playwright }, provide) => {
    const account = await accountRequest(playwright.request, otherLearnerEmail);
    await provide(account);
    await account.dispose();
  },
  signedInPage: async ({ page, context }, provide) => {
    await context.addCookies([await sessionCookie(learnerEmail)]);
    const session = await page.request.get('/api/auth/session');
    await expect(session).toBeOK();
    expect((await session.json()).user.email).toBe(learnerEmail);
    await provide(page);
  },
  trial: async ({ admin }, provide) => {
    const title = `E2E draft ${randomUUID()}`;
    const created = await admin.post('/api/backend/admin/trial-tests', {
      multipart: { title, email: adminEmail, expected_tasks_count: '2', category: 'E2E' },
    });
    await expect(created).toBeOK();
    const trial = await created.json();
    const slots = [
      { text: 'Бірінші есеп: екіге екіні қосыңыз', question_type: 'mcq', answer: 'A', answer_mode: 'choices',
        options: [{ label: 'A', text: '4' }, { label: 'B', text: '5' }, { label: 'C', text: '6' }, { label: 'D', text: '7' }] },
      { text: 'Екінші есеп: үшке үшті қосыңыз', question_type: 'input', answer: '6' },
    ];
    for (const [index, slot] of slots.entries()) {
      const placed = await admin.put(`/api/backend/admin/trial-tests/${trial.id}/slots/${index + 1}`, {
        data: { email: adminEmail, ...slot },
      });
      await expect(placed).toBeOK();
    }
    const details = await admin.get(`/api/backend/trial-tests/${trial.id}?email=${encodeURIComponent(adminEmail)}`);
    await expect(details).toBeOK();
    const data = await details.json();
    expect(data.tasks).toHaveLength(2);
    await provide({ id: trial.id, title, tasks: data.tasks });
  },
  game: async ({ host }, provide) => {
    const title = `E2E private quiz ${randomUUID()}`;
    const created = await host.post('/api/backend/quizzes', {
      data: {
        title,
        questions: [
          { question_text: '2 + 2 = ?', correct_answer: 'A', time_limit_seconds: 300,
            options: [{ id: 'A', text: '4' }, { id: 'B', text: '5' }, { id: 'C', text: '6' }, { id: 'D', text: '7' }] },
          { question_text: '3 + 3 = ?', correct_answer: 'C', sort_order: 1, time_limit_seconds: 300,
            options: [{ id: 'A', text: '4' }, { id: 'B', text: '5' }, { id: 'C', text: '6' }, { id: 'D', text: '7' }] },
        ],
      },
    });
    await expect(created).toBeOK();
    const quiz = await created.json();
    expect(quiz.is_public).toBe(false);
    const session = await host.post('/api/backend/quiz-sessions', { data: { quiz_id: quiz.id } });
    await expect(session).toBeOK();
    await provide({ ...await session.json(), quizId: quiz.id, title });
    // The entire database belongs to this run and is discarded on server shutdown.
  },
});

export { expect };

export async function joinGame(page: Page, game: Game): Promise<Player> {
  await page.goto('/join');
  await page.getByPlaceholder('000000').fill(game.pin_code);
  await page.getByPlaceholder('Мысалы: Арман немесе Айша').fill('E2E оқушы');
  const response = page.waitForResponse((res) => res.url().endsWith('/quiz-sessions/join') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ойынға кіру' }).click();
  const joined = await response;
  expect(joined.ok()).toBe(true);
  await expect(page).toHaveURL(`/quiz/play/${game.id}`);
  await expect(page.getByText('Ойынға дайынсыз')).toBeVisible();
  return joined.json();
}

export async function startGame(host: APIRequestContext, page: Page, game: Game) {
  await expect(await host.post(`/api/backend/quiz-sessions/${game.id}/start`, { data: {} })).toBeOK();
  await expect(page.getByRole('banner').getByText('Сұрақ 1 / 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '4', exact: true })).toBeVisible();
}
