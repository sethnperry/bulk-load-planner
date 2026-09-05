// app/planner/reports/UtilizationReportModal.tsx
//
// Phase 2 driver display for the payload-utilization system: this period's
// performance plus a per-load history. See docs/incentive-redesign-plan.md.
//
// Deliberately plain. The spec is explicit that the driver screen stays
// simple and that this is NOT a leaderboard -- there is no ranking here, no
// comparison to anyone else, and nothing about other drivers. The only
// question it answers is "am I using the capacity that was actually
// available to me."
//
// Every "planned" here means planned, never "loaded" -- actual gallons are
// currently copied from the plan, so the stronger word would overclaim. The
// wording is centralised in UTILIZATION_ACTUAL_WORD so it flips in one place
// once a real measured actual exists.

"use client";

import React from "react";

import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { UTILIZATION_METRIC_LABEL, UTILIZATION_ACTUAL_WORD } from "@/lib/capacity/computeUtilization";
import type { UtilizationRow, UtilizationSummary } from "@/lib/capacity/useUtilization";

const LABEL = "rgba(255,255,255,0.4)";
const MUTED = "rgba(255,255,255,0.45)";

function gal(n: number) {
  return `${Math.round(n).toLocaleString()} gal`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One line explaining why a load carries no score, in plain language. The
 *  spec is explicit that an excluded load is explained rather than silently
 *  dropped -- and that an external cap must never read as the driver's
 *  fault. */
function exclusionNote(row: UtilizationRow): { text: string; color: string } | null {
  switch (row.eligibility) {
    case "excluded_safety":
      return { text: row.exception_reason ?? "Not counted — safety limit exceeded.", color: "#ef4444" };
    case "excluded_constraint":
      return { text: row.exception_reason ?? "Not counted — capacity was limited by someone else.", color: MUTED };
    case "excluded_incomplete_data":
      return { text: "Not measured — capacity couldn't be established for this load.", color: MUTED };
    default:
      return null;
  }
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color ?? "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function UtilizationReportModal({
  open, onClose, periodLabel, summary, rows, loading, isViewingOther, driverName,
}: {
  open: boolean;
  onClose: () => void;
  /** e.g. "Biweekly" or "Last 30 days" -- resolved by the caller, since the
   *  period may come from company settings or a plain rolling window. */
  periodLabel: string;
  summary: UtilizationSummary;
  rows: UtilizationRow[];
  loading: boolean;
  isViewingOther?: boolean;
  driverName?: string | null;
}) {
  const excluded =
    summary.excluded_safety + summary.excluded_constraint + summary.excluded_incomplete_data;

  return (
    <FullscreenModal open={open} onClose={onClose} title={UTILIZATION_METRIC_LABEL}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        {isViewingOther && driverName && (
          <div style={{ fontSize: 12, color: MUTED }}>Viewing {driverName}</div>
        )}

        {/* ── This period ───────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            {periodLabel}
          </div>

          <div style={{ fontSize: 40, fontWeight: 800, color: "#4ade80", lineHeight: 1 }}>
            {summary.utilization_pct != null ? `${summary.utilization_pct.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            {UTILIZATION_METRIC_LABEL} across {summary.eligible_loads}{" "}
            {summary.eligible_loads === 1 ? "load" : "loads"}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Stat label="Available" value={gal(summary.available_gallons)} />
            <Stat label={UTILIZATION_ACTUAL_WORD} value={gal(summary.actual_gallons)} />
            <Stat label="Left" value={gal(summary.unused_gallons)} />
          </div>

          {/* Excluded loads are surfaced as their own count, never folded into
              the score in either direction (spec section 10). */}
          {excluded > 0 && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>
              {excluded} {excluded === 1 ? "load is" : "loads are"} not counted in this figure
              {summary.excluded_constraint > 0 && ` · ${summary.excluded_constraint} externally capped`}
              {summary.excluded_safety > 0 && ` · ${summary.excluded_safety} over a safety limit`}
              {summary.excluded_incomplete_data > 0 && ` · ${summary.excluded_incomplete_data} not measured`}
            </div>
          )}
        </div>

        {/* ── Per-load history ──────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Loads
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: MUTED }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
              No measured loads in this period yet. Utilization is calculated
              automatically when a load is completed — there is nothing to set up.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r) => {
                const note = exclusionNote(r);
                return (
                  <div key={r.load_id} style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                        {fmtDate(r.loaded_at)}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {gal(r.actual_gallons)} of {gal(r.effective_available_gallons)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: r.utilization_pct != null ? "#fff" : MUTED, flexShrink: 0, minWidth: 56, textAlign: "right" }}>
                        {r.utilization_pct != null ? `${r.utilization_pct.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    {note && (
                      <div style={{ fontSize: 11, color: note.color, marginTop: 3, lineHeight: 1.4 }}>{note.text}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FullscreenModal>
  );
}
