import type { CSSProperties } from "react";
import { TaskTextScale } from "@/types";

export const WORD_FONT_SIZES = [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;

export const TASK_TEXT_SCALE_OPTIONS: Array<{ value: TaskTextScale; label: string }> =
  WORD_FONT_SIZES.map((size) => ({ value: String(size), label: String(size) }));

export const MIN_TASK_FONT_SIZE = 8;
export const MAX_TASK_FONT_SIZE = 72;
export const DEFAULT_MOBILE_TASK_FONT_SIZE = 16;
export const DEFAULT_DESKTOP_TASK_FONT_SIZE = 20;

export type TaskFontViewport = "mobile" | "desktop";

const clampFontSize = (value: number): number =>
  Math.min(MAX_TASK_FONT_SIZE, Math.max(MIN_TASK_FONT_SIZE, Math.round(value)));

export const parseTaskFontSizePx = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < MIN_TASK_FONT_SIZE || parsed > MAX_TASK_FONT_SIZE) {
    return null;
  }
  return Math.round(parsed);
};

export const parseTaskFontSizePair = (
  value?: string | null
): { mobile: number; desktop: number } | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const mobile = parseTaskFontSizePx(parts[0]);
    const desktop = parseTaskFontSizePx(parts[1]);
    if (mobile === null || desktop === null) return null;
    return { mobile, desktop };
  }
  const single = parseTaskFontSizePx(trimmed);
  if (single !== null) {
    return { mobile: single, desktop: single };
  }
  return null;
};

export const getTaskFontSizes = (
  scale?: TaskTextScale | null
): { mobile: number; desktop: number } => {
  const pair = parseTaskFontSizePair(scale);
  if (pair) return pair;
  if (scale === "sm") return { mobile: 15, desktop: 18 };
  if (scale === "lg") return { mobile: 18, desktop: 24 };
  return { mobile: DEFAULT_MOBILE_TASK_FONT_SIZE, desktop: DEFAULT_DESKTOP_TASK_FONT_SIZE };
};

export const formatTaskTextScalePair = (mobile: number, desktop: number): TaskTextScale =>
  `${clampFontSize(mobile)}:${clampFontSize(desktop)}`;

export const normalizeTaskTextScale = (value?: string | null): TaskTextScale => {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  if (!value) return "md";
  const trimmed = value.trim();
  if (trimmed.includes(":")) {
    const pair = parseTaskFontSizePair(trimmed);
    if (pair) {
      return `${pair.mobile}:${pair.desktop}`;
    }
    return "md";
  }
  const numeric = parseTaskFontSizePx(trimmed);
  if (numeric !== null) {
    return String(numeric);
  }
  return "md";
};

export const getTaskTextScaleFontSizePx = (
  scale?: TaskTextScale | null,
  viewport: TaskFontViewport = "desktop"
): number => {
  const sizes = getTaskFontSizes(scale);
  return viewport === "mobile" ? sizes.mobile : sizes.desktop;
};

export const getTaskTextScaleStyle = (
  scale?: TaskTextScale | null,
  forcedViewport?: TaskFontViewport
): CSSProperties => {
  const sizes = getTaskFontSizes(scale);
  if (forcedViewport) {
    return {
      fontSize: `${forcedViewport === "mobile" ? sizes.mobile : sizes.desktop}px`,
    };
  }
  return {
    "--task-font-mobile": `${sizes.mobile}px`,
    "--task-font-desktop": `${sizes.desktop}px`,
  } as CSSProperties;
};

export const getTaskTextScaleClass = (_scale?: TaskTextScale | null): string =>
  "task-scale-responsive";
