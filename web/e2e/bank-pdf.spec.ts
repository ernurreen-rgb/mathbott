import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import sharp from 'sharp';
import { test, expect, sessionCookie } from './fixtures';
import { adminEmail } from './support/settings.cjs';

test('selects bank tasks across pages, reorders them and downloads one 20-task PDF', async ({ page, context, admin }, testInfo) => {
  test.setTimeout(180_000);
  const tag = `PDF-${Date.now()}-${testInfo.project.name}`;
  const diagram = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180"><rect width="420" height="180" fill="white"/><path d="M40 150L200 25L370 150Z" fill="none" stroke="#1e40af" stroke-width="4"/><text x="185" y="172" font-size="22">12 cm</text></svg>')).png().toBuffer();
  const ids: number[] = [];
  for (let index = 0; index < 21; index += 1) {
    const kind = index === 2 ? 'tf' : index === 3 ? 'select' : index % 4 === 0 ? 'input' : 'mcq';
    const input = kind === 'input';
    const created = await admin.post('/api/backend/admin/bank/tasks', { multipart: {
      email: adminEmail, text: `${index === 19 ? 'Есептің шартын мұқият оқып, шешу жолын жазыңыз. '.repeat(100) : ''}Әлия үшін есепті шешіңіз: \\frac{x+${index + 1}}{2}=\\sqrt{16}. Қазақша: Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І.`,
      question_type: kind, answer_mode: input ? 'written' : 'choices',
      answer: input ? 'PRIVATE_ANSWER_KEY' : kind === 'tf' ? 'true' : kind === 'select' ? '["A","B"]' : 'A', dedup_confirmed: 'true',
      topics: JSON.stringify([tag]),
      options: input || kind === 'tf' ? '[]' : JSON.stringify(['A', 'B', 'C', 'D'].map((label, i) => ({ label, text: `${7 - index + i}` }))),
      ...(kind === 'select' ? { subquestions: JSON.stringify([{ text: 'Бірінші түбірді табыңыз', correct: 'A' }, { text: 'Екінші түбірді табыңыз', correct: 'B' }]) } : {}),
      ...(index === 1 ? { image: { name: 'triangle.png', mimeType: 'image/png', buffer: diagram } } : {}),
    } });
    await expect(created).toBeOK();
    const data = await created.json();
    ids.push(data.id);
    if (data.image_filename) await writeFile(testInfo.outputPath('fixture-image.json'), JSON.stringify({ image_filename: data.image_filename }));
  }
  await context.addCookies([await sessionCookie(adminEmail)]);
  await page.goto('/admin/bank');
  const listing = page.waitForResponse((response) => response.url().includes('/admin/bank/tasks?') && response.url().includes(encodeURIComponent(tag)));
  await page.getByPlaceholder('Сүзгіге тақырып қосу').fill(tag);
  await page.getByRole('button', { name: 'Тақырып қосу', exact: true }).click();
  expect((await (await listing).json()).total).toBe(21);
  await expect.poll(async () => {
    const labels = await page.getByRole('checkbox', { name: /PDF үшін банк/ }).evaluateAll((items) =>
      items.map((item) => item.getAttribute('aria-label') || ''));
    return labels.length === 20 && labels.every((label) => ids.includes(Number(label.match(/№(\d+)/)?.[1])));
  }).toBe(true);
  await expect(page.getByRole('checkbox', { name: /PDF үшін банк/ })).toHaveCount(20);
  await page.getByRole('button', { name: 'Осы беттегі есептерді таңдау', exact: true }).click();
  await expect(page.getByText('PDF үшін таңдалды: 20', { exact: true })).toBeVisible();
  // Replace one first-page task with the remaining task on page two.
  const removed = page.getByRole('checkbox', { name: /PDF үшін банк/ }).first();
  const removedLabel = await removed.getAttribute('aria-label');
  await removed.uncheck();
  await page.getByRole('button', { name: 'Алға', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /PDF үшін банк/ })).toHaveCount(1);
  await page.getByRole('checkbox', { name: /PDF үшін банк/ }).check();
  await expect(page.getByText('PDF үшін таңдалды: 20', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PDF дайындау', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'PDF жинағын дайындау' });
  await dialog.getByLabel('Жинақ атауы').fill('Математика - 20 есеп');
  const ordered = dialog.getByRole('list', { name: 'PDF есептерінің реті' }).getByRole('listitem');
  await expect(ordered).toHaveCount(20);
  const first = await ordered.nth(0).getByText(/^Банк №/).textContent();
  const second = await ordered.nth(1).getByText(/^Банк №/).textContent();
  await dialog.getByRole('button', { name: '2-есепті жоғары жылжыту', exact: true }).click();
  await expect(ordered.nth(0).getByText(second!, { exact: true })).toBeVisible();
  await expect(ordered.nth(1).getByText(first!, { exact: true })).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await dialog.getByRole('button', { name: 'PDF жүктеу', exact: true }).click();
  const snapshot = page.locator('[data-pdf-snapshot]');
  await expect.poll(() => snapshot.locator('.ML__latex').count()).toBeGreaterThanOrEqual(20);
  await expect(snapshot).not.toContainText('PRIVATE_ANSWER_KEY');
  await expect(snapshot).not.toContainText('Аты-жөні:');
  await expect(snapshot).not.toContainText('Сыныбы:');
  await expect(snapshot).not.toContainText('Күні:');
  await expect(snapshot.locator('[data-pdf-footer]')).toHaveText('Ернұр ағайдан есептер');
  await expect(snapshot.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const file = await download;
  expect(file.suggestedFilename()).toBe('Математика - 20 есеп.pdf');
  const output = testInfo.outputPath('bank-20-tasks.pdf');
  await file.saveAs(output);
  const bytes = await readFile(output);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getTitle()).toBe('Математика - 20 есеп');
  expect(pdf.getAuthor()).toBe('Ернұр ағайдан есептер');
  let images = 0;
  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    const objects = resources?.lookup(PDFName.of('XObject'));
    if (objects instanceof PDFDict) images += objects.keys().length;
    expect(page.getWidth()).toBeCloseTo(595.28, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
  }
  expect(images).toBeGreaterThanOrEqual(21); // Header plus every selected task.
  await expect(dialog).toHaveCount(0);
  await testInfo.attach('20-task worksheet', { path: output, contentType: 'application/pdf' });
  expect(removedLabel).toBeTruthy();
  expect(ids).toHaveLength(21);
});

test('PDF export preserves the selection on read/image failures and succeeds on retry', async ({ page, context, admin }, testInfo) => {
  test.setTimeout(120_000);
  const text = `PDF-${Date.now()}-${testInfo.project.name} суретпен берілген есеп`;
  const diagram = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="white"/><circle cx="120" cy="80" r="60" stroke="blue" stroke-width="4" fill="none"/></svg>')).png().toBuffer();
  const created = await admin.post('/api/backend/admin/bank/tasks', { multipart: {
    email: adminEmail, text, answer: 'PRIVATE_ANSWER_KEY', question_type: 'input', answer_mode: 'written',
    dedup_confirmed: 'true', image: { name: 'circle.png', mimeType: 'image/png', buffer: diagram },
  } });
  await expect(created).toBeOK();
  const task = await created.json();
  await context.addCookies([await sessionCookie(adminEmail)]);
  await page.goto('/admin/bank');
  const listing = page.waitForResponse((response) => response.url().includes('/admin/bank/tasks?') && response.url().includes('search='));
  await page.getByPlaceholder('Мәтін бойынша іздеу').fill(text);
  await listing;
  await page.getByRole('checkbox', { name: `PDF үшін банк №${task.id} есебін таңдау`, exact: true }).check();
  await page.getByRole('button', { name: 'PDF дайындау', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'PDF жинағын дайындау' });
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  const reads = `**/admin/bank/tasks/${task.id}**`;
  await page.route(reads, (route) => route.abort('internetdisconnected'));
  await dialog.getByRole('button', { name: 'PDF жүктеу', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('есебін жүктеу мүмкін болмады');
  expect(downloads).toBe(0);
  await page.unroute(reads);
  const image = `**/images/${task.image_filename}**`;
  await page.route(image, (route) => route.abort('internetdisconnected'));
  await dialog.getByRole('button', { name: 'PDF жүктеу', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('суреті жүктелмеді');
  expect(downloads).toBe(0);
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  await page.unroute(image);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF жүктеу', exact: true }).click();
  const file = await download;
  const output = testInfo.outputPath('bank-retry.pdf');
  await file.saveAs(output);
  expect((await PDFDocument.load(await readFile(output))).getPageCount()).toBe(1);
  expect(downloads).toBe(1);
});
