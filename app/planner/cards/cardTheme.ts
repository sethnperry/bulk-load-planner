// app/planner/cards/cardTheme.ts
//
// Shared card look + expiration-state rules for every Cards sub-tab
// (Terminals, Badges, Credentials) so the three don't drift -- same
// graphite-gradient tile look as the rest of the dark app theme (Reports
// page's ReportTile, Admin's header tiles), same 7-day-orange/expired-red/
// 7+days-inactive rule, same back-of-card field styles.
//
// 2026-08-19: previously each card rendered in a light "pearl card-wallet"
// tone (a per-terminal/badge pastel color via toneFor/TONES below) -- a
// deliberate physical-card-in-a-wallet metaphor, but one the user felt
// didn't belong next to the rest of the app's dark graphite theme ("those
// ivory cards don't look like they belong"). Replaced with the same
// GRAPHITE/GRAPHITE_DARKER gradient used everywhere else; TONES/toneFor
// removed entirely since nothing else referenced them.
//
// EXP_COLOR stays LIGHT-calibrated and unchanged -- CredentialsReportModal.tsx
// deliberately renders a genuine white printable page (hands off to the
// browser's print dialog) and needs dark-on-light text, not a bug to fix.
// DARK_EXP_COLOR is the new canonical dark-background version, used by
// every other consumer of this file.

import { daysUntilISO_ } from "../utils/dates";
import { GRAPHITE, GRAPHITE_DARKER } from "../theme";

export const CARD_BG = `linear-gradient(135deg, ${GRAPHITE} 0%, ${GRAPHITE_DARKER} 100%)`;
export const CARD_BORDER = "1px solid rgba(255,255,255,0.10)";
export const CARD_BORDER_SELECTED = "1px solid rgba(255,255,255,0.30)";
export const CARD_SHADOW = "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)";

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

// Light-calibrated -- ONLY for a genuine light/print background
// (CredentialsReportModal.tsx's white printable page). Everything else in
// the app should use DARK_EXP_COLOR below.
export const EXP_COLOR: Record<CardState, string> = {
  not_set: "rgba(0,0,0,0.4)",
  valid: "#1a1a1a",
  expiring: "#b45309",
  expired: "#b91c1c",
  inactive: "rgba(0,0,0,0.4)",
};

// Dark-background version -- the canonical one for every consumer that
// isn't rendering on white paper. Was previously redeclared locally (and
// separately) in FleetCardsModal.tsx/dispatch/page.tsx/reports/page.tsx;
// this is now the single source of truth those could migrate to.
export const DARK_EXP_COLOR: Record<CardState, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

// ── Shared field styles (back-of-card form, dark graphite card background) ─

export const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 };
export const fieldInput: React.CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)", padding: "7px 9px", fontSize: 13, color: "#fff", boxSizing: "border-box" };
export const btnPrimary: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.92)", color: "#111", fontSize: 13, fontWeight: 700, cursor: "pointer" };
export const btnSecondary: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
export const btnDanger: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
