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
});
