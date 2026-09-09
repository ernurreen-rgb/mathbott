const COLLAPSE_SCROLL_Y = 112;
const EXPAND_SCROLL_Y = 48;

export function getModuleHeaderCollapsedState(
  scrollY: number,
  isCurrentlyCollapsed: boolean,
): boolean {
  const safeScrollY = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;

  return isCurrentlyCollapsed
    ? safeScrollY > EXPAND_SCROLL_Y
    : safeScrollY > COLLAPSE_SCROLL_Y;
}
