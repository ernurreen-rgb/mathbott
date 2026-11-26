// The colour system of the light and dark themes. tailwind.config.ts builds its colours and the
// CSS variables of both themes from this file; tests/theme-palette.test.ts checks the contrast.
//
// Two layers:
// 1. Semantic tokens (surface, fg, line, brand, success, ...): CSS variables `--qm-<name>` that
//    hold "r g b" and switch with `data-theme` on <html>. Tailwind knows them as `bg-surface`,
//    `text-fg-muted`, `border-line`, `bg-brand-solid`, ...; CSS modules use `rgb(var(--qm-...))`.
// 2. The neutral and tinted palette classes the pages already use (`bg-white`, `text-gray-600`,
//    `bg-purple-50`, `border-slate-200`, ...) are aliases, per utility, onto variables that keep
//    the exact Tailwind value in the light theme and move to a dark counterpart in the dark one.
//    Per utility, because the same colour plays different roles: `bg-white` is a card surface and
//    becomes dark, while `text-white` sits on purple buttons and badges and stays white. Solid
//    colours (bg 400 and up, text 50 to 400) keep their values in both themes, so a purple button
//    stays purple and a white label stays white.
//
// A nested `data-theme="light"` element (a printable worksheet preview, a white image backdrop)
// gets the light values back, because both blocks declare every variable.

import colors from "tailwindcss/colors";

export type ThemeName = "light" | "dark";
type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const triplet = (rgb: Rgb) => rgb.map((c) => Math.round(c)).join(" ");

/** `amount` of `top` over `base`, in sRGB: how a translucent tint looks on the surface below. */
export function mix(top: string, base: string, amount: number): string {
  const a = hexToRgb(top);
  const b = hexToRgb(base);
  const out = a.map((c, i) => Math.round(c * amount + b[i] * (1 - amount)));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2 relative luminance and contrast ratio. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_SURFACE = "#1c1926";

/** Hues of the Tailwind palette that get dark tints. */
export const HUES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const;
export const NEUTRALS = ["gray", "slate"] as const;
type Hue = (typeof HUES)[number];
type Shade = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950";
const palette = colors as unknown as Record<Hue | (typeof NEUTRALS)[number], Record<Shade, string>>;
const tint = (hue: Hue, amount: number) => mix(palette[hue]["500"], DARK_SURFACE, amount);

/**
 * Semantic tokens: [light, dark]. The light values are the ones the pages used before the dark
 * theme existed, so the light theme does not change.
 */
export const SEMANTIC_TOKENS = {
  // Page and cards. `page` is the body, `page-from`/`page-to` the page gradient (bg-gradient-math).
  page: ["#ffffff", "#0f0d16"],
  "page-from": ["#f8fafc", "#15121d"],
  "page-to": ["#f1f5f9", "#0e0c14"],
  surface: ["#ffffff", DARK_SURFACE],
  "surface-sunken": ["#f9fafb", "#16131f"],
  "surface-muted": ["#f3f4f6", "#272333"],
  "surface-strong": ["#e5e7eb", "#322d40"],
  "surface-stronger": ["#d1d5db", "#423b52"],
  // Text, from headings down to placeholders and decorative icons.
  fg: ["#111827", "#f4f2f9"],
  "fg-secondary": ["#374151", "#d8d4e2"],
  "fg-muted": ["#4b5563", "#bdb7cb"],
  "fg-subtle": ["#6b7280", "#a59fb5"],
  "fg-faint": ["#9ca3af", "#8d869d"],
  // Borders and dividers. `line-strong` outlines inputs, so it keeps 3:1 on dark cards.
  "line-subtle": ["#f3f4f6", "#28233a"],
  line: ["#e5e7eb", "#332d44"],
  "line-strong": ["#d1d5db", "#6c6582"],
  // The light edge of glass cards (border-white/30): a faint highlight in the dark theme.
  edge: ["#ffffff", "#4d4560"],
  // Brand purple: text and icons, solid buttons (white text on it), soft tinted backgrounds.
  brand: ["#7c3aed", "#a78bfa"],
  "brand-solid": ["#7c3aed", "#7c3aed"],
  "brand-soft": ["#f5f3ff", tint("violet", 0.16)],
  focus: ["#a855f7", "#c084fc"],
  // Answer states and notices: text, soft background, border.
  success: ["#15803d", "#86efac"],
  "success-soft": ["#f0fdf4", tint("green", 0.14)],
  "success-line": ["#bbf7d0", tint("green", 0.45)],
  danger: ["#b91c1c", "#fca5a5"],
  "danger-soft": ["#fef2f2", tint("red", 0.14)],
  "danger-line": ["#fecaca", tint("red", 0.45)],
  warning: ["#92400e", "#fcd34d"],
  "warning-soft": ["#fffbeb", tint("amber", 0.14)],
  "warning-line": ["#fde68a", tint("amber", 0.45)],
  info: ["#1d4ed8", "#93c5fd"],
  "info-soft": ["#eff6ff", tint("blue", 0.14)],
  "info-line": ["#bfdbfe", tint("blue", 0.45)],
} as const satisfies Record<string, readonly [string, string]>;

export type SemanticToken = keyof typeof SEMANTIC_TOKENS;

type Role = "bg" | "fg" | "line";
/** A remapped palette class: light value (the Tailwind one) and dark value (a token or a colour). */
type Alias = { name: string; light: string; dark: SemanticToken | `#${string}` };

const NEUTRAL_DARK: Record<Role, Partial<Record<Shade | "white", SemanticToken | `#${string}`>>> = {
  bg: {
    white: "surface", "50": "surface-sunken", "100": "surface-muted", "200": "surface-strong",
    "300": "surface-stronger", "400": "#5c556e",
  },
  fg: {
    "300": "#6f6886", "400": "fg-faint", "500": "fg-subtle", "600": "fg-muted",
    "700": "fg-secondary", "800": "#e7e4ef", "900": "fg", "950": "fg",
  },
  line: {
    white: "edge", "50": "line-subtle", "100": "line-subtle", "200": "line", "300": "line-strong",
    "400": "#7a7390",
  },
};

// Tinted backgrounds become a translucent-looking tint of the hue over the dark surface; tinted
// text becomes the lighter end of the same hue.
const HUE_DARK: Record<Role, Partial<Record<Shade, (hue: Hue) => string>>> = {
  bg: {
    "50": (h) => tint(h, 0.12), "100": (h) => tint(h, 0.18),
    "200": (h) => tint(h, 0.27), "300": (h) => tint(h, 0.38),
  },
  line: {
    "50": (h) => tint(h, 0.2), "100": (h) => tint(h, 0.28),
    "200": (h) => tint(h, 0.38), "300": (h) => tint(h, 0.52),
  },
  fg: {
    "500": (h) => palette[h]["400"], "600": (h) => palette[h]["400"], "700": (h) => palette[h]["300"],
    "800": (h) => palette[h]["200"], "900": (h) => palette[h]["100"], "950": (h) => palette[h]["50"],
  },
};

function aliases(role: Role): Array<Alias & { color: string; shade: string }> {
  const out: Array<Alias & { color: string; shade: string }> = [];
  for (const neutral of NEUTRALS) {
    for (const [shade, dark] of Object.entries(NEUTRAL_DARK[role])) {
      if (shade === "white") continue;
      out.push({ name: `${role}-${neutral}-${shade}`, color: neutral, shade, light: palette[neutral][shade as Shade], dark: dark! });
    }
  }
  const white = NEUTRAL_DARK[role].white;
  if (white) out.push({ name: `${role}-white`, color: "white", shade: "", light: "#ffffff", dark: white });
  for (const hue of HUES) {
    for (const [shade, dark] of Object.entries(HUE_DARK[role])) {
      out.push({ name: `${role}-${hue}-${shade}`, color: hue, shade, light: palette[hue][shade as Shade], dark: dark!(hue) as `#${string}` });
    }
  }
  return out;
}

const ROLES: Role[] = ["bg", "fg", "line"];

const isToken = (value: string): value is SemanticToken => !value.startsWith("#");
const rgb = (hex: string) => triplet(hexToRgb(hex));

/** The CSS variables of one theme, `--qm-...` names to "r g b" values. */
export function themeVariables(theme: ThemeName): Record<string, string> {
  const vars: Record<string, string> = {};
  const index = theme === "light" ? 0 : 1;
  for (const [name, values] of Object.entries(SEMANTIC_TOKENS)) vars[`--qm-${name}`] = rgb(values[index]);
  for (const role of ROLES) {
    for (const alias of aliases(role)) {
      vars[`--qm-${alias.name}`] =
        theme === "light" ? rgb(alias.light) : isToken(alias.dark) ? `var(--qm-${alias.dark})` : rgb(alias.dark);
    }
  }
  return vars;
}

/** Dark value of a palette class as a colour, for the contrast tests. */
export function darkAliasColor(role: Role, color: string, shade = ""): string | undefined {
  const alias = aliases(role).find((a) => a.color === color && a.shade === shade);
  if (!alias) return undefined;
  return isToken(alias.dark) ? SEMANTIC_TOKENS[alias.dark][1] : alias.dark;
}

const cssColor = (name: string, light: string) => `rgb(var(--qm-${name}, ${rgb(light)}) / <alpha-value>)`;

type ColorTree = Record<string, string | Record<string, string>>;

function roleColors(role: Role): ColorTree {
  const tree: ColorTree = {};
  for (const alias of aliases(role)) {
    const value = cssColor(alias.name, alias.light);
    if (alias.color === "white") tree.white = value;
    else ((tree[alias.color] ??= {}) as Record<string, string>)[alias.shade] = value;
  }
  return tree;
}

/** Semantic colours for Tailwind: `bg-surface`, `text-fg-muted`, `border-line-strong`, ... */
export function semanticColors(): ColorTree {
  const tree: ColorTree = {};
  for (const [name, [light]] of Object.entries(SEMANTIC_TOKENS)) {
    const [group, ...rest] = name.split("-");
    const key = rest.length ? rest.join("-") : "DEFAULT";
    const value = cssColor(name, light);
    if (["surface", "fg", "line", "brand", "success", "danger", "warning", "info", "page"].includes(group)) {
      ((tree[group] ??= {}) as Record<string, string>)[key] = value;
    } else {
      tree[name] = value;
    }
  }
  // Content that stays the same in both themes: white on purple or on photos, dark ink on gold.
  tree["static-white"] = "#ffffff";
  tree["static-ink"] = palette.gray["900"];
  return tree;
}

/** Per-utility palette aliases for `theme.extend` in tailwind.config.ts. */
export function themedUtilityColors() {
  const bg = roleColors("bg");
  const fg = roleColors("fg");
  const line = roleColors("line");
  return {
    backgroundColor: bg,
    gradientColorStops: bg,
    // The gap between a focus ring and its element matches the card behind it (white by default).
    ringOffsetColor: { ...bg, DEFAULT: `rgb(var(--qm-bg-white, 255 255 255))` },
    boxShadowColor: bg,
    fill: bg,
    textColor: fg,
    placeholderColor: fg,
    caretColor: fg,
    textDecorationColor: fg,
    accentColor: fg,
    borderColor: { ...line, DEFAULT: `rgb(var(--qm-line-gray-200, ${rgb(palette.gray["200"])}))` },
    divideColor: line,
    outlineColor: line,
    ringColor: line,
    stroke: line,
  };
}
