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
const LATEX_COMMAND_NAME_RE = /^[A-Za-z]+/;

type MixedContentPart = { type: "space" | "text" | "math"; value: string };

const makeRenderKey = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return `${value.length}-${hash >>> 0}`;
};

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

const findBalancedGroupEnd = (value: string, start: number, open: string, close: string): number => {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    const previous = index > 0 ? value[index - 1] : "";
    if (char === open && previous !== "\\") {
      depth += 1;
    } else if (char === close && previous !== "\\") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return start + 1;
};

const consumeLatexDelimiter = (value: string, start: number): number => {
  let cursor = start;
  while (cursor < value.length && /\s/.test(value[cursor])) cursor += 1;
  if (cursor >= value.length) return cursor;

  if (value[cursor] === "\\") {
    cursor += 1;
    const command = value.slice(cursor).match(LATEX_COMMAND_NAME_RE)?.[0];
    if (command) return cursor + command.length;
    return Math.min(cursor + 1, value.length);
  }

  return cursor + 1;
};

const consumeLatexCommand = (value: string, start: number): number => {
  if (value[start] !== "\\") return start + 1;

  let cursor = start + 1;
  const command = value.slice(cursor).match(LATEX_COMMAND_NAME_RE)?.[0];
  if (command) {
    cursor += command.length;
  } else {
    cursor = Math.min(cursor + 1, value.length);
  }

  if (command === "left") {
    cursor = consumeLatexDelimiter(value, cursor);
    const rightIndex = value.indexOf("\\right", cursor);
    if (rightIndex !== -1) {
      return consumeLatexDelimiter(value, rightIndex + "\\right".length);
    }
  } else if (command === "right") {
    return consumeLatexDelimiter(value, cursor);
  }

  while (cursor < value.length && (value[cursor] === "[" || value[cursor] === "{")) {
    cursor = findBalancedGroupEnd(value, cursor, value[cursor], value[cursor] === "[" ? "]" : "}");
  }

  return cursor;
};

const splitEmbeddedLatexCommands = (value: string): MixedContentPart[] => {
  if (!HAS_LATEX_COMMAND_RE.test(value)) {
    return [isMathToken(value) ? { type: "math", value } : { type: "text", value }];
  }

  const parts: MixedContentPart[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const commandStart = value.indexOf("\\", cursor);
    if (commandStart === -1) {
      const text = value.slice(cursor);
      if (text) {
        parts.push(isMathToken(text) ? { type: "math", value: text } : { type: "text", value: text });
      }
      break;
    }

    if (commandStart > cursor) {
      const text = value.slice(cursor, commandStart);
      parts.push(isMathToken(text) ? { type: "math", value: text } : { type: "text", value: text });
    }

    let mathEnd = consumeLatexCommand(value, commandStart);
    while (value[mathEnd] === "\\") {
      mathEnd = consumeLatexCommand(value, mathEnd);
    }

    parts.push({ type: "math", value: value.slice(commandStart, mathEnd) });
    cursor = mathEnd;
  }

  return parts;
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
  return parts.flatMap((part) => {
    if (/^\s+$/.test(part)) {
      return [{ type: "space" as const, value: part }];
    }
    return splitEmbeddedLatexCommands(part);
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
  const valueKey = makeRenderKey(value);

  if (LATEX_ENVIRONMENT_RE.test(value)) {
    return (
      <math-span key={`${keyPrefix}-math-env-${valueKey}`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  const segments = splitBreakableMathToken(value);

  if (segments.length <= 1) {
    return (
      <math-span key={`${keyPrefix}-math-0-${valueKey}`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  return segments.map((segment, index) => {
    const segmentKey = makeRenderKey(segment.value);

    if (segment.type === "operator") {
      return (
        <span key={`${keyPrefix}-op-${index}-${segmentKey}`} className={className}>
          <wbr />
          {segment.value}
          <wbr />
        </span>
      );
    }

    return (
      <math-span key={`${keyPrefix}-math-${index}-${segmentKey}`} className={className}>
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
  const renderKey = makeRenderKey(normalizedLatex);
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
        <span key={`plain-inline-${renderKey}`} className={className} style={wrapStyle}>
          {normalizedLatex}
        </span>
      );
    }

    return (
      <div key={`plain-block-${renderKey}`} className={className} style={wrapStyle}>
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
        return <span key={`text-${index}-${makeRenderKey(part.value)}`}>{part.value}</span>;
      }
      return renderBreakableMathSegments(part.value, `mixed-${index}-${makeRenderKey(part.value)}`, className);
    });

    if (inline) {
      return (
        <span key={`mixed-inline-${renderKey}`} className={className} style={wrapStyle}>
          {contentNodes}
        </span>
      );
    }

    return (
      <div key={`mixed-block-${renderKey}`} className={className} style={wrapStyle}>
        {contentNodes}
      </div>
    );
  }

  if (inline) {
    const breakableContent = renderBreakableMathSegments(normalizedLatex, "inline", className);
    if (Array.isArray(breakableContent)) {
      return (
        <span key={`inline-wrap-${renderKey}`} className={className} style={wrapStyle}>
          {breakableContent}
        </span>
      );
    }

    return (
      <math-span key={`inline-root-${renderKey}`} className={className} style={wrapStyle}>
        {content}
      </math-span>
    );
  }

  return (
    <math-div key={`block-root-${renderKey}`} className={className} style={wrapStyle}>
      {content}
    </math-div>
  );
}
