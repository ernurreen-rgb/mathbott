import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import { test, expect, sessionCookie } from './fixtures';
import { adminEmail } from './support/settings.cjs';

function taskImages(pdf: PDFDocument) {
  expect(pdf.getPageCount()).toBe(1);
  const objects = pdf.getPages()[0].node.Resources()?.lookup(PDFName.of('XObject'));
  expect(objects).toBeInstanceOf(PDFDict);
  const images = (objects as PDFDict).values().map((reference) => {
    const stream = pdf.context.lookup(reference);
    expect(stream).toBeInstanceOf(PDFRawStream);
    return createHash('sha256').update((stream as PDFRawStream).getContents()).digest('hex');
  });
  // The title/header may differ. Every task image and the shared footer must not.
  return images.slice(1);
}

test('worksheet fonts stay identical when changing the title and exporting repeatedly', async ({ page, context, admin }, testInfo) => {
  test.setTimeout(180_000);
  const tag = `fonts-${Date.now()}-${testInfo.project.name}`;
  const tasks = [
    { text: 'Теңдеуді шешіңіз: |x+9|=14', values: ['5', '-5;5', '-23', '-23;5'] },
    { text: 'Теңдеуді шешіңіз: 2|x+4|=12', values: ['-2', '-10;2', '-2;10', '-10'] },
    { text: 'Теңдеуді шешіңіз: 4|2x-8|=40', values: ['-9;1', '-1', '-1;9', '9'] },
    { text: 'Теңдеуді шешіңіз: \\left|\\dfrac{x+9}{2}\\right|=14', values: ['-37;19', '-5;5', '19', '-37'] },
  ];
  const ids: number[] = [];
  for (const task of tasks) {
    const response = await admin.post('/api/backend/admin/bank/tasks', { multipart: {
      email: adminEmail, text: task.text, question_type: 'mcq', answer_mode: 'choices', answer: 'A',
      topics: JSON.stringify([tag]), dedup_confirmed: 'true',
      options: JSON.stringify(task.values.map((text, i) => ({ label: 'ABCD'[i], text }))),
    } });
    await expect(response).toBeOK();
    ids.push((await response.json()).id);
  }
  await context.addCookies([await sessionCookie(adminEmail)]);
  await page.goto('/admin/bank');
  await page.getByPlaceholder('Сүзгіге тақырып қосу').fill(tag);
  await page.getByRole('button', { name: 'Тақырып қосу', exact: true }).click();
  await expect.poll(async () => {
    const labels = await page.getByRole('checkbox', { name: /PDF үшін банк/ }).evaluateAll((items) =>
      items.map((item) => item.getAttribute('aria-label') || ''));
    return labels.length === 4 && labels.every((label) => ids.includes(Number(label.match(/№(\d+)/)?.[1])));
  }).toBe(true);
  await page.getByRole('button', { name: 'Осы беттегі есептерді таңдау', exact: true }).click();
  const results: string[][] = [];
  for (const [index, title] of ['Есептер жинағы', 'Модуль теңдеулер', 'Есептер жинағы'].entries()) {
    await page.getByRole('button', { name: 'PDF дайындау', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'PDF жинағын дайындау' });
    await dialog.getByLabel('Жинақ атауы').fill(title);
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'PDF жүктеу', exact: true }).click();
    const file = await downloaded;
    const output = testInfo.outputPath(`font-export-${index + 1}.pdf`);
    await file.saveAs(output);
    const pdf = await PDFDocument.load(await readFile(output));
    expect(pdf.getTitle()).toBe(title);
    expect(file.suggestedFilename()).toBe(`${title}.pdf`);
    results.push(taskImages(pdf));
    await testInfo.attach(`font-export-${index + 1}`, { path: output, contentType: 'application/pdf' });
    await expect(dialog).toHaveCount(0);
  }
  expect(results[0]).toHaveLength(5); // Four tasks and one footer.
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
});
