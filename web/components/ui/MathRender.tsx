"use client";

import { Fragment, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  LATEX_ENVIRONMENT_RE,
  makeRenderKey,
  normalizeSpacesForMathDisplay,
  splitMathRenderContent,
  toBreakableMathRenderSegments,
} from "@/lib/math-content";

export { splitMathRenderContent, type MathContentPart } from "@/lib/math-content";

interface MathRenderProps {
  latex?: string | null;
  inline?: boolean;
  className?: string;
}

const renderBreakableMathSegments = (value: string, keyPrefix: string, className?: string) => {
  const valueKey = makeRenderKey(value);

  if (LATEX_ENVIRONMENT_RE.test(value)) {
    return (
      <math-span key={`${keyPrefix}-math-env-${valueKey}`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  if (value.length <= 24) {
    return (
      <math-span key={`${keyPrefix}-math-short-${valueKey}`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  const segments = toBreakableMathRenderSegments(value);

  if (segments.length <= 1) {
    return (
      <math-span key={`${keyPrefix}-math-0-${valueKey}`} className={className}>
        {normalizeSpacesForMathDisplay(value)}
      </math-span>
    );
  }

  return segments.map((segment, index) => {
    const segmentKey = makeRenderKey(segment.type === "operator" ? segment.value : segment.latex);

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
      <Fragment key={`${keyPrefix}-math-${index}-${segmentKey}`}>
        {segment.leadingSpace ? " " : null}
        {segment.latex ? (
          <math-span className={className}>
            {segment.latex}
          </math-span>
        ) : null}
        {segment.trailingSpace && (segment.latex || !segment.leadingSpace) ? " " : null}
      </Fragment>
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

  const { mode, displayLatex, parts: mixedParts } = splitMathRenderContent(latex);
  const renderKey = makeRenderKey(displayLatex);
  const content = normalizeSpacesForMathDisplay(displayLatex);
  const wrapStyle: CSSProperties = {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    maxWidth: "100%",
  };

  if (mode === "plain") {
    const plainText = mixedParts[0]?.value ?? "";
    if (inline) {
      return (
        <span key={`plain-inline-${renderKey}`} className={className} style={wrapStyle}>
          {plainText}
        </span>
      );
    }

    return (
      <div key={`plain-block-${renderKey}`} className={className} style={wrapStyle}>
        {plainText}
      </div>
    );
  }

  if (mode === "mixed") {
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
    const breakableContent = renderBreakableMathSegments(displayLatex, "inline", className);
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
