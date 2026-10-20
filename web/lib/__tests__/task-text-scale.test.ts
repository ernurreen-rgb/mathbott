import { describe, expect, it } from "@jest/globals";
import {
  formatTaskTextScalePair,
  getTaskFontSizes,
  getTaskTextScaleClass,
  getTaskTextScaleFontSizePx,
  getTaskTextScaleStyle,
  normalizeTaskTextScale,
} from "../task-text-scale";

describe("task-text-scale helpers", () => {
  it("normalizes supported values including mobile:desktop pairs", () => {
    expect(normalizeTaskTextScale("sm")).toBe("sm");
    expect(normalizeTaskTextScale("md")).toBe("md");
    expect(normalizeTaskTextScale("lg")).toBe("lg");
    expect(normalizeTaskTextScale("15")).toBe("15");
    expect(normalizeTaskTextScale("14:20")).toBe("14:20");
  });

  it("falls back to md for unknown values", () => {
    expect(normalizeTaskTextScale()).toBe("md");
    expect(normalizeTaskTextScale(null)).toBe("md");
    expect(normalizeTaskTextScale("xl")).toBe("md");
  });

  it("returns stable classes for each scale", () => {
    expect(getTaskTextScaleClass("sm")).toBe("text-base");
    expect(getTaskTextScaleClass("md")).toBe("text-lg");
    expect(getTaskTextScaleClass("lg")).toBe("text-xl md:text-2xl");
    expect(getTaskTextScaleClass("14:20")).toBe("task-scale-responsive");
  });

  it("extracts independent mobile and desktop font sizes", () => {
    expect(getTaskFontSizes("md")).toEqual({ mobile: 16, desktop: 20 });
    expect(getTaskFontSizes("14:22")).toEqual({ mobile: 14, desktop: 22 });
    expect(getTaskTextScaleFontSizePx("14:22", "mobile")).toBe(14);
    expect(getTaskTextScaleFontSizePx("14:22", "desktop")).toBe(22);
    expect(formatTaskTextScalePair(14, 22)).toBe("14:22");
    expect(getTaskTextScaleStyle("14:22", "mobile")).toEqual({ fontSize: "14px" });
    expect(getTaskTextScaleStyle("14:22", "desktop")).toEqual({ fontSize: "22px" });
  });
});
