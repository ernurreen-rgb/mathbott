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
});
