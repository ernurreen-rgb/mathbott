import { render } from "@testing-library/react";
import MathRender from "../ui/MathRender";

describe("MathRender", () => {
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
    expect(mathSpans.some((span) => span.textContent?.includes("\\right|\\le"))).toBe(false);
    expect(mathSpans[0]).toHaveTextContent("\\left|2\\cos\\ x\\right|");
    expect(mathSpans[1]).toHaveTextContent("\\le");
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
});
