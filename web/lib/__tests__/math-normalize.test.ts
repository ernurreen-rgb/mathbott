import {
  hasMathLiveTextEscapes,
  normalizeLatexForMathDisplay,
  normalizeMathFieldValueForStorage,
} from "../math-normalize";

describe("normalizeLatexForMathDisplay", () => {
  it("repairs spaced LaTeX environment commands", () => {
    expect(
      normalizeLatexForMathDisplay(
        "\\left\\{\\begin cases4x+3\\ge11\\\\x^2-4x<12\\end cases\\right."
      )
    ).toBe("\\begin{cases}4x+3\\ge11\\\\x^2-4x<12\\end{cases}");
  });

  it("leaves normal text unchanged", () => {
    expect(normalizeLatexForMathDisplay("normal prompt text")).toBe("normal prompt text");
  });

  it("removes redundant outer left brace around cases", () => {
    expect(
      normalizeLatexForMathDisplay(
        "\\left\\{\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\right. prompt"
      )
    ).toBe("\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} prompt");
  });

  it("recovers LaTeX commands escaped by MathLive text mode", () => {
    expect(
      normalizeLatexForMathDisplay(
        "Prompt:\\textbackslash sqrt[3]\\textbraceleft 6\\textbraceright\\textbackslash cdot \\textbackslash sqrt[7]\\textbraceleft 2\\textbraceright"
      )
    ).toBe("Prompt:\\sqrt[3]{6}\\cdot \\sqrt[7]{2}");
  });

  it("splits relation commands accidentally glued to functions", () => {
    expect(normalizeLatexForMathDisplay("\\sin 2x\\gecos^{2} 2x")).toBe("\\sin 2x\\ge\\cos^{2} 2x");
  });

  it("detects MathLive text-mode escapes", () => {
    expect(hasMathLiveTextEscapes("\\textbackslash sqrt[3]\\textbraceleft 6\\textbraceright")).toBe(true);
    expect(hasMathLiveTextEscapes("\\sqrt[3]{6}")).toBe(false);
  });
});

describe("normalizeMathFieldValueForStorage", () => {
  it.each([
    [String.raw`\frac12`, String.raw`\frac{1}{2}`],
    [String.raw`\dfrac34+\tfrac56`, String.raw`\dfrac{3}{4}+\tfrac{5}{6}`],
    [String.raw`\sqrt4+\sqrt[3]8`, String.raw`\sqrt{4}+\sqrt[3]{8}`],
    [String.raw`\frac{\sqrt4}{2}`, String.raw`\frac{\sqrt{4}}{2}`],
    [String.raw`\frac{12}{34}+\sqrt{16}`, String.raw`\frac{12}{34}+\sqrt{16}`],
  ])("stores numeric MathLive arguments in groups: %s", (input, expected) => {
    expect(normalizeMathFieldValueForStorage(input)).toBe(expected);
  });

  it("normalizes MathLive text spaces back to regular spaces", () => {
    expect(
      normalizeMathFieldValueForStorage(
        "\\left\\{\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\right.\\text{ }first\\text{ }second\\text{ }third"
      )
    ).toBe("\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} first second third");
  });

  it("does not damage cases line breaks while normalizing spacing commands", () => {
    expect(
      normalizeMathFieldValueForStorage(
        "\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\quad prompt"
      )
    ).toBe("\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} prompt");
  });
});
