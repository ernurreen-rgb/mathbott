import { normalizeLatexForMathDisplay } from "../math-normalize";

describe("normalizeLatexForMathDisplay", () => {
  it("repairs spaced LaTeX environment commands", () => {
    expect(
      normalizeLatexForMathDisplay(
        "\\left\\{\\begin cases4x+3\\ge11\\\\x^2-4x<12\\end cases\\right."
      )
    ).toBe("\\left\\{\\begin{cases}4x+3\\ge11\\\\x^2-4x<12\\end{cases}\\right.");
  });

  it("leaves normal text unchanged", () => {
    expect(normalizeLatexForMathDisplay("теңсіздіктер жүйесін табыңыз")).toBe(
      "теңсіздіктер жүйесін табыңыз"
    );
  });
});
