"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { normalizeLatexForMathDisplay } from "@/lib/math-normalize";

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
const LATEX_ENVIRONMENT_RE = /\\begin\{[A-Za-z*]+\}/;
const LEFT_DELIMITER_AT_END_RE = /(\\left(?:\\[A-Za-z]+|\\[{}.]|[()[\]|.])\s*)$/;
const RIGHT_DELIMITER_AT_START_RE = /^(\s*\\right(?:\\[A-Za-z]+|\\[{}.]|[()[\]|.]))/;

type MixedContentPart = { type: "space" | "text" | "math"; value: string };

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

const splitLatexEnvironmentBlocks = (value: string): Array<{ type: "text" | "math"; value: string }> => {
  const parts: Array<{ type: "text" | "math"; value: string }> = [];
  let cursor = 0;

  while (cursor < value.length) {
    const beginIndex = value.indexOf("\\begin{", cursor);
    if (beginIndex === -1) break;

    const envNameStart = beginIndex + "\\begin{".length;
    const envNameEnd = value.indexOf("}", envNameStart);
    if (envNameEnd === -1) break;

    const envName = value.slice(envNameStart, envNameEnd);
    if (!/^[A-Za-z*]+$/.test(envName)) {
      cursor = envNameStart;
      continue;
    }

    const endToken = `\\end{${envName}}`;
    const endIndex = value.indexOf(endToken, envNameEnd + 1);
    if (endIndex === -1) break;

    let mathStart = beginIndex;
    const leftCandidate = value.slice(cursor, beginIndex).match(LEFT_DELIMITER_AT_END_RE);
    if (leftCandidate?.index !== undefined) {
      mathStart = cursor + leftCandidate.index;
    }

    let mathEnd = endIndex + endToken.length;
    const rightCandidate = value.slice(mathEnd).match(RIGHT_DELIMITER_AT_START_RE);
    if (rightCandidate) {
      mathEnd += rightCandidate[1].length;
    }

    if (mathStart > cursor) {
      parts.push({ type: "text", value: value.slice(cursor, mathStart) });
    }
    parts.push({ type: "math", value: value.slice(mathStart, mathEnd) });
    cursor = mathEnd;
  }

  if (cursor === 0) {
    return [{ type: "text", value }];
  }
  if (cursor < value.length) {
    parts.push({ type: "text", value: value.slice(cursor) });
  }
  return parts;
};

const splitMixedContent = (value: string): MixedContentPart[] => {
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
  if (LATEX_ENVIRONMENT_RE.test(value)) {
    return (
      <math-span key={`${keyPrefix}-math-env`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

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

  const normalizedLatex = normalizeLatexForMathDisplay(latex || "");
  const content = normalizeSpacesForMathDisplay(normalizedLatex);
  const wrapStyle: CSSProperties = {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    maxWidth: "100%",
  };
  const protectedParts = splitLatexEnvironmentBlocks(normalizedLatex);
  const mixedParts = protectedParts.flatMap((part) =>
    part.type === "math" ? [{ type: "math" as const, value: part.value }] : splitMixedContent(part.value)
  );
  const hasTextPart = mixedParts.some((part) => part.type === "text");
  const hasMathPart = mixedParts.some((part) => part.type === "math");

  if (shouldRenderAsPlainText(normalizedLatex)) {
    if (inline) {
      return (
        <span className={className} style={wrapStyle}>
          {normalizedLatex}
        </span>
      );
    }

    return (
      <div className={className} style={wrapStyle}>
        {normalizedLatex}
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
    const breakableContent = renderBreakableMathSegments(normalizedLatex, "inline", className);
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
