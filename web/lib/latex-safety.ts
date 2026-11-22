/**
 * Remove LaTeX that MathLive turns into raw HTML attributes or CSS.
 *
 * Student answers are rendered for teachers and admins, so stored LaTeX must not be able to
 * restyle their page (an overlay, a fake message, a tracking image). MathLive escapes attribute
 * values and only follows http(s) links, but these commands still inject arbitrary CSS or
 * markup attributes:
 * - \htmlStyle / \style, \htmlData, \class / \htmlClass, \cssId / \htmlId, \href: the first
 *   argument becomes markup; the visible content (second argument) is kept.
 * - \enclose{notation}[options] and \bbox[options]: the options reach CSS as raw strings; the
 *   options are dropped, the rest is kept.
 * \color and \colorbox are safe: MathLive reduces their argument to #rrggbb or ignores it.
 */
const ATTRIBUTE_COMMANDS = new Set([
  "htmlStyle",
  "style",
  "htmlData",
  "class",
  "htmlClass",
  "cssId",
  "htmlId",
  "href",
]);
const CSS_OPTION_COMMANDS = new Set(["enclose", "bbox"]);
const UNSAFE_COMMAND_RE = /\\(?:htmlStyle|style|htmlData|class|htmlClass|cssId|htmlId|href|enclose|bbox)(?![A-Za-z])/;

const skipSpaces = (value: string, index: number): number => {
  let cursor = index;
  while (cursor < value.length && /\s/.test(value[cursor])) cursor += 1;
  return cursor;
};

/** Index just after the group that opens at `start`, or -1 when it never closes. */
const groupEnd = (value: string, start: number, open: string, close: string): number => {
  let depth = 0;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    const char = value[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return -1;
};

export const stripUnsafeLatexCommands = (value: string): string => {
  if (!value || !UNSAFE_COMMAND_RE.test(value)) return value;
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const char = value[cursor];
    if (char !== "\\") {
      output += char;
      cursor += 1;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(value.slice(cursor + 1))?.[0];
    if (!name) {
      // "\\", "\{", "\," and the like: keep the escape and the escaped character together.
      output += value.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    const afterName = cursor + 1 + name.length;

    if (ATTRIBUTE_COMMANDS.has(name)) {
      const attributeStart = skipSpaces(value, afterName);
      if (value[attributeStart] !== "{") {
        cursor = afterName;
        continue;
      }
      const attributeEnd = groupEnd(value, attributeStart, "{", "}");
      if (attributeEnd < 0) break;
      const contentStart = skipSpaces(value, attributeEnd);
      if (value[contentStart] !== "{") {
        cursor = attributeEnd;
        continue;
      }
      const contentEnd = groupEnd(value, contentStart, "{", "}");
      if (contentEnd < 0) break;
      output += `{${stripUnsafeLatexCommands(value.slice(contentStart + 1, contentEnd - 1))}}`;
      cursor = contentEnd;
      continue;
    }

    if (CSS_OPTION_COMMANDS.has(name)) {
      output += `\\${name}`;
      let next = skipSpaces(value, afterName);
      if (name === "enclose" && value[next] === "{") {
        const notationEnd = groupEnd(value, next, "{", "}");
        if (notationEnd < 0) break;
        output += value.slice(next, notationEnd);
        next = skipSpaces(value, notationEnd);
      }
      if (value[next] === "[") {
        const optionsEnd = groupEnd(value, next, "[", "]");
        if (optionsEnd < 0) break;
        next = optionsEnd;
      }
      cursor = next;
      continue;
    }

    output += value.slice(cursor, afterName);
    cursor = afterName;
  }
  return output;
};
