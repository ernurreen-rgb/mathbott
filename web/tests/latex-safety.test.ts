import { describe, expect, it } from "vitest";

import { stripUnsafeLatexCommands } from "@/lib/latex-safety";
import { normalizeLatexForMathDisplay } from "@/lib/math-normalize";

describe("stripUnsafeLatexCommands", () => {
  it("keeps the content but drops CSS and attribute arguments", () => {
    expect(stripUnsafeLatexCommands("\\htmlStyle{position:fixed;inset:0}{x+1}")).toBe("{x+1}");
    expect(stripUnsafeLatexCommands("a\\style{color:red}{b}c")).toBe("a{b}c");
    expect(stripUnsafeLatexCommands("\\htmlData{foo=bar}{2}")).toBe("{2}");
    expect(stripUnsafeLatexCommands("\\class{x}{y} \\htmlClass{x}{y}")).toBe("{y} {y}");
    expect(stripUnsafeLatexCommands("\\cssId{a}{1}\\htmlId{b}{2}")).toBe("{1}{2}");
    expect(stripUnsafeLatexCommands("\\href{https://evil.example}{click}")).toBe("{click}");
  });

  it("handles spaces, nesting and commands hidden inside the content", () => {
    expect(stripUnsafeLatexCommands("\\htmlStyle {a:b} {\\frac{1}{2}}")).toBe("{\\frac{1}{2}}");
    expect(stripUnsafeLatexCommands("\\htmlStyle{a}{\\style{b}{x}}")).toBe("{{x}}");
    expect(stripUnsafeLatexCommands("\\htmlStyle{a:{b}}{x}")).toBe("{x}");
  });

  it("drops the raw CSS options of \\enclose and \\bbox", () => {
    expect(stripUnsafeLatexCommands('\\enclose{circle}[mathbackground="red;position:fixed"]{x}')).toBe("\\enclose{circle}{x}");
    expect(stripUnsafeLatexCommands("\\bbox[border:1px solid red;position:fixed]{x}")).toBe("\\bbox{x}");
    expect(stripUnsafeLatexCommands("\\enclose{box}{x}")).toBe("\\enclose{box}{x}");
  });

  it("drops an unclosed attribute instead of rendering it", () => {
    expect(stripUnsafeLatexCommands("1+\\htmlStyle{position:fixed")).toBe("1+");
  });

  it("leaves ordinary math and look-alike commands untouched", () => {
    const ordinary = "\\frac{x+1}{2} \\color{red}{x} \\textstyle x \\displaystyle y \\\\ \\styled";
    expect(stripUnsafeLatexCommands(ordinary)).toBe(ordinary);
    expect(stripUnsafeLatexCommands("\\\\style{a}{b}")).toBe("\\\\style{a}{b}");
  });

  it("runs after display normalization, so escaped backslashes cannot rebuild a command", () => {
    expect(normalizeLatexForMathDisplay("\\textbackslash htmlStyle{color:red}{x}")).toBe("{x}");
  });
});
