/**
 * Chart colours for the statistics workspace.
 *
 * Validated on the white card surface with the data-viz palette checks: the categorical
 * slots keep their order (violet, orange, aqua) so neighbours stay apart for colour-blind
 * readers, the soft violet is the lighter step of slot one, and the heat ramp is one hue
 * with lightness falling as the value grows.
 */
export const VIZ = {
  primary: "#7140cc",
  primarySoft: "#b9a2ee",
  secondary: "#eb6834",
  tertiary: "#1baf7a",
  track: "#eef0f5",
  grid: "#e8eaf0",
  axis: "#cfd4de",
  ink: "#222735",
  muted: "#687181",
  heat: ["#ece5fb", "#d9cbf6", "#c3adf0", "#a98be8", "#8f69de", "#7140cc", "#5b30ab", "#462487"],
} as const;

/** Heat step for a value; zero keeps the neutral track so empty cells recede. */
export function heatColor(value: number, max: number): string {
  if (!value || max <= 0) return VIZ.track;
  const step = Math.min(VIZ.heat.length - 1, Math.floor((value / max) * VIZ.heat.length - 1e-9));
  return VIZ.heat[Math.max(0, step)];
}

/** Text on a heat cell: white once the fill is dark enough to carry it. */
export function heatInk(value: number, max: number): string {
  if (!value || max <= 0) return VIZ.muted;
  return value / max > 0.5 ? "#ffffff" : VIZ.ink;
}
