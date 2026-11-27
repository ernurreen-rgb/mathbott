/**
 * A context task (several questions about one situation) names that situation on its first line,
 * written as "**Title**". Screens and exports show the title as a centred heading above the
 * statement instead of the raw asterisks.
 */
const LEADING_TITLE = /^\s*\*\*([^*\n]+?)\*\*[ \t]*(?:\r?\n|$)/;

export interface TitledText {
  /** The heading, or null when the text does not start with a "**Title**" line. */
  title: string | null;
  /** The text after the title line, without the blank lines that followed it. */
  body: string;
}

export function splitLeadingTitle(text: string | null | undefined): TitledText {
  const value = text ?? "";
  const match = LEADING_TITLE.exec(value);
  const title = match?.[1].trim();
  if (!match || !title) return { title: null, body: value };
  return { title, body: value.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "") };
}
