import { describe, expect, it } from "vitest";

import {
  normalizeSpacesForMathDisplay,
  splitBreakableMathToken,
  splitMathRenderContent,
  toBreakableMathRenderSegments,
} from "@/lib/math-content";

describe("math-content formatting & MathRender safety", () => {
  it("never leaves dangling trailing backslash-space in normalizeSpacesForMathDisplay", () => {
    expect(normalizeSpacesForMathDisplay("a ")).toBe("a");
    expect(normalizeSpacesForMathDisplay(" \\frac{1}{4},\\; b ")).toBe("\\frac{1}{4},\\;\\ b");
    expect(normalizeSpacesForMathDisplay("a\\ ")).toBe("a");
    expect(normalizeSpacesForMathDisplay("a\\text{ }")).toBe("a");
    expect(normalizeSpacesForMathDisplay("x = 1\\\\")).toBe("x\\ =\\ 1\\\\");
    expect(normalizeSpacesForMathDisplay("2x + 1")).toBe("2x\\ +\\ 1");
  });

  it("splits long multi-assignment options (#26823) without trailing \\ before = and preserves spaces", () => {
    const option = String.raw`a = \frac{1}{4},\; b = -\frac{1}{2},\; c = \frac{1}{4}`;
    expect(splitBreakableMathToken(option).length).toBeGreaterThan(1);

    const segments = toBreakableMathRenderSegments(option);
    expect(segments).toEqual([
      { type: "math", latex: "a", leadingSpace: false, trailingSpace: true },
      { type: "operator", value: "=" },
      { type: "math", latex: String.raw`\frac{1}{4},\;\ b`, leadingSpace: true, trailingSpace: true },
      { type: "operator", value: "=" },
      { type: "math", latex: String.raw`-\frac{1}{2},\;\ c`, leadingSpace: true, trailingSpace: true },
      { type: "operator", value: "=" },
      { type: "math", latex: String.raw`\frac{1}{4}`, leadingSpace: true, trailingSpace: false },
    ]);

    for (const seg of segments) {
      if (seg.type === "math") {
        expect(/(?:^|[^\\])(?:\\\\)*\\$/.test(seg.latex.trim())).toBe(false);
      }
    }
  });

  it("keeps Kazakh/Russian hyphenated suffixes attached without splitting into '1 - ге'", () => {
    const prompt = "Үш санның қосындысы 1-ге тең, ал ax^2 + bx + c = 0 квадрат теңдеуінің жалғыз x = -1 шешімі бар болатындай a, b және c сандарын табыңыз.";
    const { mode, parts } = splitMathRenderContent(prompt);
    expect(mode).toBe("mixed");
    expect(parts.some((p) => p.type === "text" && p.value === "1-ге")).toBe(true);
    expect(parts.some((p) => p.type === "math" && p.value === "1-")).toBe(false);

    const deg = splitMathRenderContent(String.raw`Бұрыш 60^\circ-қа тең.`);
    expect(deg.parts).toEqual([
      { type: "text", value: "Бұрыш" },
      { type: "space", value: " " },
      { type: "math", value: String.raw`60^\circ` },
      { type: "text", value: "-қа" },
      { type: "space", value: " " },
      { type: "text", value: "тең." },
    ]);

    const pow = splitMathRenderContent("x^2-ге тең.");
    expect(pow.parts).toEqual([
      { type: "math", value: "x^2" },
      { type: "text", value: "-ге" },
      { type: "space", value: " " },
      { type: "text", value: "тең." },
    ]);

    const sub = splitMathRenderContent("Егер 2x-3=5 болса");
    expect(sub.parts.some((p) => p.type === "math" && p.value === "2x-3=5")).toBe(true);
  });

  it("renders LaTeX spacing and percent escapes (e.g. #30898 and #28863) in math mode instead of raw plain text", () => {
    const vecPrompt = "Үшбұрыш өзінің A(1;\\; 1;\\; 2),\\; B(3;\\; 4;\\; 2) және C(5;\\; 6;\\; 4) төбелерінің координаттарымен берілген.";
    const vec = splitMathRenderContent(vecPrompt);
    expect(vec.mode).toBe("mixed");
    expect(vec.parts.every((p) => p.type !== "text" || !p.value.includes("\\"))).toBe(true);

    const pctPrompt = "Арифметикалық прогрессияның сегізінші мүшесі төртінші мүшенің 40\\%-ын құрайды, ал қосындысы 2{,}8-ге тең.";
    const pct = splitMathRenderContent(pctPrompt);
    expect(pct.mode).toBe("mixed");
    expect(pct.parts).toEqual(
      expect.arrayContaining([
        { type: "math", value: "40\\%" },
        { type: "text", value: "-ын" },
        { type: "math", value: "2{,}8" },
        { type: "text", value: "-ге" },
      ])
    );

    const plainPct = splitMathRenderContent("48 санының 50\\%-ын табыңыз:");
    expect(plainPct.mode).toBe("mixed");
    expect(plainPct.parts).toEqual(
      expect.arrayContaining([
        { type: "math", value: "50\\%" },
        { type: "text", value: "-ын" },
      ])
    );
  });
});
