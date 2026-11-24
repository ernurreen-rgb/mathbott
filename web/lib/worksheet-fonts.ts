const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/gi;
const EMBEDDED_SOURCE_RE = /src\s*:[^;}]*url\(\s*['"]?data:[^,\s]+;base64,[a-z0-9+/=]+['"]?\s*\)/i;
const KATEX_FAMILY_RE = /font-family\s*:\s*['"]?KaTeX_/i;

/**
 * Keep only embedded @font-face rules and refuse a PDF whose required KaTeX
 * math fonts failed to embed. Unreachable third-party/extension @font-face
 * rules (blocked by CSP) are dropped instead of breaking the export.
 */
export function validateWorksheetFontCSS(css: string, needsMathFonts: boolean): string {
  const faces = css.match(FONT_FACE_RE) || [];
  const katexFaces = faces.filter((face) => KATEX_FAMILY_RE.test(face));
  const embeddedFaces = faces.filter((face) => EMBEDDED_SOURCE_RE.test(face));
  const embeddedKatexFaces = katexFaces.filter((face) => EMBEDDED_SOURCE_RE.test(face));

  if (katexFaces.some((face) => !EMBEDDED_SOURCE_RE.test(face))) {
    throw new Error('PDF қаріптері толық жүктелмеді. Қайта көріңіз.');
  }
  if (needsMathFonts && embeddedKatexFaces.length === 0) {
    throw new Error('PDF қаріптері толық жүктелмеді. Қайта көріңіз.');
  }
  return embeddedFaces.join('\n');
}
