const MIN_FONT_SIZE_PX = 11;
const OVERFLOW_TOLERANCE_PX = 1;

function maxContentWidth(container: HTMLElement, items: HTMLElement[]): number {
  const containerRect = container.getBoundingClientRect();
  let widest = container.scrollWidth;
  for (const item of items) {
    if (item.scrollWidth > widest) widest = item.scrollWidth;
    if (containerRect.width > 0) {
      const spanFromContainerLeft = item.getBoundingClientRect().right - containerRect.left;
      if (spanFromContainerLeft > widest) widest = spanFromContainerLeft;
    }
  }
  return widest;
}

function hasHorizontalOverflow(container: HTMLElement, items: HTMLElement[]): boolean {
  const containerWidth = container.clientWidth;
  if (containerWidth <= 0) return false;
  if (container.scrollWidth > containerWidth + OVERFLOW_TOLERANCE_PX) return true;
  const containerRect = container.getBoundingClientRect();
  for (const item of items) {
    if (item.clientWidth > 0 && item.scrollWidth > item.clientWidth + OVERFLOW_TOLERANCE_PX) {
      return true;
    }
    if (containerRect.width > 0 && item.getBoundingClientRect().right > containerRect.right + OVERFLOW_TOLERANCE_PX) {
      return true;
    }
  }
  return false;
}

function shrinkFontToFit(element: HTMLElement, items: HTMLElement[] = [], minFontSizePx = MIN_FONT_SIZE_PX): void {
  const available = element.clientWidth;
  if (available <= 0) return;
  const actual = maxContentWidth(element, items);
  if (actual <= available + OVERFLOW_TOLERANCE_PX) return;
  const computed = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(element).fontSize) : NaN;
  const currentPx = Number.isFinite(computed) && computed > 0 ? computed : 17;
  const ratio = (available / actual) * 0.97;
  let nextPx = Math.max(minFontSizePx, Math.floor(currentPx * ratio * 10) / 10);
  element.style.fontSize = `${nextPx}px`;
  // One refinement pass in case math font metrics scale slightly non-linearly.
  const remaining = maxContentWidth(element, items);
  if (remaining > element.clientWidth + OVERFLOW_TOLERANCE_PX && nextPx > minFontSizePx) {
    const secondRatio = (element.clientWidth / remaining) * 0.97;
    nextPx = Math.max(minFontSizePx, Math.floor(nextPx * secondRatio * 10) / 10);
    element.style.fontSize = `${nextPx}px`;
  }
}

/**
 * Adjusts multi-column option grids, answer-key grids, and wide statements in a
 * rendered worksheet snapshot so long formulas never clip past the right edge of the PDF.
 */
export function fitWorksheetLayout(root: HTMLElement): void {
  // 1. MCQ / select option grids: default 2 columns; fall back to 1 column when any option overflows.
  for (const grid of Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-options-grid]'))) {
    const options = Array.from(grid.querySelectorAll<HTMLElement>('[data-pdf-option]'));
    if (hasHorizontalOverflow(grid, options)) {
      grid.style.gridTemplateColumns = 'minmax(0, 1fr)';
      for (const option of options) {
        option.style.minWidth = '0';
      }
      shrinkFontToFit(grid, options);
    }
  }

  // 2. Task statements: if a single formula is still wider than the column, gently scale down its font.
  for (const statement of Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-statement]'))) {
    shrinkFontToFit(statement);
  }

  // 3. Answer-key grid: start at 3 columns, step down to 2, then 1, then shrink font if needed.
  for (const grid of Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-answers-grid]'))) {
    const entries = Array.from(grid.querySelectorAll<HTMLElement>('[data-pdf-answer-item]'));
    if (hasHorizontalOverflow(grid, entries)) {
      grid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    }
    if (hasHorizontalOverflow(grid, entries)) {
      grid.style.gridTemplateColumns = 'minmax(0, 1fr)';
    }
    shrinkFontToFit(grid, entries);
  }
}
