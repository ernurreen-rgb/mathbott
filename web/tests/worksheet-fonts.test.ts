import { describe, expect, it } from "vitest";
import { customCollectionTitle, reorderItems, worksheetTasks } from "@/lib/constructor-export";
import { validateWorksheetFontCSS } from "@/lib/worksheet-fonts";
import { fitWorksheetLayout } from "@/lib/worksheet-layout";

const EMBEDDED_KATEX =
  `@font-face { font-family: KaTeX_Main; src: url("data:application/font-woff;base64,AAAA") format("woff2"); }`;
const EMBEDDED_KATEX_CHARSET =
  `@font-face { font-family: "KaTeX_Math"; src: url("data:font/woff2;charset=utf-8;base64,BBBB") format("woff2"); }`;
const UNEMBEDDED_KATEX =
  `@font-face { font-family: KaTeX_Main; src: url("/_next/static/media/KaTeX_Main.woff2") format("woff2"); }`;
const UNEMBEDDED_EXTENSION_FONT =
  `@font-face { font-family: "Arial"; src: url("https://extension.example/font.woff2") format("woff2"); }`;

describe("validateWorksheetFontCSS", () => {
  it("accepts embedded KaTeX fonts (including optional charset parameter)", () => {
    const css = `${EMBEDDED_KATEX}\n${EMBEDDED_KATEX_CHARSET}`;
    expect(validateWorksheetFontCSS(css, true)).toBe(css);
  });

  it("throws when math fonts are needed but no KaTeX font was embedded", () => {
    expect(() => validateWorksheetFontCSS("", true)).toThrow();
    expect(() => validateWorksheetFontCSS(UNEMBEDDED_EXTENSION_FONT, true)).toThrow();
  });

  it("throws when any KaTeX @font-face rule failed to embed", () => {
    expect(() => validateWorksheetFontCSS(`${EMBEDDED_KATEX}\n${UNEMBEDDED_KATEX}`, true)).toThrow();
    expect(() => validateWorksheetFontCSS(UNEMBEDDED_KATEX, false)).toThrow();
  });

  it("drops unreachable non-KaTeX extension @font-face rules without failing PDF export", () => {
    const result = validateWorksheetFontCSS(`${UNEMBEDDED_EXTENSION_FONT}\n${EMBEDDED_KATEX}`, true);
    expect(result).toBe(EMBEDDED_KATEX);
    expect(validateWorksheetFontCSS(UNEMBEDDED_EXTENSION_FONT, false)).toBe("");
  });

  it("allows empty font CSS when no KaTeX fonts are used (plain text or empty math wrappers)", () => {
    expect(validateWorksheetFontCSS("", false)).toBe("");
  });
});

describe("customCollectionTitle", () => {
  it("treats auto-generated default titles and blanks as empty", () => {
    expect(customCollectionTitle("")).toBe("");
    expect(customCollectionTitle("   ")).toBe("");
    expect(customCollectionTitle("Жаңа жинақ")).toBe("");
    expect(customCollectionTitle("  жаңа жинақ  ")).toBe("");
    expect(customCollectionTitle("Новый сборник")).toBe("");
    expect(customCollectionTitle(null)).toBe("");
  });

  it("preserves teacher-provided titles", () => {
    expect(customCollectionTitle("Туынды. 10-сынып")).toBe("Туынды. 10-сынып");
    expect(customCollectionTitle("  Тригонометрия  ")).toBe("Тригонометрия");
  });
});

describe("reorderItems", () => {
  it("moves an item up or down cleanly without mutating the source array", () => {
    const src = ["a", "b", "c", "d"];
    expect(reorderItems(src, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorderItems(src, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(src).toEqual(["a", "b", "c", "d"]);
  });

  it("returns a copy unchanged for same or out-of-range indices", () => {
    expect(reorderItems([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(reorderItems([1, 2, 3], -1, 1)).toEqual([1, 2, 3]);
    expect(reorderItems([1, 2, 3], 1, 5)).toEqual([1, 2, 3]);
  });
});

describe("worksheetTasks", () => {
  it("carries each task's difficulty into PDF worksheet items", () => {
    const mapped = worksheetTasks([
      {
        id: 10,
        text: "x + 1 = 2",
        text_scale: "md",
        question_type: "input",
        answer_mode: "written",
        difficulty: "C",
        topics: ["Алгебра"],
        image_filename: null,
        options: [],
        subquestions: [],
      },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].difficulty).toBe("C");
  });
});

describe("fitWorksheetLayout", () => {
  type FakeEl = {
    style: Record<string, string>;
    clientWidth: number;
    scrollWidth: number;
    getBoundingClientRect: () => { left: number; right: number; width: number };
    querySelectorAll: (selector: string) => FakeEl[];
  };

  function makeEl(config: {
    clientWidth: number;
    scrollWidth: () => number;
    left?: number;
    right?: () => number;
    style?: Record<string, string>;
    children?: Record<string, FakeEl[]>;
  }): FakeEl {
    const left = config.left ?? -20000;
    const el: FakeEl = {
      style: { ...(config.style ?? {}) },
      clientWidth: config.clientWidth,
      get scrollWidth() {
        return config.scrollWidth();
      },
      getBoundingClientRect: () => {
        const right = config.right ? config.right() : left + config.clientWidth;
        return { left, right, width: right - left };
      },
      querySelectorAll: (selector: string) => config.children?.[selector] ?? [],
    };
    return el;
  }

  it("keeps 2-column options when they fit, and switches overflowing option grids to 1 column even offscreen (left: -20000px)", () => {
    const shortGrid = makeEl({
      clientWidth: 692,
      scrollWidth: () => 692,
      left: -19972,
      style: { gridTemplateColumns: "1fr 1fr" },
      children: {
        "[data-pdf-option]": [
          makeEl({ clientWidth: 334, scrollWidth: () => 280, left: -19972, right: () => -19638 }),
          makeEl({ clientWidth: 334, scrollWidth: () => 280, left: -19614, right: () => -19280 }),
        ],
      },
    });

    const longGrid = makeEl({
      clientWidth: 692,
      scrollWidth: () => (longGrid.style.gridTemplateColumns === "minmax(0, 1fr)" ? 580 : 692),
      left: -19972,
      style: { gridTemplateColumns: "1fr 1fr" },
      children: {
        "[data-pdf-option]": [
          makeEl({ clientWidth: 458, scrollWidth: () => 458, left: -19972, right: () => -19514 }),
          makeEl({
            clientWidth: 458,
            scrollWidth: () => 458,
            left: -19490,
            right: () => (longGrid.style.gridTemplateColumns === "minmax(0, 1fr)" ? -19514 : -19032),
          }),
        ],
      },
    });

    const ultraWideOption = makeEl({
      clientWidth: 692,
      scrollWidth: () => {
        const size = parseFloat(ultraWideGrid.style.fontSize || "17");
        return Math.round(860 * (size / 17));
      },
      left: -19972,
      right: () => -19972 + ultraWideOption.scrollWidth,
    });
    const ultraWideGrid: FakeEl = makeEl({
      clientWidth: 692,
      scrollWidth: () => {
        if (ultraWideGrid.style.gridTemplateColumns !== "minmax(0, 1fr)") return 1600;
        return ultraWideOption.scrollWidth;
      },
      left: -19972,
      style: { gridTemplateColumns: "1fr 1fr" },
      children: {
        "[data-pdf-option]": [ultraWideOption],
      },
    });

    const root = makeEl({
      clientWidth: 720,
      scrollWidth: () => 720,
      children: {
        "[data-pdf-options-grid]": [shortGrid, longGrid, ultraWideGrid],
      },
    });

    fitWorksheetLayout(root as unknown as HTMLElement);

    expect(shortGrid.style.gridTemplateColumns).toBe("1fr 1fr");
    expect(shortGrid.style.fontSize).toBeUndefined();

    expect(longGrid.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(longGrid.style.fontSize).toBeUndefined();

    expect(ultraWideGrid.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(parseFloat(ultraWideGrid.style.fontSize)).toBeLessThan(17);
    expect(parseFloat(ultraWideGrid.style.fontSize)).toBeGreaterThanOrEqual(11);
  });

  it("steps down the answer-key grid from 3 columns to 2 or 1 when answers overflow", () => {
    const answersGrid = makeEl({
      clientWidth: 720,
      scrollWidth: () => {
        if (answersGrid.style.gridTemplateColumns === "minmax(0, 1fr)") return 600;
        if (answersGrid.style.gridTemplateColumns === "repeat(2, minmax(0, 1fr))") return 820;
        return 1100;
      },
      style: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
      children: { "[data-pdf-answer-item]": [] },
    });

    const root = makeEl({
      clientWidth: 720,
      scrollWidth: () => 720,
      children: { "[data-pdf-answers-grid]": [answersGrid] },
    });

    fitWorksheetLayout(root as unknown as HTMLElement);

    expect(answersGrid.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
  });
});
