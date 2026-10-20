import type { CSSProperties } from "react";
import { TaskTextScale } from "@/types";

export const WORD_FONT_SIZES = [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;

export const TASK_TEXT_SCALE_OPTIONS: Array<{ value: TaskTextScale; label: string }> =
  WORD_FONT_SIZES.map((size) => ({ value: String(size), label: String(size) }));

export const MIN_TASK_FONT_SIZE = 8;
export const MAX_TASK_FONT_SIZE = 72;
export const DEFAULT_TASK_FONT_SIZE = 18;

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

export const normalizeTaskTextScale = (value?: string | null): TaskTextScale => {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  const numeric = parseTaskFontSizePx(value);
  if (numeric !== null) {
    return String(numeric);
  }
  return "md";
};

export const getTaskTextScaleFontSizePx = (scale?: TaskTextScale | null): number => {
  const numeric = parseTaskFontSizePx(scale);
  if (numeric !== null) return numeric;
  if (scale === "sm") return 16;
  if (scale === "lg") return 20;
  return DEFAULT_TASK_FONT_SIZE;
};

export const getTaskTextScaleStyle = (scale?: TaskTextScale | null): CSSProperties | undefined => {
  const numeric = parseTaskFontSizePx(scale);
  if (numeric !== null) {
    return { fontSize: `${numeric}px` };
  }
  return undefined;
};

export const getTaskTextScaleClass = (scale: TaskTextScale): string => {
  if (parseTaskFontSizePx(scale) !== null) return "";
  if (scale === "sm") return "text-base";
  if (scale === "lg") return "text-xl md:text-2xl";
  return "text-lg";
};
