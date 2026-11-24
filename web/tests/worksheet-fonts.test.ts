import { describe, expect, it } from "vitest";
import { customCollectionTitle } from "@/lib/constructor-export";
import { validateWorksheetFontCSS } from "@/lib/worksheet-fonts";

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
