import { describe, expect, it } from "vitest";

import { hasMathLiveTextEscapes, normalizeMathFieldValueForStorage } from "@/lib/math-normalize";
import {
  getMathVirtualKeyboardLayouts,
  STUDENT_KEYBOARD_HIDE_KEY_CLASS,
  STUDENT_KEYBOARD_MAIN_LAYER,
  STUDENT_KEYBOARD_MORE_LAYER,
  type MathVirtualKeyboardLayout,
} from "@/lib/student-math-keyboard";

const studentLayout = (): MathVirtualKeyboardLayout => {
  const layouts = getMathVirtualKeyboardLayouts("student");
  expect(layouts).toHaveLength(1);
  return layouts[0] as MathVirtualKeyboardLayout;
};

const keys = (layout: MathVirtualKeyboardLayout) =>
  layout.layers.flatMap((layer) => layer.rows.flat()).map((key) => (typeof key === "string" ? { label: key } : key));

describe("student keyboard", () => {
  it("has a main and a second layer on the same 6 x 5 grid, so its height never changes", () => {
    const layout = studentLayout();
    expect(layout.layers.map((layer) => layer.id)).toEqual([STUDENT_KEYBOARD_MAIN_LAYER, STUDENT_KEYBOARD_MORE_LAYER]);
    for (const layer of layout.layers) {
      expect(layer.rows).toHaveLength(5);
      for (const row of layer.rows) expect(row).toHaveLength(6);
    }
  });

  it("has no functions: the answer checker cannot grade sin, log or |x|", () => {
    const inserted = keys(studentLayout()).map((key) => `${key.latex ?? ""} ${key.insert ?? ""}`).join(" ");
    expect(inserted).not.toMatch(/\\(sin|cos|tan|tg|ctg|log|ln|lg|arcsin|arccos|lim|sum|int)\b/);
    expect(inserted).not.toMatch(/\|/);
  });

  it("has every digit and the keys a school answer needs", () => {
    const inserted = keys(studentLayout()).map((key) => key.latex ?? key.insert ?? "");
    for (const value of [
      ..."0123456789",
      "{,}",
      "\\cdot",
      "\\div",
      "\\frac{#@}{#0}",
      "\\sqrt{#0}",
      "#@^2",
      "\\pi",
      "\\le",
      "\\ge",
      "\\ne",
      "\\infty",
      "\\cup",
      "\\in",
      "\\mathbb{R}",
    ]) {
      expect(inserted).toContain(value);
    }
  });

  it("offers the hide key only on the main layer and a way back from the second one", () => {
    const [main, more] = studentLayout().layers;
    const classes = (layer: typeof main) =>
      layer.rows.flat().map((key) => (typeof key === "string" ? "" : key.class ?? "")).join(" ");
    expect(classes(main)).toContain(STUDENT_KEYBOARD_HIDE_KEY_CLASS);
    expect(classes(more)).not.toContain(STUDENT_KEYBOARD_HIDE_KEY_CLASS);
    const commands = more.rows.flat().map((key) => (typeof key === "string" ? null : key.command));
    expect(commands).toContainEqual(["switchKeyboardLayer", STUDENT_KEYBOARD_MAIN_LAYER]);
  });

  it("builds a fresh copy every time, because MathLive changes layouts in place", () => {
    expect(studentLayout()).not.toBe(studentLayout());
    expect(studentLayout()).toEqual(studentLayout());
  });

  it("leaves admins and editors on MathLive's full keyboard", () => {
    expect(getMathVirtualKeyboardLayouts("default")).toEqual(["default"]);
  });
});

describe("what a math field saves for the checker", () => {
  it("restores the braces MathLive drops around single digits", () => {
    expect(normalizeMathFieldValueForStorage("\\frac34")).toBe("\\frac{3}{4}");
    expect(normalizeMathFieldValueForStorage("\\sqrt2")).toBe("\\sqrt{2}");
    expect(normalizeMathFieldValueForStorage("\\sqrt[3]8")).toBe("\\sqrt[3]{8}");
  });

  it("unwraps plain text and drops spacing commands", () => {
    expect(normalizeMathFieldValueForStorage("\\text{abc}")).toBe("abc");
    expect(normalizeMathFieldValueForStorage("2\\,5")).toBe("2 5");
    expect(normalizeMathFieldValueForStorage("  x  ")).toBe("x");
  });

  it("turns MathLive's text escapes back into LaTeX", () => {
    const escaped = "\\textbackslash frac\\textbraceleft 1\\textbraceright";
    expect(hasMathLiveTextEscapes(escaped)).toBe(true);
    expect(normalizeMathFieldValueForStorage(escaped)).toBe("\\frac{1}");
    expect(hasMathLiveTextEscapes("\\frac{1}{2}")).toBe(false);
  });

  it("keeps an empty field empty", () => {
    expect(normalizeMathFieldValueForStorage("")).toBe("");
  });
});
