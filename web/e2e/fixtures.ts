import { randomUUID } from 'node:crypto';
import { test as base, expect, type APIRequestContext, type Page } from 'playwright/test';
import { encode } from 'next-auth/jwt';
import { authSecret, teacherEmail, webURL } from './support/settings.cjs';

type Game = { id: number; pin_code: string; quizId: number; title: string };
type Player = { participant: { id: number }; participant_token: string };

export const test = base.extend<{ host: APIRequestContext; game: Game }>({
  host: async ({ playwright }, provide) => {
    // A normal encrypted NextAuth JWT for the isolated fixture, never an auth route/backdoor.
    // This exercises authenticated proxy requests, not Google's OAuth exchange.
    const token = await encode({
      secret: authSecret,
      token: { email: teacherEmail, name: 'E2E teacher', sub: 'e2e-teacher' },
      maxAge: 3600,
    });
    const host = await playwright.request.newContext({
      baseURL: webURL,
      extraHTTPHeaders: { Origin: webURL },
      storageState: {
        cookies: [{ name: 'next-auth.session-token', value: token, domain: '127.0.0.1',
          path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: -1 }],
        origins: [],
      },
    });
    await provide(host);
    await host.dispose();
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
