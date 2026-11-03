import type { PDFPage } from 'pdf-lib';
import { WORKSHEET_BRAND, worksheetFilename } from './bank-worksheet';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const BOTTOM = 40;
const WIDTH = PAGE_WIDTH - MARGIN * 2;

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function worksheetSnapshot(source: HTMLElement, signal: AbortSignal) {
  await import('mathlive');
  await Promise.all(['math-span', 'math-div'].map((tag) => customElements.whenDefined(tag)));
  const math = Array.from(source.querySelectorAll<HTMLElement & { render: () => void }>('math-span, math-div'));
  // MathLive lazily renders through IntersectionObserver. This offscreen print
  // document never intersects the viewport, so explicitly render every formula.
  math.forEach((element) => {
    const content = element.shadowRoot?.querySelector<HTMLElement>('[part="render"]');
    if (!content?.innerHTML || content.style.display === 'none') element.render();
  });
  const images = Array.from(source.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    try { await image.decode(); } catch { throw new Error('Есептің суреті жүктелмеді. Қайта көріңіз.'); }
    if (!image.naturalWidth) throw new Error('Есептің суреті жүктелмеді. Қайта көріңіз.');
  }));
  signal.throwIfAborted();
  const copy = source.cloneNode(true) as HTMLElement;
  const clonedMath = Array.from(copy.querySelectorAll('math-span, math-div'));
  for (const [index, cloned] of clonedMath.entries()) {
    const original = math[index];
    const rendered = original.shadowRoot?.querySelector<HTMLElement>('[part="render"]');
    if (!rendered?.innerHTML || rendered.style.display === 'none') throw new Error('Формуланы PDF-ке дайындау мүмкін болмады.');
    // Flatten shadow content into ordinary static markup. The app already loads
    // MathLive's global static CSS/fonts. No user HTML is interpreted here.
    const staticMath = document.createElement(original.tagName === 'MATH-DIV' ? 'div' : 'span');
    staticMath.style.cssText = original.style.cssText;
    staticMath.style.display = original.tagName === 'MATH-DIV' ? 'block' : 'inline-block';
    staticMath.innerHTML = rendered.innerHTML;
    cloned.replaceWith(staticMath);
  }
  // Embed already decoded same-origin images. A later network failure must not
  // turn a successfully loaded task diagram into an empty area in the PDF.
  Array.from(copy.querySelectorAll('img')).forEach((cloned, index) => {
    const original = images[index];
    const size = original.getBoundingClientRect();
    const scale = Math.min(1, size.width * 3 / original.naturalWidth, size.height * 3 / original.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(original.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(original.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Есептің суретін дайындау мүмкін болмады.');
    context.drawImage(original, 0, 0, canvas.width, canvas.height);
    cloned.src = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
  });
  Object.assign(copy.style, { position: 'fixed', left: '-20000px', top: '0px' });
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('data-pdf-snapshot', 'true');
  document.body.appendChild(copy);
  await frame();
  return copy;
}

// Oversized text blocks are split only through empty horizontal rows, so a line
// or formula is never cropped at the page edge. Ordinary tasks stay together.
function whiteRowCut(canvas: HTMLCanvasElement, start: number, maximum: number) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF суретін дайындау мүмкін болмады.');
  const end = Math.min(canvas.height, start + maximum);
  if (end === canvas.height) return end;
  const from = Math.max(start + Math.floor(maximum * 0.65), end - 500);
  const pixels = context.getImageData(0, from, canvas.width, end - from).data;
  let blank = 0;
  for (let row = end - from - 1; row >= 0; row -= 1) {
    let ink = false;
    for (let x = 0; x < canvas.width; x += 3) {
      const at = (row * canvas.width + x) * 4;
      if (pixels[at + 3] > 0 && (pixels[at] < 245 || pixels[at + 1] < 245 || pixels[at + 2] < 245)) {
        ink = true;
        break;
      }
    }
    blank = ink ? 0 : blank + 1;
    if (blank >= 3) return from + row + 1;
  }
  throw new Error('Бір есеп бетке сыймайды. Оны жинақтан алып тастаңыз немесе мәтінін қысқартыңыз.');
}

export async function exportBankWorksheet(
  root: HTMLElement,
  title: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
) {
  const [{ PDFDocument, StandardFonts, rgb }, { toCanvas, getFontEmbedCSS }] = await Promise.all([
    import('pdf-lib'), import('html-to-image'), import('mathlive'),
  ]);
  signal.throwIfAborted();
  root = await worksheetSnapshot(root, signal);
  try {
    await frame();
    await frame();
    await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
      try { await image.decode(); } catch { throw new Error('Есептің суреті жүктелмеді. Қайта көріңіз.'); }
      if (!image.naturalWidth) throw new Error('Есептің суреті жүктелмеді. Қайта көріңіз.');
    }));
    await document.fonts.ready;
    signal.throwIfAborted();
    const fontEmbedCSS = await getFontEmbedCSS(root, { preferredFontFormat: 'woff2' });
    const pdf = await PDFDocument.create();
    pdf.setTitle(title.trim() || 'Есептер жинағы');
    pdf.setAuthor(WORKSHEET_BRAND);
    pdf.setCreator('QazMath');
    let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const newPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; };
    const capture = async (node: HTMLElement) => {
      signal.throwIfAborted();
      if (node.scrollHeight > 4000) throw new Error('Бір есептің мәтіні тым ұзын. Оны жинақтан алып тастаңыз.');
      const height = Math.max(node.scrollHeight, Math.ceil(node.getBoundingClientRect().height));
      const canvas = await toCanvas(node, { pixelRatio: 3, backgroundColor: '#ffffff', fontEmbedCSS,
        preferredFontFormat: 'woff2', width: 720, height,
        style: { width: '720px', height: `${height}px`, margin: '0', boxSizing: 'border-box' } });
      signal.throwIfAborted();
      return canvas;
    };
    const place = async (canvas: HTMLCanvasElement, allowSplit = false) => {
      const scale = WIDTH / canvas.width;
      const height = canvas.height * scale;
      const fullHeight = PAGE_HEIGHT - MARGIN - BOTTOM;
      const splitLongPart = allowSplit && height > fullHeight / 2 && height > y - BOTTOM;
      if (height <= fullHeight && !splitLongPart) {
        if (height > y - BOTTOM) newPage();
        const image = await pdf.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(image, { x: MARGIN, y: y - height, width: WIDTH, height });
        y -= height + 8;
      } else {
        let start = 0;
        while (start < canvas.height) {
          signal.throwIfAborted();
          if (y - BOTTOM < 80) newPage();
          const cut = whiteRowCut(canvas, start, Math.floor((y - BOTTOM) / scale));
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = cut - start;
          const context = slice.getContext('2d');
          if (!context) throw new Error('PDF суретін дайындау мүмкін болмады.');
          context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
          const image = await pdf.embedPng(slice.toDataURL('image/png'));
          const height = slice.height * scale;
          page.drawImage(image, { x: MARGIN, y: y - height, width: WIDTH, height });
          y -= height + 8;
          start = cut;
          slice.width = 0;
          slice.height = 0;
          if (start < canvas.height) newPage();
        }
      }
      canvas.width = 0;
      canvas.height = 0;
    };

    const header = root.querySelector<HTMLElement>('[data-pdf-header]');
    if (!header) throw new Error('PDF жинағы дайын емес. Қайта көріңіз.');
    await place(await capture(header));
    const tasks = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-task]'));
    for (const [index, task] of tasks.entries()) {
      const height = task.getBoundingClientRect().height * WIDTH / 720;
      if (height <= PAGE_HEIGHT - MARGIN - BOTTOM && (index > 0 || height <= y - BOTTOM)) {
        await place(await capture(task));
      } else {
        const parts = Array.from(task.querySelectorAll<HTMLElement>('[data-pdf-part]'))
          .filter((part) => !part.parentElement?.closest('[data-pdf-part]'));
        for (const part of parts) await place(await capture(part), true);
      }
      onProgress(index + 1, tasks.length);
      await frame();
    }
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const footer = root.querySelector<HTMLElement>('[data-pdf-footer]');
    if (!footer) throw new Error('PDF жинағы дайын емес. Қайта көріңіз.');
    const footerCanvas = await capture(footer);
    const footerImage = await pdf.embedPng(footerCanvas.toDataURL('image/png'));
    const footerHeight = footerCanvas.height * WIDTH / footerCanvas.width;
    footerCanvas.width = 0;
    footerCanvas.height = 0;
    const pages = pdf.getPages();
    pages.forEach((page, index) => {
      const number = `${index + 1} / ${pages.length}`;
      page.drawImage(footerImage, { x: MARGIN, y: 16, width: WIDTH, height: footerHeight });
      page.drawText(number, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(number, 9), y: 18,
        size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    });
    const bytes = await pdf.save();
    signal.throwIfAborted();
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = worksheetFilename(title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { pages: pages.length, tasks: tasks.length };
  } finally {
    root.remove();
  }
}
