import { randomUUID } from 'node:crypto';
import { test, expect, sessionCookie } from './fixtures';
import { adminEmail, learnerEmail } from './support/settings.cjs';

test('nested folders preserve a trial draft and support navigation and administration', async ({ page, context, browser, admin, learner, trial }, testInfo) => {
  test.setTimeout(120_000);
  const name = `E2E папка / literal%2F ${randomUUID()}`;
  const create = await admin.post('/api/backend/admin/trial-tests/folders', { data: { name } });
  await expect(create).toBeOK();
  const root = await create.json();
  const emptyName = `E2E бос ${randomUUID()}`;
  const emptyResponse = await admin.post('/api/backend/admin/trial-tests/folders', { data: { name: emptyName } });
  await expect(emptyResponse).toBeOK();
  const empty = await emptyResponse.json();
  const moved = await admin.put(`/api/backend/admin/trial-tests/${trial.id}`, { multipart: { email: adminEmail, folder_id: String(root.id) } });
  await expect(moved).toBeOK();
  const draft = { email: learnerEmail, answers: { [trial.tasks[0].id]: 'A' }, current_task_index: 1 };
  await expect(await learner.put(`/api/backend/trial-tests/${trial.id}/draft`, { data: draft })).toBeOK();

  await context.addCookies([await sessionCookie(adminEmail)]);
  await page.goto('/admin/trial-tests');
  await page.getByRole('link', { name: `${name} 1 тест` }).click();
  await expect(page).toHaveURL(`/admin/trial-tests/folder/${root.id}`);
  for (const childName of ['Алгебра', 'Модуль теңдеулер']) {
    await page.getByRole('button', { name: 'Папка қосу', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Жаңа папка' });
    await dialog.getByRole('textbox', { name: 'Папка атауы' }).fill(childName);
    await expect(dialog.getByText(/Қазіргі 1 тест/)).toBeVisible();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Сақтау', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(trial.title) })).not.toBeVisible();
    const childLink = page.getByRole('link', { name: `${childName} 1 тест` });
    const destination = await childLink.getAttribute('href');
    await childLink.click();
    await expect(page).toHaveURL(destination!);
    await expect(page.getByRole('heading', { level: 1, name: childName, exact: true })).toBeVisible();
  }
  await page.reload();
  const trail = page.getByRole('navigation', { name: 'Мазмұн жолы' });
  await expect(trail).toContainText(name);
  await expect(trail).toContainText('Алгебра');
  await expect(trail).toContainText('Модуль теңдеулер');
  await expect(page.getByRole('link', { name: new RegExp(trial.title) })).toBeVisible();
  const leafURL = page.url();
  await page.screenshot({ path: testInfo.outputPath('admin-nested.png'), fullPage: true });

  const studentContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, isMobile: testInfo.project.name === 'mobile-chromium', storageState: { cookies: [await sessionCookie(learnerEmail)], origins: [] } });
  try {
    const student = await studentContext.newPage();
    await student.goto(`/trial-test?folder=${encodeURIComponent(name)}`);
    await expect(student).toHaveURL(`/trial-test?folderId=${root.id}`);
    await student.getByRole('button', { name: 'Алгебра 1 тест' }).click();
    await student.getByRole('button', { name: 'Модуль теңдеулер 1 тест' }).click();
    await expect(student.getByRole('link', { name: new RegExp(trial.title) })).toContainText('Жалғастыру');
    await student.reload();
    await expect(student.getByRole('link', { name: new RegExp(trial.title) })).toBeVisible();
    await student.screenshot({ path: testInfo.outputPath('student-nested.png'), fullPage: true });
    await student.getByRole('button', { name: 'Артқа', exact: true }).click();
    await expect(student.getByRole('button', { name: 'Модуль теңдеулер 1 тест' })).toBeVisible();
    await student.getByRole('navigation', { name: 'Мазмұн жолы' }).getByRole('button', { name: 'Сынақ тесттері', exact: true }).click();
    await expect(student.getByRole('button', { name: `${name} 1 тест` })).toBeVisible();
    await expect(student.getByRole('button', { name: new RegExp(emptyName) })).not.toBeVisible();
  } finally { await studentContext.close(); }

  // Rename a branch, move it to a different root, and keep the same leaf URL.
  await page.getByRole('navigation', { name: 'Мазмұн жолы' }).getByRole('link', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Алгебра папкасын өңдеу' }).click();
  let dialog = page.getByRole('dialog', { name: 'Папканы өңдеу' });
  await dialog.getByRole('textbox', { name: 'Папка атауы' }).fill('Алгебра жаңарды');
  await dialog.getByRole('button', { name: 'Сақтау', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Алгебра жаңарды папкасын көшіру' }).click();
  dialog = page.getByRole('dialog', { name: 'Папканы көшіру' });
  await dialog.getByRole('combobox', { name: 'Қайда көшіру керек' }).selectOption(String(empty.id));
  await dialog.getByRole('button', { name: 'Сақтау', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto(leafURL);
  await expect(page.getByRole('navigation', { name: 'Мазмұн жолы' })).toContainText(emptyName);
  await expect(page.getByRole('navigation', { name: 'Мазмұн жолы' })).toContainText('Алгебра жаңарды');
  await expect(page.getByRole('link', { name: new RegExp(trial.title) })).toBeVisible();
  const saved = await learner.get(`/api/backend/trial-tests/${trial.id}/draft`, { params: { email: learnerEmail } });
  await expect(saved).toBeOK();
  expect(await saved.json()).toEqual({ answers: draft.answers, current_task_index: 1 });

  // Old admin links resolve to the root's stable ID, and an emptied root can be deleted.
  await page.goto(`/admin/trial-tests/folders/${encodeURIComponent(name)}`);
  await expect(page).toHaveURL(`/admin/trial-tests/folder/${root.id}`);
  await page.getByRole('link', { name: 'Артқа', exact: true }).click();
  page.once('dialog', (confirmation) => confirmation.accept());
  await page.getByRole('button', { name: `${name} папкасын жою` }).click();
  await expect(page.getByRole('link', { name: `${name} 0 тест` })).not.toBeVisible();
});
