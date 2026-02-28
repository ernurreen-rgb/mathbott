"use client";

import { useEffect } from "react";

interface MathRenderProps {
  latex?: string | null;
  inline?: boolean;
  className?: string;
}

const normalizeSpacesForMathDisplay = (value: string): string => {
  if (!value) return "";
  const normalized = value.replace(/\\text\{\s*\}/g, "\\ ");
  let output = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const prev = i > 0 ? normalized[i - 1] : "";
    if (ch === " " && prev !== "\\") {
      output += "\\ ";
    } else {
      output += ch;
    }
  }
  return output;
};

export default function MathRender({
  latex,
  inline = false,
  className,
}: MathRenderProps) {
  useEffect(() => {
    void import("mathlive");
  }, []);

  const content = normalizeSpacesForMathDisplay(latex || "");

  if (inline) {
    return (
      <math-span className={className}>
        {content}
      </math-span>
    );
  }

  return (
    <math-div className={className}>
      {content}
    </math-div>
  );
}
