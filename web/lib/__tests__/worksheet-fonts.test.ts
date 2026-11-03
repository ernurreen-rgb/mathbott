import { validateWorksheetFontCSS } from '../worksheet-fonts';

const face = (style: string, source = 'src:url("data:font/woff2;base64,d09GMgAB");') =>
  `@font-face {font-family:KaTeX_Main;font-style:${style};${source}}`;

it('retains regular and italic embedded sources over repeated exports', () => {
  const complete = face('normal') + face('italic');
  for (let index = 0; index < 4; index += 1) expect(validateWorksheetFontCSS(complete, true)).toBe(complete);
});

it('rejects a dropped regular face or unavailable webfont instead of falling back to italic', () => {
  expect(() => validateWorksheetFontCSS(face('normal', '') + face('italic'), true)).toThrow('қаріптері толық жүктелмеді');
  expect(() => validateWorksheetFontCSS(face('normal', 'src:url("https://example.invalid/font.woff2");'), true)).toThrow();
  expect(() => validateWorksheetFontCSS(face('normal', 'src:url("data:,");'), true)).toThrow();
  expect(() => validateWorksheetFontCSS('', true)).toThrow();
  expect(validateWorksheetFontCSS('', false)).toBe('');
});
