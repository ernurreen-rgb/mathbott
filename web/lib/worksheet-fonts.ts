/** Refuse a PDF with missing webfont sources instead of silently changing faces. */
export function validateWorksheetFontCSS(css: string, hasMath: boolean): string {
  const faces = css.match(/@font-face\s*\{[^}]*\}/gi) || [];
  const embeddedSource = /src\s*:[^;}]*url\(\s*['"]?data:[^;,\s]+;base64,[a-z0-9+/=]+['"]?\s*\)/i;
  if ((hasMath && !faces.length) || faces.some((face) => !embeddedSource.test(face))) {
    throw new Error('PDF қаріптері толық жүктелмеді. Қайта көріңіз.');
  }
  return css;
}
