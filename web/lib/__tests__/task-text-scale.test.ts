import { describe, expect, it } from "@jest/globals";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "../task-text-scale";

describe("task-text-scale helpers", () => {
  it("normalizes supported values", () => {
    expect(normalizeTaskTextScale("sm")).toBe("sm");
    expect(normalizeTaskTextScale("md")).toBe("md");
    expect(normalizeTaskTextScale("lg")).toBe("lg");
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
  });
});
