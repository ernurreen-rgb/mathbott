import {
  getMathVirtualKeyboardLayouts,
  STUDENT_MATH_KEYBOARD_LAYOUTS,
} from "../student-math-keyboard";

describe("student math keyboard", () => {
  it("keeps the standard MathLive keyboard for regular editor fields", () => {
    expect(getMathVirtualKeyboardLayouts("default")).toEqual(["default"]);
  });

  it("provides a compact student layout with common school math keys", () => {
    expect(getMathVirtualKeyboardLayouts("student")).toBe(STUDENT_MATH_KEYBOARD_LAYOUTS);
    expect(STUDENT_MATH_KEYBOARD_LAYOUTS).toHaveLength(2);

    const serialized = JSON.stringify(STUDENT_MATH_KEYBOARD_LAYOUTS);
    expect(serialized).toContain("\\\\frac{#@}{#0}");
    expect(serialized).toContain("\\\\sqrt{#0}");
    expect(serialized).toContain("#@^{#?}");
    expect(serialized).toContain("\\\\pi");
    expect(serialized).toContain("\\\\le");
    expect(serialized).toContain("\\\\in");
    expect(serialized).toContain("\\\\mathbb{R}");
    expect(serialized).toContain("\\\\cup");
    expect(serialized).toContain("\\\\infty");
    expect(serialized).toContain("[backspace]");
    expect(serialized).toContain("[hide-keyboard]");
  });
});
