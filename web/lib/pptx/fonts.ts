/**
 * The fonts a constructor deck can be set in (bot/routes/constructor.py PPTX_FONTS accepts the
 * same names). The deck names the font and does not embed it: PowerPoint uses it where it is
 * installed and substitutes another one elsewhere. Formulas stay in Cambria Math.
 */
export const PPTX_FONTS = ["JUZ40 FONTS", "Arial", "Calibri", "Times New Roman", "Verdana"] as const;

export type PptxFont = (typeof PPTX_FONTS)[number];

/** The font of the Juz40 live-lesson decks, which most teachers using the constructor have installed. */
export const DEFAULT_PPTX_FONT: PptxFont = "JUZ40 FONTS";

export function isPptxFont(value: unknown): value is PptxFont {
  return typeof value === "string" && (PPTX_FONTS as readonly string[]).includes(value);
}
