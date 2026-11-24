/**
 * A PPTX deck of constructor tasks, laid out like the teacher's live-lesson slides: a title slide,
 * one task per slide under "Есеп №N:" directly on the user's background, and the answer key at
 * the end.
 *
 * Formulas are PowerPoint equations (OMML) the teacher can edit in place. Each text box with a
 * formula is written twice inside mc:AlternateContent: the equation version for PowerPoint and a
 * plain-text version for apps without equations, so nothing is ever lost.
 */
import { hasEmptyMcqOptionTexts, parseComparisonTask } from "@/lib/comparison-task";
import { splitMathRenderContent } from "@/lib/math-content";
import { normalizeLatexForMathDisplay } from "@/lib/math-normalize";
import { taskAnswerPieces, type AnswerPiece, type ConstructorLanguage } from "@/lib/constructor-answers";
import type { ConstructorTask } from "@/types/constructor";
import { DEFAULT_PPTX_FONT } from "./fonts";
import { escapeXml, latexToOmml, parseLatex, type MathNode } from "./latex-omml";
import {
  buildPackageFiles,
  EMU_PER_INCH,
  NS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type MediaExtension,
  type PackageSlide,
} from "./package";

export interface DeckImage {
  bytes: Uint8Array;
  ext: MediaExtension;
  width: number;
  height: number;
}

export interface DeckInput {
  title: string;
  author: string;
  language: ConstructorLanguage;
  /** Tasks with answers, in slide order. */
  tasks: ConstructorTask[];
  titleImage?: DeckImage | null;
  background?: DeckImage | null;
  /** Task id → its picture. */
  taskImages?: Map<number, DeckImage>;
  accent?: string;
  /** The text font (see lib/pptx/fonts.ts); JUZ40 FONTS when not given. */
  font?: string;
}

const LABELS: Record<ConstructorLanguage, { task: string; answers: string; count: (n: number) => string; true: string; false: string }> = {
  kk: { task: "Есеп", answers: "Жауаптар", count: (n) => `${n} есеп`, true: "Дұрыс", false: "Жалған" },
  ru: {
    task: "Задача",
    answers: "Ответы",
    count: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "задача" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "задачи" : "задач"}`,
    true: "Верно",
    false: "Неверно",
  },
};

const LANG_TAG: Record<ConstructorLanguage, string> = { kk: "kk-KZ", ru: "ru-RU" };
const TEXT_COLOR = "111827";
const MUTED_COLOR = "64748B";
const DEFAULT_ACCENT = "2436AE";
const inch = (value: number) => Math.round(value * EMU_PER_INCH);

// Where the example deck puts its task: 0.7 in from the left, 1.5 in from the top, 10.96 in wide,
// clear of the branding a background carries above it. The text sits on the background itself.
const AREA = { x: 638088, y: 1378221, w: 10019752 };
const HEADER = { x: AREA.x + inch(0.16), y: AREA.y + inch(0.14), w: AREA.w - inch(0.32), h: inch(0.45) };
const BODY_TOP = AREA.y + inch(0.68);
const BODY = { x: AREA.x + inch(0.2), y: BODY_TOP, w: AREA.w - inch(0.4), h: SLIDE_HEIGHT - inch(0.5) - BODY_TOP };
/** The estimate of a text's height runs low on stacked fractions; keep this much room spare. */
const FIT_MARGIN = 1.12;
const BODY_SIZES = [2400, 2200, 2000, 1800, 1600];
const ANSWERS_PER_COLUMN = 10;
const ANSWER_COLUMNS = 3;

type Inline =
  | { kind: "text"; text: string; bold?: boolean; color?: string }
  | { kind: "math"; latex: string }
  | { kind: "br" };

interface Paragraph {
  inlines: Inline[];
  /** Line spacing in percent × 1000 (120000 = 120 %). */
  lineSpacing: number;
  spaceAfter: number;
}

/**
 * A paragraph that is one formula, optionally after a bold label ("A) "), becomes a display
 * equation (m:oMathPara), as in the teacher's deck: fractions keep their full size there, while
 * PowerPoint shrinks them inside a line of text.
 */
function displayFormula(paragraph: Paragraph): { label: string | null; labelColor?: string; latex: string } | null {
  const inlines = paragraph.inlines.filter((inline) => !(inline.kind === "text" && !inline.text.trim() && !inline.bold));
  if (inlines.length === 1 && inlines[0].kind === "math") return { label: null, latex: inlines[0].latex };
  if (inlines.length === 2 && inlines[0].kind === "text" && inlines[0].bold && inlines[1].kind === "math") {
    return { label: inlines[0].text, labelColor: inlines[0].color, latex: inlines[1].latex };
  }
  return null;
}

interface TextStyle {
  size: number;
  /** The text font; formulas are Cambria Math whatever it is. */
  font: string;
  language: string;
  color: string;
}

function isStandaloneCommand(text: string, start: number, name: "left" | "right"): boolean {
  if (!text.startsWith(`\\${name}`, start)) return false;
  const next = text[start + name.length + 1];
  return !next || !/[A-Za-z]/.test(next);
}

function skipDelimiterToken(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (cursor >= text.length) return cursor;
  if (text[cursor] === "\\") {
    cursor += 1;
    const cmd = text.slice(cursor).match(/^[A-Za-z]+/)?.[0];
    return cmd ? cursor + cmd.length : Math.min(cursor + 1, text.length);
  }
  return cursor + 1;
}

function findBalancedEnvironmentEnd(text: string, start: number): number {
  const firstClose = text.indexOf("}", start + "\\begin{".length);
  if (firstClose === -1) return -1;
  const rootEnv = text.slice(start + "\\begin{".length, firstClose);
  if (!/^[A-Za-z*]+$/.test(rootEnv)) return -1;
  const stack = [rootEnv];
  let i = firstClose + 1;
  while (i < text.length) {
    if (text[i] === "\\" && (i === 0 || text[i - 1] !== "\\")) {
      if (text.startsWith("\\begin{", i)) {
        const close = text.indexOf("}", i + "\\begin{".length);
        if (close !== -1) {
          const name = text.slice(i + "\\begin{".length, close);
          if (/^[A-Za-z*]+$/.test(name)) {
            stack.push(name);
            i = close + 1;
            continue;
          }
        }
      } else if (text.startsWith("\\end{", i)) {
        const close = text.indexOf("}", i + "\\end{".length);
        if (close !== -1) {
          const name = text.slice(i + "\\end{".length, close);
          const matchIdx = stack.lastIndexOf(name);
          if (matchIdx !== -1) {
            stack.length = matchIdx;
            if (stack.length === 0) return close + 1;
            i = close + 1;
            continue;
          }
        }
      }
    }
    i += 1;
  }
  return -1;
}

function findBalancedLeftRightEnd(text: string, start: number): number {
  let depth = 1;
  let i = skipDelimiterToken(text, start + "\\left".length);
  while (i < text.length) {
    if (text[i] === "\\" && (i === 0 || text[i - 1] !== "\\")) {
      if (isStandaloneCommand(text, i, "left")) {
        depth += 1;
        i = skipDelimiterToken(text, i + "\\left".length);
        continue;
      }
      if (isStandaloneCommand(text, i, "right")) {
        depth -= 1;
        i = skipDelimiterToken(text, i + "\\right".length);
        if (depth === 0) return i;
        continue;
      }
    }
    i += 1;
  }
  return -1;
}

function findBalancedBracesEnd(text: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i - 1] === "\\") continue;
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Collapse newlines inside multi-line LaTeX environments, \left...\right blocks and {groups}. */
function collapseMathNewlines(value: string): string {
  const text = normalizeLatexForMathDisplay((value || "").replace(/\r\n?/g, "\n"));
  let out = "";
  let i = 0;
  while (i < text.length) {
    const prev = i > 0 ? text[i - 1] : "";
    if (prev !== "\\") {
      let spanEnd = -1;
      if (text.startsWith("\\begin{", i)) {
        spanEnd = findBalancedEnvironmentEnd(text, i);
      } else if (isStandaloneCommand(text, i, "left")) {
        spanEnd = findBalancedLeftRightEnd(text, i);
      } else if (text[i] === "{") {
        spanEnd = findBalancedBracesEnd(text, i);
      }
      if (spanEnd > i) {
        out += text.slice(i, spanEnd).replace(/\n+/g, " ");
        i = spanEnd;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** A task string → paragraphs of text and formulas, split exactly as the site shows it. */
export function contentInlines(value: string): Inline[][] {
  const paragraphs: Inline[][] = [];
  for (const block of collapseMathNewlines(value).split(/\n\s*\n/)) {
    const inlines: Inline[] = [];
    block.split("\n").forEach((line, lineIndex) => {
      if (!line.trim()) return;
      if (lineIndex > 0 && inlines.length) inlines.push({ kind: "br" });
      const parts = splitMathRenderContent(line.trim()).parts;
      for (const [index, part] of parts.entries()) {
        const last = inlines[inlines.length - 1];
        if (part.type === "math") {
          // The site breaks a formula at its spaces so long lines wrap ("\log_2" and "56" are two
          // parts). One equation must keep them together, or \log_2 loses its argument.
          if (last?.kind === "math") last.latex += part.value;
          else inlines.push({ kind: "math", latex: part.value });
        } else if (part.type === "space" && last?.kind === "math" && parts[index + 1]?.type === "math") {
          last.latex += " ";
        } else {
          if (last?.kind === "text" && !last.bold) last.text += part.value;
          else inlines.push({ kind: "text", text: part.value });
        }
      }
    });
    if (inlines.length) paragraphs.push(inlines);
  }
  return paragraphs;
}

function answerInlines(pieces: AnswerPiece[]): Inline[] {
  return pieces.flatMap((piece): Inline[] => {
    if (piece.kind === "text") return [{ kind: "text", text: piece.text }];
    const content = contentInlines(piece.latex);
    return content.flatMap((paragraph, index) => (index > 0 ? [{ kind: "text" as const, text: " " }, ...paragraph] : paragraph));
  });
}

// ---------------------------------------------------------------------------------------------
// XML pieces

function textRunProperties(style: TextStyle, options: { bold?: boolean; color?: string; font?: string } = {}) {
  const font = escapeXml(options.font ?? style.font);
  return `<a:rPr lang="${style.language}" sz="${style.size}"${options.bold ? ' b="1"' : ""} dirty="0">`
    + `<a:solidFill><a:srgbClr val="${options.color ?? style.color}"/></a:solidFill>`
    + `<a:latin typeface="${font}"/><a:cs typeface="${font}"/></a:rPr>`;
}

function textRun(text: string, style: TextStyle, options: { bold?: boolean; color?: string; font?: string } = {}) {
  if (!text) return "";
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<a:r>${textRunProperties(style, options)}<a:t${space}>${escapeXml(text)}</a:t></a:r>`;
}

function paragraphXml(paragraph: Paragraph, style: TextStyle, equations: boolean, unsupported: Set<string>, align = "l") {
  const display = equations ? displayFormula(paragraph) : null;
  const formulaOptions = { size: style.size, color: style.color, lang: style.language };
  const body = display ? (() => {
    const formula = latexToOmml(display.latex, formulaOptions);
    formula.unsupported.forEach((name) => unsupported.add(name));
    // The label is a bold upright math run. As "normal text" (m:nor) PowerPoint draws a stray
    // dash beside the first label of a text box.
    const label = display.label
      ? `<m:r><m:rPr><m:sty m:val="b"/></m:rPr>${textRunProperties(style, { bold: true, color: display.labelColor, font: "Cambria Math" })}`
        + `<m:t xml:space="preserve">${escapeXml(display.label)}</m:t></m:r>`
      : "";
    return `<a14:m><m:oMathPara xmlns:m="${NS.m}"><m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr>`
      + `<m:oMath>${label}${formula.inner}</m:oMath></m:oMathPara></a14:m>`;
  })() : paragraph.inlines.map((inline) => {
    if (inline.kind === "br") return `<a:br>${textRunProperties(style)}</a:br>`;
    if (inline.kind === "text") return textRun(inline.text, style, { bold: inline.bold, color: inline.color });
    const formula = latexToOmml(inline.latex, formulaOptions);
    formula.unsupported.forEach((name) => unsupported.add(name));
    if (equations) return `<a14:m>${formula.omml.replace("<m:oMath>", `<m:oMath xmlns:m="${NS.m}">`)}</a14:m>`;
    return textRun(formula.text, style, { font: "Cambria Math" });
  }).join("");
  return `<a:p><a:pPr algn="${align}"><a:lnSpc><a:spcPct val="${paragraph.lineSpacing}"/></a:lnSpc>`
    + `<a:spcAft><a:spcPts val="${paragraph.spaceAfter}"/></a:spcAft></a:pPr>${body}`
    + `<a:endParaRPr lang="${style.language}" sz="${style.size}" dirty="0"/></a:p>`;
}

interface Box { x: number; y: number; w: number; h: number }

const xfrm = (box: Box) => `<a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/></a:xfrm>`;

class SlideWriter {
  private nextId = 2;
  private readonly shapes: string[] = [];
  readonly media: string[] = [];
  background = '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';

  constructor(private readonly deck: DeckBuilder) {}

  private id() {
    return this.nextId++;
  }

  private relFor(name: string) {
    let index = this.media.indexOf(name);
    if (index === -1) {
      this.media.push(name);
      index = this.media.length - 1;
    }
    return `rId${index + 2}`;
  }

  setBackground(image: DeckImage, name: string) {
    // Cover the slide without stretching: crop the sides (or top and bottom) to 16:9.
    const slideRatio = SLIDE_WIDTH / SLIDE_HEIGHT;
    const ratio = image.width / Math.max(1, image.height);
    let crop = "";
    if (ratio > slideRatio * 1.01) {
      const side = Math.round(((1 - slideRatio / ratio) / 2) * 100000);
      crop = ` l="${side}" r="${side}"`;
    } else if (ratio < slideRatio / 1.01) {
      const side = Math.round(((1 - ratio / slideRatio) / 2) * 100000);
      crop = ` t="${side}" b="${side}"`;
    }
    this.background = `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${this.relFor(name)}"/>`
      + `<a:srcRect${crop}/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
  }

  textBox(name: string, box: Box, paragraphs: Paragraph[], style: TextStyle, options: { anchor?: "t" | "ctr"; align?: string } = {}) {
    const hasMath = paragraphs.some((paragraph) => paragraph.inlines.some((inline) => inline.kind === "math"));
    const id = this.id();
    const shape = (equations: boolean) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
      + `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${options.anchor ?? "t"}"><a:normAutofit/></a:bodyPr><a:lstStyle/>`
      + (paragraphs.length
        ? paragraphs.map((paragraph) => paragraphXml(paragraph, style, equations, this.deck.unsupported, options.align)).join("")
        : `<a:p><a:endParaRPr lang="${style.language}" sz="${style.size}" dirty="0"/></a:p>`)
      + "</p:txBody></p:sp>";
    if (!hasMath) {
      this.shapes.push(shape(false));
      return;
    }
    this.shapes.push(
      `<mc:AlternateContent xmlns:mc="${NS.mc}"><mc:Choice xmlns:a14="${NS.a14}" Requires="a14">${shape(true)}</mc:Choice>`
      + `<mc:Fallback>${shape(false)}</mc:Fallback></mc:AlternateContent>`,
    );
  }

  picture(name: string, description: string, box: Box, mediaName: string) {
    this.shapes.push(
      `<p:pic><p:nvPicPr><p:cNvPr id="${this.id()}" name="${escapeXml(name)}" descr="${escapeXml(description)}"/>`
      + '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
      + `<p:blipFill><a:blip r:embed="${this.relFor(mediaName)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
    );
  }

  toSlide(): PackageSlide {
    const tree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
      + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
      + `${this.shapes.join("")}</p:spTree>`;
    return {
      xml: `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld>${this.background}${tree}</p:cSld>`
        + "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>",
      media: this.media,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Fitting text into its box

function heightFactor(node: MathNode): number {
  switch (node.t) {
    case "row":
      return Math.max(1, ...node.items.map(heightFactor));
    case "frac":
      return Math.max(1, heightFactor(node.num)) * 0.85 + Math.max(1, heightFactor(node.den)) * 0.85;
    case "scripts":
      return heightFactor(node.base) + 0.2;
    case "rad":
    case "acc":
    case "bar":
      return heightFactor(node.body) + 0.15;
    case "delim":
    case "box":
      return heightFactor(node.body);
    case "func":
      return Math.max(heightFactor(node.name), heightFactor(node.arg));
    case "nary":
      return Math.max(1.8, heightFactor(node.body));
    case "lim":
      return heightFactor(node.base) + 0.5;
    case "matrix":
      return node.rows.reduce((sum, cells) => sum + Math.max(1, ...cells.map(heightFactor)), 0) * 1.1;
    case "eqarr":
      return node.rows.reduce((sum, line) => sum + heightFactor(line), 0) * 1.1;
    default:
      return 1;
  }
}

function countTall(node: MathNode): number {
  switch (node.t) {
    case "row":
      return node.items.reduce((sum, item) => sum + countTall(item), 0);
    case "frac":
    case "nary":
    case "matrix":
    case "eqarr":
      return 1;
    case "scripts":
      return countTall(node.base) + (node.sup ? countTall(node.sup) : 0);
    case "func":
      return countTall(node.arg);
    case "rad":
    case "delim":
    case "acc":
    case "bar":
    case "box":
      return countTall(node.body);
    default:
      return 0;
  }
}

function paragraphMetrics(paragraph: Paragraph) {
  let characters = 0;
  let tallest = 1;
  let tallCount = 0;
  let breaks = 0;
  for (const inline of paragraph.inlines) {
    if (inline.kind === "br") breaks += 1;
    else if (inline.kind === "text") characters += inline.text.length;
    else {
      const { node } = parseLatex(inline.latex);
      characters += latexToOmml(inline.latex, { size: 100 }).text.length * 1.1;
      tallest = Math.max(tallest, heightFactor(node));
      tallCount += countTall(node);
    }
  }
  return { characters, tallest, tallCount, breaks };
}

/** Estimated height in EMU of paragraphs at a font size in hundredths of a point, in a box this wide. */
export function estimateTextHeight(paragraphs: Paragraph[], size: number, width: number): number {
  const points = size / 100;
  const charactersPerLine = Math.max(8, Math.floor((width / EMU_PER_INCH) * 72 / (points * 0.5)));
  let total = 0;
  for (const paragraph of paragraphs) {
    const { characters, tallest, tallCount, breaks } = paragraphMetrics(paragraph);
    const lines = Math.max(1, Math.ceil(characters / charactersPerLine)) + breaks;
    const lineHeight = points * (paragraph.lineSpacing / 100000) * 1.2;
    // Each line that holds a fraction or another tall formula grows by that formula's extra height.
    const tallLines = tallest > 1 ? Math.max(1, Math.min(lines, tallCount)) : 0;
    total += lines * lineHeight + tallLines * (tallest - 1) * points * 1.25 + paragraph.spaceAfter / 100;
  }
  return Math.round((total / 72) * EMU_PER_INCH);
}

function fitSize(paragraphs: Paragraph[], box: Box): number {
  for (const size of BODY_SIZES) {
    if (estimateTextHeight(paragraphs, size, box.w) * FIT_MARGIN <= box.h) return size;
  }
  return BODY_SIZES[BODY_SIZES.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Slides

const NUMERIC_TEXT = /^[\s\d.,;:+\-−±()[\]]+$/;

/** An option's content. A plain number ("2", "-3") is written as a formula too, so all options look alike. */
const HAS_WORD = /[A-Za-zЀ-ӿ]{2,}/;

/**
 * An option's content. An option without words is one formula, so it shows as a full-size
 * display equation like the others: a plain number ("2", "-3") and a sign the site shows as
 * text ("\text{-}\frac{16}{25}") alike.
 */
function optionInlines(text: string): Inline[] {
  const inlines = contentInlines(text).flatMap((paragraph, index) => (index ? [{ kind: "br" as const }, ...paragraph] : paragraph));
  if (inlines.length === 1 && inlines[0].kind === "text" && NUMERIC_TEXT.test(inlines[0].text) && /\d/.test(inlines[0].text)) {
    return [{ kind: "math", latex: inlines[0].text.trim() }];
  }
  const words = inlines.some((inline) => inline.kind === "text" && HAS_WORD.test(inline.text));
  if (inlines.length > 1 && !words && inlines.every((inline) => inline.kind !== "br") && inlines.some((inline) => inline.kind === "math")) {
    return [{ kind: "math", latex: text.trim() }];
  }
  return inlines;
}

function optionParagraphs(task: ConstructorTask): Paragraph[] {
  if (hasEmptyMcqOptionTexts(task.options)) {
    return [{
      inlines: [{ kind: "text", text: task.options.map((option) => `□ ${option.label}`).join("        "), bold: true }],
      lineSpacing: 120000,
      spaceAfter: 0,
    }];
  }
  return task.options
    .filter((option) => option.text.trim())
    .map((option) => ({
      inlines: [
        { kind: "text" as const, text: `${option.label}) `, bold: true },
        ...optionInlines(option.text),
      ],
      lineSpacing: 120000,
      spaceAfter: 400,
    }));
}

function statementParagraphs(text: string, accent: string): Paragraph[] {
  const comparison = parseComparisonTask(text);
  if (!comparison) {
    return contentInlines(text).map((inlines) => ({ inlines, lineSpacing: 120000, spaceAfter: 900 }));
  }
  const condition = comparison.condition
    ? contentInlines(comparison.condition).map((inlines) => ({ inlines, lineSpacing: 120000, spaceAfter: 600 }))
    : [];
  return [
    ...condition,
    {
      inlines: [{ kind: "text", text: "A:   ", bold: true, color: accent }, ...optionInlines(comparison.columnA)],
      lineSpacing: 120000,
      spaceAfter: 500,
    },
    {
      inlines: [{ kind: "text", text: "B:   ", bold: true, color: accent }, ...optionInlines(comparison.columnB)],
      lineSpacing: 120000,
      spaceAfter: 900,
    },
  ];
}

function taskParagraphs(task: ConstructorTask, language: ConstructorLanguage, accent = DEFAULT_ACCENT): Paragraph[] {
  const statement = statementParagraphs(task.text, accent);
  const choices = task.answer_mode !== "written" || task.question_type === "tf";
  if (task.question_type === "select") {
    const subquestions = task.subquestions.map((subquestion, index) => ({
      inlines: [
        { kind: "text" as const, text: `${String.fromCharCode(65 + index)}) `, bold: true },
        ...contentInlines(subquestion.text).flat(),
      ],
      lineSpacing: 120000,
      spaceAfter: 400,
    }));
    if (!choices || !task.options.length) return [...statement, ...subquestions];
    const options: Inline[] = hasEmptyMcqOptionTexts(task.options)
      ? [{ kind: "text", text: task.options.map((option) => `□ ${option.label}`).join("     "), bold: true }]
      : task.options.flatMap((option, index) => [
          ...(index ? [{ kind: "text" as const, text: "     " }] : []),
          { kind: "text" as const, text: `${option.label}) `, bold: true },
          ...contentInlines(option.text).flat(),
        ]);
    return [...statement, ...subquestions, { inlines: options, lineSpacing: 120000, spaceAfter: 0 }];
  }
  if (task.question_type === "tf") {
    const words = LABELS[language];
    return [...statement, { inlines: [{ kind: "text", text: `□ ${words.true}        □ ${words.false}` }], lineSpacing: 120000, spaceAfter: 0 }];
  }
  if ((task.question_type === "mcq" || task.question_type === "mcq6") && choices) {
    return [...statement, ...optionParagraphs(task)];
  }
  return statement;
}

class DeckBuilder {
  readonly unsupported = new Set<string>();
  readonly media = new Map<string, Uint8Array>();
  private readonly slides: PackageSlide[] = [];
  private readonly accent: string;
  private readonly labels: (typeof LABELS)[ConstructorLanguage];
  private readonly language: string;
  private readonly font: string;
  private backgroundName: string | null = null;
  private mediaCount = 0;

  constructor(private readonly input: DeckInput) {
    this.accent = (input.accent ?? DEFAULT_ACCENT).replace(/^#/, "").toUpperCase();
    this.labels = LABELS[input.language];
    this.language = LANG_TAG[input.language];
    this.font = input.font?.trim() || DEFAULT_PPTX_FONT;
  }

  private addMedia(image: DeckImage): string {
    this.mediaCount += 1;
    const name = `image${this.mediaCount}.${image.ext}`;
    this.media.set(name, image.bytes);
    return name;
  }

  private taskSlideFrame(): SlideWriter {
    const slide = new SlideWriter(this);
    if (this.input.background) {
      this.backgroundName ??= this.addMedia(this.input.background);
      slide.setBackground(this.input.background, this.backgroundName);
    }
    return slide;
  }

  private header(slide: SlideWriter, text: string) {
    slide.textBox("Header", HEADER, [{ inlines: [{ kind: "text", text, bold: true, color: this.accent }], lineSpacing: 120000, spaceAfter: 0 }],
      { size: 2000, language: this.language, color: this.accent, font: this.font });
  }

  titleSlide() {
    const slide = new SlideWriter(this);
    if (this.input.titleImage) {
      slide.setBackground(this.input.titleImage, this.addMedia(this.input.titleImage));
    } else {
      const style = { size: 4000, language: this.language, color: this.accent, font: this.font };
      slide.textBox("Title", { x: inch(1), y: inch(2.4), w: SLIDE_WIDTH - inch(2), h: inch(1.6) },
        [{ inlines: [{ kind: "text", text: this.input.title, bold: true }], lineSpacing: 100000, spaceAfter: 0 }],
        style, { anchor: "ctr", align: "ctr" });
      slide.textBox("Task count", { x: inch(1), y: inch(4.1), w: SLIDE_WIDTH - inch(2), h: inch(0.6) },
        [{ inlines: [{ kind: "text", text: this.labels.count(this.input.tasks.length) }], lineSpacing: 100000, spaceAfter: 0 }],
        { size: 2000, language: this.language, color: MUTED_COLOR, font: this.font }, { align: "ctr" });
    }
    this.slides.push(slide.toSlide());
  }

  taskSlide(task: ConstructorTask, number: number) {
    const slide = this.taskSlideFrame();
    this.header(slide, `${this.labels.task} №${number}:`);
    const image = this.input.taskImages?.get(task.id);
    const textBox: Box = image ? { ...BODY, w: Math.round(BODY.w * 0.58) } : BODY;
    const paragraphs = taskParagraphs(task, this.input.language, this.accent);
    const size = fitSize(paragraphs, textBox);
    slide.textBox(`Task ${number}`, textBox, paragraphs, { size, language: this.language, color: TEXT_COLOR, font: this.font });
    if (image) {
      const area: Box = { x: BODY.x + Math.round(BODY.w * 0.62), y: BODY.y, w: Math.round(BODY.w * 0.38), h: BODY.h };
      const scale = Math.min(area.w / image.width, area.h / image.height);
      const w = Math.round(image.width * scale);
      const h = Math.round(image.height * scale);
      slide.picture(`Task ${number} picture`, `${this.labels.task} ${number}`,
        { x: area.x + Math.round((area.w - w) / 2), y: area.y, w, h }, this.addMedia(image));
    }
    this.slides.push(slide.toSlide());
  }

  answerSlides() {
    const perSlide = ANSWERS_PER_COLUMN * ANSWER_COLUMNS;
    const entries = this.input.tasks.map((task, index): Paragraph => ({
      inlines: [{ kind: "text", text: `${index + 1}) `, bold: true }, ...answerInlines(taskAnswerPieces(task, this.input.language))],
      lineSpacing: 110000,
      spaceAfter: 300,
    }));
    for (let start = 0; start < entries.length; start += perSlide) {
      const slide = this.taskSlideFrame();
      this.header(slide, this.labels.answers);
      const gap = inch(0.25);
      const columnWidth = Math.round((BODY.w - gap * (ANSWER_COLUMNS - 1)) / ANSWER_COLUMNS);
      for (let column = 0; column < ANSWER_COLUMNS; column += 1) {
        const chunk = entries.slice(start + column * ANSWERS_PER_COLUMN, start + (column + 1) * ANSWERS_PER_COLUMN);
        if (!chunk.length) break;
        const box = { x: BODY.x + column * (columnWidth + gap), y: BODY.y, w: columnWidth, h: BODY.h };
        const size = Math.min(1800, fitSize(chunk, box));
        slide.textBox(`Answers ${column + 1}`, box, chunk, { size, language: this.language, color: TEXT_COLOR, font: this.font });
      }
      this.slides.push(slide.toSlide());
    }
  }

  build() {
    this.titleSlide();
    this.input.tasks.forEach((task, index) => this.taskSlide(task, index + 1));
    this.answerSlides();
    return buildPackageFiles({
      title: this.input.title, author: this.input.author, font: this.font, slides: this.slides, media: this.media,
    });
  }
}

/** All files of the deck, path → content, and the LaTeX commands the equations could not show. */
export function buildTaskDeckFiles(input: DeckInput): { files: Map<string, string | Uint8Array>; unsupported: string[] } {
  const builder = new DeckBuilder(input);
  const files = builder.build();
  return { files, unsupported: Array.from(builder.unsupported) };
}

/** The .pptx bytes. Images are stored, XML is compressed. */
export async function buildTaskDeck(input: DeckInput): Promise<{ bytes: Uint8Array; unsupported: string[] }> {
  const { zipSync, strToU8 } = await import("fflate");
  const { files, unsupported } = buildTaskDeckFiles(input);
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  files.forEach((content, path) => {
    entries[path] = typeof content === "string" ? [strToU8(content), { level: 6 }] : [content, { level: 0 }];
  });
  return { bytes: zipSync(entries), unsupported };
}
