#!/usr/bin/env node
// Gives the admin CSS modules a dark theme without touching their light colours.
//
//   node scripts/theme-css-modules.mjs          rewrite the modules and app/theme-modules.css
//   node scripts/theme-css-modules.mjs --check  exit 1 if a module has a raw colour left
//
// Each raw hex colour in a module becomes `var(--qm-dk-<role>-<hex>, <hex>)`: the fallback is the
// original colour, so the light theme renders exactly as before. app/theme-modules.css (global,
// imported by the root layout) defines those variables for [data-theme="dark"] only, from the
// role the colour plays (background, text or line) and how light and saturated it is: light
// neutrals become the semantic surfaces and lines of lib/theme/palette.ts, dark neutral text
// becomes the fg levels, pale tints become dark tints, accent text gets lighter. Solid colours
// (buttons, badges) and shadows keep their value. Global, so portalled dialogs get it too.
//
// The student-facing trial test module (app/trial-test/[id]) is themed by hand instead.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "app/admin/bank/BankWorkspace.module.css",
  "app/admin/cms/CmsWorkspace.module.css",
  "app/admin/statistics/Statistics.module.css",
  "app/admin/trial-tests/TrialTests.module.css",
  "components/admin/VisualTaskEditor.module.css",
];
const OUTPUT = "app/theme-modules.css";
const DARK_SURFACE = [28, 25, 38]; // --qm-surface in the dark theme

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function rgbOf(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
function luminance([r, g, b]) {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function hsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const mixOnSurface = (rgb, amount) => rgb.map((c, i) => c * amount + DARK_SURFACE[i] * (1 - amount));

/** The dark value for a colour in a role, or null to keep it as it is. */
function darkValue(role, hex) {
  const rgb = rgbOf(hex);
  const lum = luminance(rgb);
  const [h, s] = hsl(rgb);
  // Near white, HSL saturation is unstable (#f8f9fc reads as 39%), so a tiny spread also counts.
  const neutral = s < 0.25 || Math.max(...rgb) - Math.min(...rgb) < 12;
  const vivid = (lightness) => toHex(fromHsl(h, Math.max(s, 0.55), lightness));
  if (role === "bg") {
    if (neutral) {
      if (lum >= 0.97) return "rgb(var(--qm-surface))";
      if (lum >= 0.86) return "rgb(var(--qm-surface-sunken))";
      if (lum >= 0.74) return "rgb(var(--qm-surface-muted))";
      if (lum >= 0.55) return "rgb(var(--qm-surface-strong))";
      return null;
    }
    if (lum >= 0.6) return toHex(mixOnSurface(rgbOf(vivid(0.55)), lum > 0.85 ? 0.14 : lum > 0.72 ? 0.22 : 0.32));
    return null;
  }
  if (role === "line") {
    if (neutral) {
      if (lum >= 0.86) return "rgb(var(--qm-line-subtle))";
      if (lum >= 0.6) return "rgb(var(--qm-line))";
      if (lum >= 0.4) return "rgb(var(--qm-line-strong))";
      return null;
    }
    if (lum >= 0.5) return toHex(mixOnSurface(rgbOf(vivid(0.55)), 0.42));
    return null;
  }
  // Text: dark neutrals become the fg levels, dark accents a light shade of their hue.
  if (neutral) {
    if (lum < 0.035) return "rgb(var(--qm-fg))";
    if (lum < 0.09) return "rgb(var(--qm-fg-secondary))";
    if (lum < 0.18) return "rgb(var(--qm-fg-muted))";
    if (lum < 0.3) return "rgb(var(--qm-fg-subtle))";
    if (lum < 0.5) return "rgb(var(--qm-fg-faint))";
    return null;
  }
  if (lum < 0.4) return vivid(0.78);
  return null;
}

function roleOf(property) {
  if (/^(color|caret-color|accent-color|-webkit-text-fill-color)$/.test(property)) return "fg";
  if (/^background(-color)?$/.test(property)) return "bg";
  if (/^(border|outline)|^(stroke|column-rule)/.test(property)) return "line";
  if (property === "fill") return "bg";
  return null; // box-shadow, text-shadow, ...: shadows stay dark in both themes.
}

const variables = new Map(); // name -> dark value
let untouched = 0;

function rewrite(css) {
  return css.replace(/([a-z-]+)(\s*:\s*)([^;{}]+)/g, (declaration, property, colon, value) => {
    const role = roleOf(property);
    if (!role) return declaration;
    // Skip colours already wrapped by an earlier run: `var(--qm-dk-..., #abc)`.
    const parts = value.split(/(var\(--qm-dk-[a-z]+-[0-9a-f]+, #[0-9a-fA-F]+\))/);
    const next = parts.map((part) => (part.startsWith("var(--qm-dk-") ? part : part.replace(HEX, (hex) => {
      if (hex.length === 9) return hex; // Colours with alpha are overlays and shadows.
      const dark = darkValue(role, hex);
      if (!dark) { untouched += 1; return hex; }
      const name = `--qm-dk-${role}-${hex.slice(1).toLowerCase()}`;
      variables.set(name, dark);
      return `var(${name}, ${hex})`;
    })));
    return `${property}${colon}${next.join("")}`;
  });
}

function collect(css) {
  for (const match of css.matchAll(/var\((--qm-dk-([a-z]+)-([0-9a-f]+)), #[0-9a-fA-F]+\)/g)) {
    const dark = darkValue(match[2], `#${match[3]}`);
    if (dark) variables.set(match[1], dark);
  }
}

const check = process.argv.includes("--check");
let leftovers = 0;
for (const file of MODULES) {
  const full = path.join(web, file);
  const before = readFileSync(full, "utf8");
  const after = rewrite(before);
  collect(after);
  if (check) {
    if (after !== before) { leftovers += 1; console.error(`${file}: raw colours without a dark value`); }
  } else if (after !== before) {
    writeFileSync(full, after);
    console.log(`rewrote ${file}`);
  }
}

const sorted = [...variables.entries()].sort(([a], [b]) => a.localeCompare(b));
const output = [
  "/* Generated by scripts/theme-css-modules.mjs: the dark values of the colours in the admin CSS",
  "   modules. The modules fall back to their own colour, which is the light theme. Do not edit. */",
  '[data-theme="dark"] {',
  ...sorted.map(([name, value]) => `  ${name}: ${value};`),
  "}",
  "",
].join("\n");
const outputPath = path.join(web, OUTPUT);
if (check) {
  let current = "";
  try { current = readFileSync(outputPath, "utf8"); } catch { /* missing */ }
  if (current !== output) { leftovers += 1; console.error(`${OUTPUT} is out of date`); }
  process.exit(leftovers ? 1 : 0);
}
writeFileSync(outputPath, output);
console.log(`wrote ${OUTPUT} (${sorted.length} variables; ${untouched} colours keep their value)`);
