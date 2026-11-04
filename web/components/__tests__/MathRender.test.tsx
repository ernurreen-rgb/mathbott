import { render } from "@testing-library/react";
import MathRender from "../ui/MathRender";

describe("MathRender", () => {
  it.each([false, true])("renders a text-wrapped word problem as wrapping prose (inline=%s)", (inline) => {
    const question = "Әлиде 8 алма бар. Оған тағы 7 алма берілді. Енді неше алма болды?";
    const { container } = render(<MathRender inline={inline} latex={`\\text{${question}}`} />);

    expect(container.textContent).toBe(question);
    expect(container.querySelector("math-span, math-div")).toBeNull();
    expect(container.firstElementChild).toHaveStyle({ whiteSpace: "normal", overflowWrap: "anywhere" });
  });

  it("wraps prose around a fraction while preserving text nested inside math", () => {
    const { container } = render(
      <MathRender latex={String.raw`\text{Мына бөлшекті есептеңіз: }\frac{\text{a}}{2}\text{ және жауабын жазыңыз.}`} />
    );

    expect(container).toHaveTextContent("Мына бөлшекті есептеңіз:");
    expect(container).toHaveTextContent("және жауабын жазыңыз.");
    const math = container.querySelectorAll("math-span");
    expect(math).toHaveLength(1);
    expect(math[0].textContent).toBe(String.raw`\frac{\text{a}}{2}`);
  });

  it("keeps escaped LaTeX text in the math renderer", () => {
    const { container } = render(<MathRender inline latex={String.raw`\text{50\%}`} />);

    expect(container.querySelector("math-span")?.textContent).toBe(String.raw`\text{50\%}`);
  });

  it("renders LaTeX commands attached to Cyrillic text without requiring a space", () => {
    const text = "\u0415\u0441\u0435\u043f\u0442\u0435\u04a3\u0456\u0437:";

    const { container } = render(
      <MathRender latex={`${text}\\sqrt[3]{6}\\cdot \\sqrt[7]{2}\\cdot \\sqrt[5]{4}`} />
    );

    expect(container).toHaveTextContent(text);
    expect(container.querySelectorAll("math-span")).toHaveLength(3);
    expect(container.querySelector("math-span")).toHaveTextContent("\\sqrt[3]{6}\\cdot");
  });

  it("keeps paired left/right delimiters together when math contains spaces", () => {
    const prompt = "\u0422\u0435\u04a3\u0441\u0456\u0437\u0434\u0456\u043a\u0442\u0456 \u0448\u0435\u0448:";

    const { container } = render(<MathRender latex={`${prompt}\\left|2\\cos x\\right|\\le1`} />);

    const mathSpans = Array.from(container.querySelectorAll("math-span"));

    expect(container).toHaveTextContent(prompt);
    expect(mathSpans[0]).toHaveTextContent("\\left|2\\cos\\ x\\right|");
    expect(mathSpans[0]).toHaveTextContent("\\le1");
  });

  it("renders glued relation and function commands as math", () => {
    const prompt = "\u0422\u0435\u04a3\u0441\u0456\u0437\u0434\u0456\u043a\u0442\u0456 \u0448\u0435\u0448\u0456\u04a3\u0456\u0437:";

    const { container } = render(
      <MathRender latex={`${prompt} \\left(1+\\cos 4x\\right)\\sin 2x\\gecos^{2} 2x`} />
    );

    expect(container).not.toHaveTextContent("\\gecos");
    expect(container).toHaveTextContent("\\ge\\cos^{2}");
  });

  it("splits raw polynomial math attached to Cyrillic text", () => {
    const prompt =
      "\u0422\u04e9\u043c\u0435\u043d\u0434\u0435 \u0431\u0435\u0440\u0456\u043b\u0433\u0435\u043d \u043a\u04e9\u043f\u043c\u04af\u0448\u0435\u043d\u0456";
    const tail =
      "\u0442\u04af\u0440\u0456\u043d\u0434\u0435 \u04e9\u0440\u043d\u0435\u043a\u0442\u0456\u04a3\u0456\u0437:";

    const { container } = render(
      <MathRender latex={`${prompt} ${tail}x^{3}+y^{3}+4x^{2}y+4xy^{2}`} />
    );

    const textSpans = Array.from(container.querySelectorAll("span"));
    const mathSpans = Array.from(container.querySelectorAll("math-span"));

    expect(textSpans.some((span) => span.textContent?.includes(`${tail}x`))).toBe(false);
    expect(mathSpans.some((span) => span.textContent === "x^{3}+y^{3}+4x^{2}y+4xy^{2}")).toBe(true);
  });

  it("keeps short equations with LaTeX commands in one math span", () => {
    const { container } = render(<MathRender latex="x+y=\\sigma_{1}, x\\cdot y=\\sigma_{2}" />);
    const mathSpans = Array.from(container.querySelectorAll("math-span"));

    expect(mathSpans[0].textContent).toContain("x+y=");
    expect(mathSpans[0].textContent).toContain("sigma_{1}");
  });

  it("keeps left/right delimiters inside fractions attached to the fraction", () => {
    const prompt = "\u0422\u0435\u04a3\u0441\u0456\u0437\u0434\u0456\u043a\u0442\u0456 \u0448\u0435\u0448\u0456\u04a3\u0456\u0437:";

    const { container } = render(
      <MathRender latex={`${prompt} \\frac{2}{\\left|x-2\\right|}\\ge\\left|\\frac{-3}{2x-1}\\right|`} />
    );
    const mathText = Array.from(container.querySelectorAll("math-span"))
      .map((span) => span.textContent || "")
      .join("");
    const textSpans = Array.from(container.querySelectorAll("span"));

    expect(mathText).toContain("\\frac{2}{\\left|x-2\\right|}");
    expect(textSpans.some((span) => span.textContent?.includes("\\frac{2}{"))).toBe(false);
    expect(mathText).toContain("\\ge\\left|\\frac{-3}{2x-1}\\right|");
  });

  it("keeps long sqrt commands with spaces intact and separates attached text", () => {
    const text =
      "\u04e9\u0440\u043d\u0435\u043a\u0442\u0456 \u044b\u049b\u0448\u0430\u043c\u0434\u0430 \u043c\u04b1\u043d\u0434\u0430\u0493\u044b";
    const latex = `\\sqrt{\\sqrt{\\log_{x}^{4} y+\\log_{y}^{4} x+2}-2}${text}1<x<y`;

    const { container } = render(<MathRender latex={latex} />);
    const mathText = Array.from(container.querySelectorAll("math-span"))
      .map((span) => span.textContent || "")
      .join("");

    expect(mathText).toContain("\\sqrt{\\sqrt{\\log_{x}^{4}\\ y+\\log_{y}^{4}\\ x+2}-2}");
    expect(mathText).toContain("1<x<y");
    expect(container.textContent).toContain("}-2} \u04e9\u0440\u043d\u0435\u043a\u0442\u0456");
    expect(container.textContent).toContain("\u043c\u04b1\u043d\u0434\u0430\u0493\u044b 1<x<y");
  });

  it("formats standalone integer fractions without corrupting exponents, subscripts, decimals, or school years", () => {
    const standalone = render(<MathRender latex="\\text{Есептеңіз: 1/2 + 3/4}" />);
    expect(standalone.container.textContent).toContain("\\frac{1}{2}");
    expect(standalone.container.textContent).toContain("\\frac{3}{4}");

    const powerAndSubscript = render(<MathRender latex="a^2/3 + x_1/2 + 3/2^4" />);
    expect(powerAndSubscript.container.textContent).not.toContain("a^\\frac{2}{3}");
    expect(powerAndSubscript.container.textContent).not.toContain("x_\\frac{1}{2}");
    expect(powerAndSubscript.container.textContent).not.toContain("\\frac{3}{2}^4");
    expect(powerAndSubscript.container.textContent).toContain("a^2/3");
    expect(powerAndSubscript.container.textContent).toContain("x_1/2");
    expect(powerAndSubscript.container.textContent).toContain("3/2^4");

    const decimals = render(<MathRender latex="1.5/2 + 3/2.5 + 1,5/2" />);
    expect(decimals.container.textContent).not.toContain("\\frac");
    expect(decimals.container.textContent).toContain("1.5/2");
    expect(decimals.container.textContent).toContain("3/2.5");

    const schoolYear = render(<MathRender latex="2025/2026 оқу жылы" />);
    expect(schoolYear.container.textContent).toBe("2025/2026 оқу жылы");
  });
});
