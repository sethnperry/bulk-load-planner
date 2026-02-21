"use client";
// modals/MyLoadsModal.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LoadHistoryRow, LoadHistoryLine } from "../hooks/useLoadHistory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** h:mm ago if < 24h, Xd ago if >= 24h */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const totalMins = Math.floor(diff / 60000);
  if (totalMins < 1) return "0:00 ago";
  if (totalMins < 1440) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${String(m).padStart(2, "0")} ago`;
  }
  const days = Math.floor(totalMins / 1440);
  return `${days}d ago`;
}

/** "Feb 20, 2025  14:32" */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${date}  ${h}:${m}`;
}

function fmtGal(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} gal`;
}

function fmtLbs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} lbs`;
}

function fmtTemp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}°F`;
}

function lineOverUnder(l: LoadHistoryLine): { text: string; color: string } | null {
  if (l.actual_lbs == null || l.planned_lbs == null) return null;
  const diff = Math.round(l.actual_lbs - l.planned_lbs);
  const color = Math.abs(diff) < 30 ? "#4ade80" : diff > 0 ? "#ef4444" : "#4ade80";
  return { text: `${diff >= 0 ? "+" : ""}${diff.toLocaleString()} lbs`, color };
}

function rowDiffColor(diff: number | null | undefined): string {
  if (diff == null) return "rgba(255,255,255,0.4)";
  if (Math.abs(Number(diff)) < 50) return "#4ade80";
  return Number(diff) > 0 ? "#ef4444" : "#4ade80";
}

function rowDiffText(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(Number(diff))) return "—";
  const n = Math.round(Number(diff));
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()} lbs`;
}

// ─── Share report builder ─────────────────────────────────────────────────────

function buildShareText(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined): { subject: string; body: string } {
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const parts = [
    fmtDateTime(row.started_at),
    row.combo_label,
    cityState || null,
    row.terminal_name,
    fmtGal(row.planned_total_gal),
  ].filter(Boolean);
  const subject = parts.join("  ·  ");

  const diffTxt = rowDiffText(row.diff_lbs);
  const diffTag = row.diff_lbs == null ? "" :
    Math.abs(row.diff_lbs) < 50 ? "  ✓ ON WEIGHT" :
    row.diff_lbs > 0 ? "  ▲ OVER" : "  ▼ UNDER";

  const divider = "─".repeat(48);
  const header = [
    "LOAD REPORT",
    divider,
    subject,
    `Overall: ${diffTxt}${diffTag}`,
    divider,
  ].join("\n");

  let lineBlock = "";
  if (lines && lines.length > 0) {
    const totalPlanned = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
    const totalActual  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
    const hasActual    = lines.some(l => l.actual_lbs != null);
    const totalDiff    = hasActual ? Math.round(totalActual - totalPlanned) : null;

    lineBlock = lines.map((l) => {
      const ou = lineOverUnder(l);
      const ouTag = ou == null ? "" :
        Math.abs(Number(l.actual_lbs) - Number(l.planned_lbs)) < 30 ? "  ✓" :
        Number(l.actual_lbs) > Number(l.planned_lbs) ? "  ▲ OVER" : "  ▼ UNDER";

      const rows = [
        `C${l.comp_number}  ${l.product_name ?? "—"}`,
        `  Planned:  ${fmtLbs(l.planned_lbs)}  ${fmtTemp(l.planned_temp_f)}  API ${l.planned_api?.toFixed(1) ?? "—"}`,
        `  Actual:   ${fmtLbs(l.actual_lbs)}  ${fmtTemp(l.actual_temp_f)}  API ${l.actual_api?.toFixed(1) ?? "—"}  ${ou?.text ?? "—"}${ouTag}`,
      ];
      return rows.join("\n");
    }).join("\n\n");

    const totalDiffTxt = totalDiff == null ? "—" :
      `${totalDiff >= 0 ? "+" : ""}${totalDiff.toLocaleString()} lbs`;
    const totalTag = totalDiff == null ? "" :
      Math.abs(totalDiff) < 50 ? "  ✓ ON WEIGHT" :
      totalDiff > 0 ? "  ▲ OVER" : "  ▼ UNDER";

    lineBlock += `\n\n${divider}\n`;
    lineBlock += `TOTAL  ${fmtGal(lines.reduce((s,l)=>s+(l.planned_gallons??0),0))}\n`;
    lineBlock += `  Planned: ${fmtLbs(totalPlanned)}\n`;
    lineBlock += `  Actual:  ${hasActual ? fmtLbs(totalActual) : "—"}\n`;
    lineBlock += `  Net:     ${totalDiffTxt}${totalTag}`;
  }

  const body = lineBlock ? `${header}\n\n${lineBlock}` : header;
  return { subject, body };
}

function shareViaClipboard(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined, onCopied: () => void) {
  const { subject, body } = buildShareText(row, lines);
  navigator.clipboard.writeText(`${subject}\n\n${body}`)
    .then(onCopied)
    .catch(() => window.prompt("Copy this report:", `${subject}\n\n${body}`));
}

function shareViaSMS(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { body } = buildShareText(row, lines);
  // sms: URI with no number — opens default SMS app, user picks contact
  // body param is url-encoded; iOS uses &body=, Android uses ?body=
  const encoded = encodeURIComponent(body);
  // Try iOS format first; Android handles both
  window.location.href = `sms:?&body=${encoded}`;
}

function shareViaEmail(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { subject, body } = buildShareText(row, lines);
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed:   { label: "LOADED",   color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
    in_progress: { label: "IN PROG",  color: "#67e8f9", bg: "rgba(103,232,249,0.12)" },
    started:     { label: "STARTED",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
    planned:     { label: "PLANNED",  color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  };
  const s = map[status] ?? { label: status.toUpperCase(), color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "3px 7px", borderRadius: 4, color: s.color, background: s.bg, whiteSpace: "nowrap", flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

// ─── Date filter chips ────────────────────────────────────────────────────────

const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: "7d",  days: 7    },
  { label: "30d", days: 30   },
  { label: "90d", days: 90   },
  { label: "All", days: null },
];

// ─── Expanded line rows ───────────────────────────────────────────────────────

function LineRows({ lines, loading }: { lines: LoadHistoryLine[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: "12px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[85, 70, 85].map((w, i) => (
          <div key={i} style={{
            height: 13, width: `${w}%`, borderRadius: 4,
            background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
            backgroundSize: "600px 100%", animation: "_ptShimmer 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.08}s`,
          }} />
        ))}
      </div>
    );
  }
  if (!lines || lines.length === 0) {
    return <div style={{ padding: "10px 18px 14px", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No line data</div>;
  }

  // Grid: C# | Product | Gal | PLANNED: Lbs | Temp | API | ACTUAL: Lbs | Temp | API | +/−
  const COL = "24px 1fr 60px 68px 44px 40px 68px 44px 40px 100px";
  const GAP = 4;

  // Totals
  const totalPlannedLbs = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
  const totalActualLbs  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
  const hasActual = lines.some(l => l.actual_lbs != null);
  const totalDiff = hasActual ? totalActualLbs - totalPlannedLbs : null;

  const cellDim: React.CSSProperties  = { fontSize: 13, color: "rgba(255,255,255,0.45)" };
  const cellBold: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" };
  const cellFaint: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.28)" };

  return (
    <div style={{ padding: "6px 18px 14px", overflowX: "auto" }}>
      {/* Spanning group headers */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "4px 0 1px", minWidth: 500 }}>
        <div /><div /><div />
        <div style={{ gridColumn: "span 3", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.25)", letterSpacing: 0.6 }}>PLANNED</div>
        <div style={{ gridColumn: "span 3", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.25)", letterSpacing: 0.6 }}>ACTUAL</div>
        <div />
      </div>
      {/* Column sub-headers */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "0 0 6px", borderBottom: "1px solid rgba(255,255,255,0.08)", minWidth: 500 }}>
        {["C#", "Product", "Gal", "Lbs", "Temp", "API", "Lbs", "Temp", "API", "+/−"].map((h, i) => (
          <div key={i} style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, textAlign: i === 9 ? "center" : "left" }}>{h}</div>
        ))}
      </div>
      {/* Data rows */}
      {lines.map((l) => {
        const ou = lineOverUnder(l);
        return (
          <div key={l.comp_number} style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", minWidth: 500 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>{l.comp_number}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.product_name ?? "—"}</div>
            <div style={cellDim}>{fmtGal(l.planned_gallons)}</div>
            {/* Planned */}
            <div style={cellDim}>{fmtLbs(l.planned_lbs)}</div>
            <div style={cellFaint}>{fmtTemp(l.planned_temp_f)}</div>
            <div style={cellFaint}>{l.planned_api != null ? l.planned_api.toFixed(1) : "—"}</div>
            {/* Actual */}
            <div style={l.actual_lbs != null ? cellBold : cellFaint}>{fmtLbs(l.actual_lbs)}</div>
            <div style={cellFaint}>{fmtTemp(l.actual_temp_f)}</div>
            <div style={cellFaint}>{l.actual_api != null ? l.actual_api.toFixed(1) : "—"}</div>
            {/* +/− centered, no wrap */}
            <div style={{ fontSize: 13, fontWeight: 800, color: ou ? ou.color : "rgba(255,255,255,0.2)", textAlign: "center", whiteSpace: "nowrap" }}>
              {ou ? ou.text : "—"}
            </div>
          </div>
        );
      })}
      {/* Totals row */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "9px 0 2px", borderTop: "1px solid rgba(255,255,255,0.10)", alignItems: "center", minWidth: 500 }}>
        <div />
        <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>TOTAL</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{fmtGal(lines.reduce((s, l) => s + (l.planned_gallons ?? 0), 0))}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{fmtLbs(totalPlannedLbs)}</div>
        <div /><div />
        <div style={{ fontSize: 13, fontWeight: 700, color: hasActual ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)" }}>
          {hasActual ? fmtLbs(totalActualLbs) : "—"}
        </div>
        <div /><div />
        <div style={{ fontSize: 13, fontWeight: 900, color: totalDiff != null ? (Math.abs(totalDiff) < 50 ? "#4ade80" : totalDiff > 0 ? "#ef4444" : "#4ade80") : "rgba(255,255,255,0.2)", textAlign: "center", whiteSpace: "nowrap" }}>
          {totalDiff != null ? `${totalDiff >= 0 ? "+" : ""}${Math.round(totalDiff).toLocaleString()} lbs` : "—"}
        </div>
      </div>
    </div>
  );
}

// ─── Single load row ──────────────────────────────────────────────────────────

function shareBtnStyle(color?: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
    fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
    color: color ?? "rgba(255,255,255,0.55)",
    transition: "all 150ms ease", whiteSpace: "nowrap",
  };
}

function LoadRow({ row, expanded, onToggle, lines, linesLoading }: {
  row: LoadHistoryRow; expanded: boolean; onToggle: () => void;
  lines: LoadHistoryLine[] | undefined; linesLoading: boolean;
}) {
  const [shareOpen, setShareOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    shareViaClipboard(row, lines, () => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setShareOpen(false); }, 1800);
    });
  }
  function handleSMS(e: React.MouseEvent) {
    e.stopPropagation();
    shareViaSMS(row, lines);
    setShareOpen(false);
  }
  function handleEmail(e: React.MouseEvent) {
    e.stopPropagation();
    shareViaEmail(row, lines);
    setShareOpen(false);
  }

  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const summaryParts: string[] = [
    fmtDateTime(row.started_at),
    row.combo_label ?? "",
    cityState || "",
    row.terminal_name ?? "",
    fmtGal(row.planned_total_gal),
  ].filter(Boolean);
  const summaryLine = summaryParts.join("  ·  ");

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div
        onClick={onToggle}
        style={{ padding: "13px 18px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, background: expanded ? "rgba(255,255,255,0.03)" : "transparent", transition: "background 120ms ease" }}
      >
        {/* Line 1: summary · share icon · duration · LOAD button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summaryLine}
          </div>
          {/* Share icon — connected dots */}
          <button
            onClick={(e) => { e.stopPropagation(); setShareOpen(v => !v); }}
            title="Share report"
            style={{ background: "none", border: "none", padding: "2px 4px", cursor: "pointer", flexShrink: 0, color: shareOpen ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", transition: "color 150ms ease", lineHeight: 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {timeAgo(row.started_at)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "3px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", color: expanded ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", background: expanded ? "rgba(255,255,255,0.07)" : "transparent", whiteSpace: "nowrap", flexShrink: 0, transition: "all 150ms ease" }}>
            LOAD {expanded ? "▴" : "▾"}
          </div>
        </div>
        {/* Line 2: diff lbs */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: rowDiffColor(row.diff_lbs) }}>
            {rowDiffText(row.diff_lbs)}
          </div>
        </div>
      </div>

      {/* Share panel — slides open below the summary, above the line rows */}
      {shareOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px 10px", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 0.4, marginRight: 4 }}>SHARE</span>

          {/* Copy to clipboard */}
          <button onClick={handleCopy} style={shareBtnStyle(copied ? "#4ade80" : undefined)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? "COPIED!" : "COPY"}
          </button>

          {/* SMS / Text message */}
          <button onClick={handleSMS} style={shareBtnStyle()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            TEXT
          </button>

          {/* Email */}
          <button onClick={handleEmail} style={shareBtnStyle()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            EMAIL
          </button>
        </div>
      )}

      {expanded && <LineRows lines={lines} loading={linesLoading} />}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string;
  rows: LoadHistoryRow[];
  loading: boolean;
  error: string | null;
  linesCache: Record<string, LoadHistoryLine[]>;
  linesLoading: Record<string, boolean>;
  onFetchLines: (loadId: string, plannedSnapshot?: any, productTempF?: number | null) => void;
  onFetchRange: (days: number | null) => void;
  terminalCatalog: any[];
  combos: any[];
};

export default function MyLoadsModal({
  open, onClose,
  rows, loading, error,
  linesCache, linesLoading,
  onFetchLines, onFetchRange,
}: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeDays, setActiveDays] = useState<number | null>(7);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setExpandedId(null);
      setTimeout(() => searchRef.current?.focus(), 180);
    }
  }, [open]);

  function handleRangeChange(days: number | null) {
    setActiveDays(days);
    onFetchRange(days);
  }

  function handleToggle(loadId: string, plannedSnapshot?: any, productTempF?: number | null) {
    if (expandedId === loadId) { setExpandedId(null); return; }
    setExpandedId(loadId);
    onFetchLines(loadId, plannedSnapshot, productTempF);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.terminal_name ?? "").toLowerCase().includes(q) ||
      (r.combo_label ?? "").toLowerCase().includes(q) ||
      (r.city_name ?? "").toLowerCase().includes(q) ||
      (r.state_code ?? "").toLowerCase().includes(q) ||
      (r.status ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>My Loads</div>
          <button
            onClick={() => onFetchRange(activeDays)}
            title="Refresh"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0 12px", height: 34, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, transition: "all 120ms ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span> REFRESH
          </button>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, width: 34, height: 34, color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search terminal, location, or equipment…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        {/* Date filter chips + count */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 18px 12px" }}>
          {DATE_RANGES.map(({ label, days }) => {
            const active = activeDays === days;
            return (
              <button
                key={label}
                onClick={() => handleRangeChange(days)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 800,
                  cursor: "pointer", letterSpacing: 0.4, transition: "all 120ms ease",
                  background: active ? "rgba(255,255,255,0.10)" : "transparent",
                  borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                }}
              >
                {label}
              </button>
            );
          })}
          {!loading && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              {filtered.length} load{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ padding: "13px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[78, 30].map((w, j) => (
                    <div key={j} style={{
                      height: j === 0 ? 13 : 13, width: `${w}%`, borderRadius: 4,
                      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
                      backgroundSize: "600px 100%", animation: "_ptShimmer 1.4s ease-in-out infinite",
                      animationDelay: `${j * 0.07}s`,
                    }} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No loads match your search" : activeDays ? `No loads in the last ${activeDays} days` : "No loads yet"}
            </div>
          )}
          {!loading && !error && filtered.map((row) => (
            <LoadRow
              key={row.load_id}
              row={row}
              expanded={expandedId === row.load_id}
              onToggle={() => handleToggle(row.load_id, row.planned_snapshot, row.product_temp_f)}
              lines={linesCache[row.load_id]}
              linesLoading={!!linesLoading[row.load_id]}
            />
          ))}
          <div style={{ height: 28 }} />
        </div>
      </div>
    </div>,
    document.body
  );
}
