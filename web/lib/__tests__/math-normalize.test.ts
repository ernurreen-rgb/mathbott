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

  it("detects MathLive text-mode escapes", () => {
    expect(hasMathLiveTextEscapes("\\textbackslash sqrt[3]\\textbraceleft 6\\textbraceright")).toBe(true);
    expect(hasMathLiveTextEscapes("\\sqrt[3]{6}")).toBe(false);
  });
});

describe("normalizeMathFieldValueForStorage", () => {
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
