// app/planner/theme.ts
//
// Planner-screen theming: light mode is the original all-white top section
// (header/tab-bar) + white Load button + white compartment handles + light
// CG-slider puck. Dark mode swaps that same set of elements to a graphite
// fill, with icon/tab/button text flipping light. A custom accent color (if
// set) overrides the fill for those same elements regardless of dark/light
// -- but per the user's explicit choice, text/icon colors always follow the
// dark/light setting only, never the accent color itself.

export const GRAPHITE = "#2a2a2c";
export const GRAPHITE_DARKER = "#1c1c1e";

function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Solid fill for the Load button, compartment handles, and CG puck. Each
// caller passes its OWN current light-mode color (they aren't all the same
// shade today -- e.g. the CG puck is "#d9d9d9", not pure white) so light
// mode stays pixel-identical to "what we have now"; dark mode is the one
// that unifies all of them to a single graphite, and a custom accent color
// overrides either.
export function themeFill(darkMode: boolean, accentColor: string | null, lightDefault: string = "#ffffff"): string {
  return accentColor || (darkMode ? GRAPHITE : lightDefault);
}

// Two-tone gradient for the header/tab-bar band.
export function themeHeaderGradient(darkMode: boolean, accentColor: string | null): string {
  const top = themeFill(darkMode, accentColor, "#ffffff");
  const bottom = accentColor ? darken(accentColor, 24) : darkMode ? GRAPHITE_DARKER : "#f2f2f2";
  return `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
}

// Text/icon colors -- driven by dark/light only, never the accent color.
export function themeTextOnFill(darkMode: boolean): string {
  return darkMode ? "#fff" : "#000";
}
export function themeIconStroke(darkMode: boolean): string {
  return darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
}
export function themeTabActive(darkMode: boolean): string {
  return darkMode ? "#fff" : "#111";
}
export function themeTabInactive(darkMode: boolean): string {
  return darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
}
export function themeUnderlineTrack(darkMode: boolean): string {
  return darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
}
export function themeUnderlineActive(darkMode: boolean): string {
  return darkMode ? "#fff" : "#111";
}
