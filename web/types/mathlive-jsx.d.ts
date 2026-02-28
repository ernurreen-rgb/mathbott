import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MathLiveElementProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": MathLiveElementProps;
      "math-span": MathLiveElementProps;
      "math-div": MathLiveElementProps;
    }
  }
}

export {};
