"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";

interface MathRenderProps {
  latex?: string | null;
  inline?: boolean;
  className?: string;
}

const HAS_CYRILLIC_RE = /[\u0400-\u04FF]/;
const HAS_MATH_MARKERS_RE = /[\\^_{}=+\-*/<>()[\]|]/;
const HAS_LATEX_COMMAND_RE = /\\[a-zA-Z]+/;
const HAS_STRONG_MATH_RE = /[{}^_=<>]/;
const HAS_DIGIT_RE = /\d/;
const IS_SINGLE_LATIN_RE = /^[A-Za-z]$/;
const TOKEN_SPLIT_RE = /(\s+)/;
const BREAKABLE_MATH_OPERATOR_RE = /[=<>]/;

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

const shouldRenderAsPlainText = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  // Natural language prompts with Cyrillic should wrap reliably, but mixed
  // strings that clearly contain LaTeX / math syntax must still go through
  // MathLive.
  if (HAS_CYRILLIC_RE.test(trimmed)) {
    return !(HAS_LATEX_COMMAND_RE.test(trimmed) || HAS_STRONG_MATH_RE.test(trimmed));
  }

  // Plain labels / text without math markers do not need MathLive rendering.
  if (!HAS_MATH_MARKERS_RE.test(trimmed)) return true;

  return false;
};

const isMathToken = (token: string): boolean => {
  if (!token) return false;
  if (HAS_CYRILLIC_RE.test(token)) return false;
  if (HAS_LATEX_COMMAND_RE.test(token)) return true;
  if (HAS_MATH_MARKERS_RE.test(token)) return true;
  if (HAS_DIGIT_RE.test(token)) return true;
  if (IS_SINGLE_LATIN_RE.test(token)) return true;
  return false;
};

const splitMixedContent = (value: string): Array<{ type: "space" | "text" | "math"; value: string }> => {
  const parts = value.split(TOKEN_SPLIT_RE).filter((part) => part.length > 0);
  return parts.map((part) => {
    if (/^\s+$/.test(part)) {
      return { type: "space" as const, value: part };
    }
    return isMathToken(part)
      ? { type: "math" as const, value: part }
      : { type: "text" as const, value: part };
  });
};

const splitBreakableMathToken = (value: string): Array<{ type: "math" | "operator"; value: string }> => {
  if (!value) return [];

  const parts: Array<{ type: "math" | "operator"; value: string }> = [];
  let buffer = "";

  for (const ch of value) {
    if (BREAKABLE_MATH_OPERATOR_RE.test(ch)) {
      if (buffer) {
        parts.push({ type: "math", value: buffer });
        buffer = "";
      }
      parts.push({ type: "operator", value: ch });
      continue;
    }
    buffer += ch;
  }

  if (buffer) {
    parts.push({ type: "math", value: buffer });
  }

  return parts;
};

const renderBreakableMathSegments = (value: string, keyPrefix: string, className?: string) => {
  const segments = splitBreakableMathToken(value);

  if (segments.length <= 1) {
    return (
      <math-span key={`${keyPrefix}-math-0`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  return segments.map((segment, index) => {
    if (segment.type === "operator") {
      return (
        <span key={`${keyPrefix}-op-${index}`} className={className}>
          <wbr />
          {segment.value}
          <wbr />
        </span>
      );
    }

    return (
      <math-span key={`${keyPrefix}-math-${index}`} className={className}>
        {normalizeSpacesForMathDisplay(segment.value)}
      </math-span>
    );
  });
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
  const wrapStyle: CSSProperties = {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    maxWidth: "100%",
  };
  const mixedParts = splitMixedContent(latex || "");
  const hasTextPart = mixedParts.some((part) => part.type === "text");
  const hasMathPart = mixedParts.some((part) => part.type === "math");

  if (shouldRenderAsPlainText(latex || "")) {
    if (inline) {
      return (
        <span className={className} style={wrapStyle}>
          {latex || ""}
        </span>
      );
    }

    return (
      <div className={className} style={wrapStyle}>
        {latex || ""}
      </div>
    );
  }

  if (hasTextPart && hasMathPart) {
    const contentNodes = mixedParts.map((part, index) => {
      if (part.type === "space") {
        return <span key={`space-${index}`}>{part.value}</span>;
      }
      if (part.type === "text") {
        return <span key={`text-${index}`}>{part.value}</span>;
      }
      return renderBreakableMathSegments(part.value, `mixed-${index}`, className);
    });

    if (inline) {
      return (
        <span className={className} style={wrapStyle}>
          {contentNodes}
        </span>
      );
    }

    return (
      <div className={className} style={wrapStyle}>
        {contentNodes}
      </div>
    );
  }

  if (inline) {
    const breakableContent = renderBreakableMathSegments(latex || "", "inline", className);
    if (Array.isArray(breakableContent)) {
      return (
        <span className={className} style={wrapStyle}>
          {breakableContent}
        </span>
      );
    }

    return (
      <math-span className={className} style={wrapStyle}>
        {content}
      </math-span>
    );
  }

  return (
    <math-div className={className} style={wrapStyle}>
      {content}
    </math-div>
  );
}
