import type { SVGProps } from "react";

type Glyph = { path: string; detail?: string; fill?: string };

// QazMath icons share a 24px grid, rounded terminals and an optical 1.75px stroke.
// The second layer adds depth without relying on colour to convey meaning.
const glyphs = {
  book: { path: "M12 6.5C9.5 4.8 6.3 4.3 3 5v14c3.3-.7 6.5-.2 9 1.5 2.5-1.7 5.7-2.2 9-1.5V5c-3.3-.7-6.5-.2-9 1.5Zm0 0v14", detail: "M6 8.5c1.2 0 2.2.2 3.2.6M6 12c1.2 0 2.2.2 3.2.6M15 9.1c1-.4 2-.6 3.2-.6", fill: "M12 6.5c2.5-1.7 5.7-2.2 9-1.5v14c-3.3-.7-6.5-.2-9 1.5Z" },
  test: { path: "M8 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-2M8 3h8v4H8Z", detail: "m8 13 2 2 5-5M8 18h8", fill: "M4 16h16v4H4Z" },
  quiz: { path: "M7 3h12a2 2 0 0 1 2 2v12M3 7h12a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2Z", detail: "m11 10-4 5h3l-1 3 4-5h-3Z", fill: "M3 7h12a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2Z" },
  user: { path: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2Z", fill: "M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2Z" },
  users: { path: "M14 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM3 21v-2a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v2ZM18 4a3.5 3.5 0 0 1 0 7m1 3a5 5 0 0 1 3 5v2", fill: "M3 21v-2a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v2Z" },
  shield: { path: "M12 2.5 21 6v6c0 5-4.5 8.2-9 10-4.5-1.8-9-5-9-10V6Z", detail: "m8 12 2.5 2.5L16 9", fill: "M12 2.5 21 6v6c0 5-4.5 8.2-9 10Z" },
  sidebar: { path: "M3 4h18v16H3ZM9 4v16", detail: "M5.5 8h1M5.5 12h1", fill: "M3 4h6v16H3Z" },
  chart: { path: "M3 3v18h18M7 16v-5h3v5ZM13 16V6h3v10ZM19 16V9h2v7", fill: "M7 11h3v5H7ZM13 6h3v10h-3Z" },
  folder: { path: "M3 7V4h6l3 3h9v13H3Z", detail: "M3 10h18", fill: "M3 10h18v10H3Z" },
  layers: { path: "m12 3 10 5-10 5L2 8Zm-9 9 9 4.5 9-4.5M3 16l9 4.5 9-4.5", fill: "m12 3 10 5-10 5L2 8Z" },
  file: { path: "M5 3h9l5 5v13H5Zm9 0v5h5", detail: "M8 12h8M8 16h5", fill: "M14 3v5h5Z" },
  report: { path: "M5 3h14v18H5Z", detail: "M8 7h8M8 11h5M9 17h.01M13 17h3", fill: "M5 14h14v7H5Z" },
  audit: { path: "M13 21H4V3h13v6M7 7h6M7 11h3m9 6 3 3", detail: "M20 13.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z", fill: "M20 13.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" },
  compass: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 8l-2.5 5.5L8 16l2.5-5.5Z", fill: "M16 8l-2.5 5.5L8 16l2.5-5.5Z" },
  target: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-4 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z", detail: "M12 12h.01", fill: "M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" },
  support: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-5 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5.6 5.6l3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6", fill: "M5.6 5.6a9 9 0 0 1 12.8 0l-3.6 3.6a4 4 0 0 0-5.6 0Z" },
  trophy: { path: "M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5m-5 1h10", fill: "M7 3h10v7a5 5 0 0 1-10 0Z" },
  medal: { path: "m7 3 5 7 5-7M3 3h4m10 0h4M18 15a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z", detail: "m12 12 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 14.3l2-.3Z", fill: "M18 15a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" },
  award: { path: "M18 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM8 14l-1 8 5-3 5 3-1-8", detail: "m9.5 9 1.5 1.5 3.5-3.5", fill: "M8 14l-1 8 5-3 5 3-1-8Z" },
  star: { path: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z", fill: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3Z" },
  crown: { path: "m3 6 5 4 4-7 4 7 5-4-2 12H5ZM5 21h14", fill: "m3 6 5 4 4-7 4 7 5-4-2 12H5Z" },
  flame: { path: "M13 2c1 6-5 6-4 11-2-1-3-3-3-5-5 8-1 14 6 14 6 0 10-6 6-12 0 3-1 4-2 4 1-5-1-9-3-12Z", detail: "M12 15c-3 3-2 6 1 6", fill: "M13 2c1 6-5 6-4 11-2-1-3-3-3-5-5 8-1 14 6 14 6 0 10-6 6-12 0 3-1 4-2 4 1-5-1-9-3-12Z" },
  bolt: { path: "m14 2-10 12h7l-1 8L20 9h-7Z", fill: "m14 2-10 12h7l-1 8L20 9h-7Z" },
  sparkles: { path: "m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3ZM20 2v4m-2-2h4M3 19v3m-1.5-1.5h3", fill: "m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z" },
  arrowLeft: { path: "M20 12H4m6-6-6 6 6 6" },
  arrowRight: { path: "M4 12h16m-6-6 6 6-6 6" },
  chevronLeft: { path: "m15 5-7 7 7 7" },
  chevronRight: { path: "m9 5 7 7-7 7" },
  chevronDown: { path: "m5 9 7 7 7-7" },
  chevronUp: { path: "m5 15 7-7 7 7" },
  plus: { path: "M12 4v16M4 12h16" },
  close: { path: "m6 6 12 12M6 18 18 6" },
  check: { path: "m4 12 5 5L20 6" },
  checkCircle: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", detail: "m7.5 12 3 3 6-6", fill: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  closeCircle: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", detail: "m9 9 6 6m-6 0 6-6", fill: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  edit: { path: "m14 4 6 6M4 20l1-6L16 3a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L10 19Zm10 0h7", fill: "m4 20 1-6 5 5Z" },
  trash: { path: "M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15", detail: "M10 10v7m4-7v7", fill: "M5 6h14l-1 15H6Z" },
  copy: { path: "M8 8h13v13H8ZM16 4V2H2v14h2", fill: "M8 8h13v13H8Z" },
  clock: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", detail: "M12 6v6l4 2", fill: "M12 3a9 9 0 0 1 9 9h-9Z" },
  timer: { path: "M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM9 2h6m-3 0v3m6 2 2-2", detail: "M12 9v5l3 2", fill: "M12 5a8 8 0 0 1 8 8h-8Z" },
  calendar: { path: "M3 5h18v16H3ZM7 3v4m10-4v4M3 10h18", detail: "M7 14h2m4 0h2m-8 4h2", fill: "M3 5h18v5H3Z" },
  lock: { path: "M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4", detail: "M12 14v3", fill: "M5 10h14v11H5Z" },
  globe: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z", fill: "M3 12h18a9 9 0 0 1-18 0Z" },
  share: { path: "m8 10 8-5m-8 9 8 5M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14-8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", fill: "M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
  search: { path: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6" },
  info: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", detail: "M12 11v6m0-10h.01", fill: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  alert: { path: "m12 3 10 18H2Z", detail: "M12 9v5m0 3h.01", fill: "m12 3 10 18H2Z" },
  help: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", detail: "M9 8.5a3 3 0 0 1 6 0c0 2-3 2-3 4.5m0 3.5h.01" },
  image: { path: "M3 3h18v18H3Zm0 14 6-6 6 6 3-3 3 3", detail: "M17 7h.01", fill: "m3 17 6-6 6 6 3-3 3 3v4H3Z" },
  graduation: { path: "m2 9 10-6 10 6-10 6ZM6 12v6c4 3 8 3 12 0v-6m4-3v8", fill: "m2 9 10-6 10 6-10 6Z" },
  box: { path: "m3 7 9-4 9 4v12l-9 3-9-3Zm0 0 9 4 9-4m-9 4v11M7.5 5 17 9", fill: "m12 11 9-4v12l-9 3Z" },
  play: { path: "m7 3 15 9-15 9Z", fill: "m7 3 15 9-15 9Z" },
  stop: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9h6v6H9Z", fill: "M9 9h6v6H9Z" },
  logOut: { path: "M10 3H3v18h7m5-14 5 5-5 5M8 12h12", fill: "M3 3h4v18H3Z" },
  logIn: { path: "M14 3h7v18h-7M9 7l5 5-5 5M3 12h11", fill: "M17 3h4v18h-4Z" },
  loader: { path: "M12 3a9 9 0 1 1-9 9", detail: "M3 7v5h5" },
  rocket: { path: "M10 14C9 7 14 2 22 2c0 8-5 13-12 12ZM10 7H5l-3 6h7m8 1v5l-6 3v-7M6 17l-3 4 4-3", detail: "M17.5 6.5h.01", fill: "M10 14C9 7 14 2 22 2c0 8-5 13-12 12Z" },
  palette: { path: "M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5h-.8a1.5 1.5 0 0 1 0-3H17a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z", detail: "M7 9h.01m4-3h.01m5 2h.01M6 14h.01", fill: "M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5h-.8a1.5 1.5 0 0 1 0-3H17a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z" },
  dice: { path: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", detail: "M7 7h.01m10 0h.01m-5 5h.01M7 17h.01m10 0h.01", fill: "M3 12h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" },
  bulb: { path: "M8 16a7 7 0 1 1 8 0v3H8Zm1 6h6", detail: "M12 12v7m-3-9 3 2 3-2", fill: "M8 16a7 7 0 1 1 8 0v3H8Z" },
  triangle: { path: "m12 3 10 18H2Z", fill: "m12 3 10 18H2Z" },
  diamond: { path: "m12 2 10 10-10 10L2 12Z", fill: "m12 2 10 10-10 10L2 12Z" },
  circle: { path: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", fill: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  square: { path: "M3 3h18v18H3Z", fill: "M3 3h18v18H3Z" },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;
export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  size?: number | string;
  variant?: "outline" | "duotone";
  label?: string;
};

export default function Icon({ name, size = "1.15em", variant = "duotone", label, className = "", ...props }: IconProps) {
  const glyph: Glyph = glyphs[name];
  const accessibleLabel = label || props["aria-label"];
  const labelled = Boolean(accessibleLabel || props["aria-labelledby"]);
  return (
    <svg {...props} className={`qm-icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      role={labelled ? "img" : undefined} aria-label={accessibleLabel}
      aria-hidden={labelled ? undefined : true} focusable="false" data-icon={name}>
      {label && <title>{label}</title>}
      {variant === "duotone" && glyph.fill && <path d={glyph.fill} fill="currentColor" fillOpacity={0.14} stroke="none" />}
      <path d={glyph.path} />
      {glyph.detail && <path d={glyph.detail} />}
    </svg>
  );
}

const legacyIcons: Record<string, IconName> = {
  "📚": "book", "📖": "book", "📝": "edit", "📋": "test", "📊": "chart", "🧪": "test",
  "🗂️": "folder", "🧭": "compass", "🕵️": "audit", "🛟": "support", "🛡️": "shield",
  "🏆": "trophy", "🥇": "medal", "🥈": "medal", "🥉": "medal", "🏅": "award", "🎖️": "award",
  "⭐": "star", "🌟": "star", "✨": "sparkles", "🔥": "flame", "⚡": "bolt", "🎯": "target",
  "🔟": "medal", "💯": "award", "💵": "bolt",
  "🎓": "graduation", "🚀": "rocket", "💎": "diamond", "👑": "crown", "💪": "bolt",
};

export function resolveIconName(value?: string | null, fallback: IconName = "award"): IconName {
  if (value && Object.prototype.hasOwnProperty.call(glyphs, value)) return value as IconName;
  return value && Object.prototype.hasOwnProperty.call(legacyIcons, value) ? legacyIcons[value] : fallback;
}

export function ContentIcon({ value, fallback = "award", ...props }: Omit<IconProps, "name"> & { value?: string | null; fallback?: IconName }) {
  return <Icon {...props} name={resolveIconName(value, fallback)} />;
}
