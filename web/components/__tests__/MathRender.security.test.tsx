import { render, waitFor } from "@testing-library/react";
import MathRender from "../ui/MathRender";

// Exercise the installed library, not a mocked component or a version check.
const mathlive = jest.requireActual("mathlive") as {
  convertLatexToMarkup: (latex: string) => string;
  convertLatexToMathMl: (latex: string) => string;
};

const payloads = [
  String.raw`\text{<img src=x onerror=alert(1)>}`,
  String.raw`\mbox{<img src=x onerror=alert(1)>}`,
  String.raw`\begin{matrix}\text{<svg/onload=document.title=12345>}\end{matrix}`,
];
const injectedElements = "script, img, [onload], [onerror]";

describe("MathLive untrusted answer rendering", () => {
  it.each(payloads)("escapes HTML markup in %s", (latex) => {
    const doc = new DOMParser().parseFromString(mathlive.convertLatexToMarkup(latex), "text/html");
    expect(doc.querySelector(injectedElements)).toBeNull();
    expect(doc.body.textContent).toContain("<");
  });

  it.each(payloads)("escapes accessible MathML in %s", (latex) => {
    const doc = new DOMParser().parseFromString(mathlive.convertLatexToMathMl(latex), "text/html");
    expect(doc.querySelector(injectedElements)).toBeNull();
  });

  it("keeps fractions and roots as math rather than stripping their markup", () => {
    const latex = String.raw`\frac{1}{2}+\sqrt{x}`;
    const doc = new DOMParser().parseFromString(mathlive.convertLatexToMathMl(latex), "text/html");
    expect(doc.querySelector("mfrac")).not.toBeNull();
    expect(doc.querySelector("msqrt")).not.toBeNull();
  });

  it("keeps the stored admin-queue payload inert inside the real custom element", async () => {
    const { container } = render(<MathRender inline latex={payloads[2]} />);
    await waitFor(() => expect(container.querySelector("math-span")?.shadowRoot).toBeInstanceOf(ShadowRoot));
    const shadow = container.querySelector("math-span")!.shadowRoot!;
    await waitFor(() => expect(shadow.querySelector('[part="render"]')?.innerHTML).toBeTruthy());
    expect(shadow.querySelector(injectedElements)).toBeNull();
  });
});
