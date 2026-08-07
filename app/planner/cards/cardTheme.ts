// app/planner/cards/cardTheme.ts
//
// Shared monochrome card look + expiration-state rules for every Cards
// sub-tab (Terminals, Badges, Credentials) so the three don't drift --
// same pearl/ivory/silver tone set, same 7-day-orange/expired-red/7+days-
// inactive rule, same back-of-card field styles.

import { daysUntilISO_ } from "../utils/dates";

export const TONES: [string, string][] = [
  ["#f7f5f0", "#e8e4da"], // pearl
  ["#f2ecdd", "#e3dcc8"], // ivory
  ["#ece8e2", "#d9d4cb"], // warm grey
  ["#eef0f1", "#dadde0"], // cool silver
  ["#f0e6d2", "#ddd0b3"], // champagne
  ["#e9e5df", "#d6d0c6"], // greige
  ["#f5f3ee", "#e6e1d8"], // alabaster
];

export function toneFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return TONES[Math.abs(h) % TONES.length];
}

export function formatCardNumber(num: string): string {
  const digits = num.replace(/\s+/g, "");
  if (!digits) return "";
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

// ── Expiration → visual state ───────────────────────────────────────────────
// Matches the app-wide "expiring within 7 days = orange, expired = red"
// convention (useExpirations.ts's TERMINAL_WARN_DAYS = 7); expired 7+ days
// mutes the whole card ("inactive") but it still shows unless filtered out.
// "not_set" covers items with no expiration on file yet (never blocks use).

export type CardState = "not_set" | "valid" | "expiring" | "expired" | "inactive";

export function cardStateFor(expiresISO: string | null | undefined): CardState {
  if (!expiresISO) return "not_set";
  const days = daysUntilISO_(expiresISO);
  if (days === null) return "not_set";
  if (days > 7) return "valid";
  if (days >= 0) return "expiring";
  if (days >= -7) return "expired";
  return "inactive";
}

export type FilterKey = "all" | "valid" | "expiring" | "expired";
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "expired", label: "Expired" },
];

export function matchesFilter(state: CardState, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "valid") return state === "valid";
  if (filter === "expiring") return state === "expiring";
  if (filter === "expired") return state === "expired" || state === "inactive";
  return true;
}

export const EXP_COLOR: Record<CardState, string> = {
  not_set: "rgba(0,0,0,0.4)",
  valid: "#1a1a1a",
  expiring: "#b45309",
  expired: "#b91c1c",
  inactive: "rgba(0,0,0,0.4)",
};

// ── Shared field styles (back-of-card form, light card background) ─────────

export const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.45)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 };
export const fieldInput: React.CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid rgba(0,0,0,0.18)", background: "rgba(0,0,0,0.04)", padding: "7px 9px", fontSize: 13, color: "#111", boxSizing: "border-box" };
export const btnPrimary: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
export const btnSecondary: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.05)", color: "#111", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
export const btnDanger: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(153,27,27,0.35)", background: "rgba(153,27,27,0.08)", color: "#8f1d1d", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
