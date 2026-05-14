import { normalizeLatexForMathDisplay, normalizeMathFieldValueForStorage } from "../math-normalize";

describe("normalizeLatexForMathDisplay", () => {
  it("repairs spaced LaTeX environment commands", () => {
    expect(
      normalizeLatexForMathDisplay(
        "\\left\\{\\begin cases4x+3\\ge11\\\\x^2-4x<12\\end cases\\right."
      )
    ).toBe("\\begin{cases}4x+3\\ge11\\\\x^2-4x<12\\end{cases}");
  });

  it("leaves normal text unchanged", () => {
    expect(normalizeLatexForMathDisplay("теңсіздіктер жүйесін табыңыз")).toBe(
      "теңсіздіктер жүйесін табыңыз"
    );
  });

  it("removes redundant outer left brace around cases", () => {
    expect(
      normalizeLatexForMathDisplay(
        "\\left\\{\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\right. теңсіздіктер"
      )
    ).toBe("\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} теңсіздіктер");
  });
});

describe("normalizeMathFieldValueForStorage", () => {
  it("normalizes MathLive text spaces back to regular spaces", () => {
    expect(
      normalizeMathFieldValueForStorage(
        "\\left\\{\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\right.\\text{ }теңсіздіктер\\text{ }жүйесін\\text{ }табыңыз"
      )
    ).toBe(
      "\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} теңсіздіктер жүйесін табыңыз"
    );
  });

  it("does not damage cases line breaks while normalizing spacing commands", () => {
    expect(
      normalizeMathFieldValueForStorage(
        "\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases}\\quad теңсіздіктер"
      )
    ).toBe("\\begin{cases}4x+3\\ge11 \\\\ x^2-4x<12\\end{cases} теңсіздіктер");
  });
});
