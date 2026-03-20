"use client";
// modals/ExpirationModal.tsx

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { ExpirationItem } from "../hooks/useExpirations";

type TerminalEntry = {
  terminal_id: string;
  terminal_name: string | null;
  city?: string | null;
  state?: string | null;
  renewal_days?: number | null;
  renewalDays?: number | null;
  renewal?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: ExpirationItem[];
  activeItems: ExpirationItem[];
  deferredItems: ExpirationItem[];
  toggleDefer: (id: string) => void;
  onOpenEquipment: () => void;
  onOpenTerminals: () => void;
  selectedCity: string;
  selectedState: string;
  allTerminalsInCity: TerminalEntry[];
  accessDateByTerminalId: Record<string, string | undefined>;
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
};

// ── Report ────────────────────────────────────────────────────────────────────
function buildReport(
  activeItems: ExpirationItem[],
  city: string, state: string,
  cardActive:    { name: string; expires: string; daysLeft: number }[],
  cardExpired:   { name: string; expires: string; daysLeft: number }[],
  cardNotCarded: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const loc = city && state ? `${city}, ${state}` : city || state || "";
  const lines: string[] = [];

  const trucks   = activeItems.filter(i => i.entityType === "truck");
  const trailers = activeItems.filter(i => i.entityType === "trailer");
  const termExp  = activeItems.filter(i => i.entityType === "terminal");
  const hasEquip = trucks.length + trailers.length + termExp.length > 0;

  if (hasEquip) {
    lines.push(`Expiration Report — ${date}`, "");
    for (const [label, group] of [["TRUCK", trucks], ["TRAILER", trailers], ["TERMINAL CARDS", termExp]] as [string, ExpirationItem[]][]) {
      if (!group.length) continue;
      lines.push(label);
      for (const i of group) {
        const status = i.expired ? `expired ${Math.abs(i.daysLeft)}d ago` : `${i.daysLeft}d remaining`;
        lines.push(`${i.label}  ${status}`);
      }
      lines.push("");
    }
  }

  const hasCards = cardActive.length + cardExpired.length + cardNotCarded.length > 0;
  if (hasCards) {
    lines.push(`Terminals${loc ? ` — ${loc}` : ""}  ${date}`, "");
    if (cardActive.length > 0) {
      lines.push("ACTIVE");
      const maxLen = Math.max(...cardActive.map(c => c.name.length));
      for (const c of cardActive) {
        lines.push(`${c.name}${" ".repeat(Math.max(1, maxLen - c.name.length + 2))}${c.expires}  ${c.daysLeft}d`);
      }
      lines.push("");
    }
    if (cardExpired.length > 0) {
      lines.push("EXPIRED");
      const maxLen = Math.max(...cardExpired.map(c => c.name.length));
      for (const c of cardExpired) {
        lines.push(`${c.name}${" ".repeat(Math.max(1, maxLen - c.name.length + 2))}${c.expires}  ${Math.abs(c.daysLeft)}d ago`);
      }
      lines.push("");
    }
    if (cardNotCarded.length > 0) {
      lines.push("NOT CARDED");
      for (const n of cardNotCarded) lines.push(n);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const BTN: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.80)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
};

function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.30)" }}>{left}</div>
      {right && <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.20)" }}>{right}</div>}
    </div>
  );
}

// ── Unified card — used for all entity types ──────────────────────────────────
function ExpirationCard({ label, statusText, expired, urgent, deferred, onTap, onToggleDefer }: {
  label: string;
  statusText: string;
  expired: boolean;
  urgent: boolean;   // within warning window but not expired
  deferred: boolean;
  onTap: () => void;
  onToggleDefer: () => void;
}) {
  const border = deferred
    ? "1px solid rgba(255,255,255,0.05)"
    : expired
      ? "1px solid rgba(239,68,68,0.22)"
      : urgent
        ? "1px solid rgba(234,179,8,0.22)"
        : "1px solid rgba(255,255,255,0.07)";

  const bg = deferred
    ? "rgba(255,255,255,0.01)"
    : expired
      ? "rgba(239,68,68,0.06)"
      : urgent
        ? "rgba(234,179,8,0.05)"
        : "rgba(255,255,255,0.03)";

  const statusColor = deferred
    ? "rgba(255,255,255,0.22)"
    : expired
      ? "rgba(239,68,68,0.88)"
      : urgent
        ? "rgba(234,179,8,0.88)"
        : "rgba(255,255,255,0.38)";

  const nameColor = deferred ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border, background: bg }}>
      {/* Label — tappable */}
      <div
        role="button" tabIndex={0}
        onClick={onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: nameColor }}>{label}</div>
      </div>

      {/* Status */}
      <div style={{ fontSize: 12, fontWeight: deferred ? 600 : 700, color: statusColor, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
        {statusText}
      </div>

      {/* Defer toggle */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDefer(); }}
        title={deferred ? "Restore alert" : "Defer alert"}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 13, color: "rgba(255,255,255,0.18)", flexShrink: 0, lineHeight: 1 }}
        aria-label={deferred ? "Restore" : "Defer"}
      >
        {deferred ? "↩" : "—"}
      </button>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function ExpirationModal({
  open, onClose, items, activeItems, deferredItems, toggleDefer,
  onOpenEquipment, onOpenTerminals,
  selectedCity, selectedState, allTerminalsInCity,
  accessDateByTerminalId, addDaysISO_, isPastISO_, formatMDYWithCountdown_,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  const [deferredExpanded, setDeferredExpanded] = useState(false);

  // ── Build terminal card data ──────────────────────────────────────────────
  type CardEntry = { name: string; expires: string; expiresISO: string; daysLeft: number };
  const cardActive: CardEntry[] = [];
  const cardExpired: CardEntry[] = [];
  const cardNotCarded: string[] = [];

  for (const t of allTerminalsInCity) {
    const tid     = String(t.terminal_id);
    const name    = t.terminal_name ?? `Terminal ${tid}`;
    const lastISO = accessDateByTerminalId[tid];
    if (!lastISO) { cardNotCarded.push(name); continue; }
    const renewalDays = Number(t.renewal_days ?? t.renewalDays ?? t.renewal ?? 90) || 90;
    const expiresISO  = addDaysISO_(lastISO, renewalDays);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((new Date(expiresISO + "T00:00:00").getTime() - today.getTime()) / 86400000);
    const expiresText = formatMDYWithCountdown_(expiresISO).split(" (")[0];
    const entry: CardEntry = { name, expires: expiresText, expiresISO, daysLeft };
    isPastISO_(expiresISO) ? cardExpired.push(entry) : cardActive.push(entry);
  }
  cardActive.sort((a, b) => a.daysLeft - b.daysLeft);
  cardExpired.sort((a, b) => a.daysLeft - b.daysLeft);
  cardNotCarded.sort();

  const report = buildReport(activeItems, selectedCity, selectedState, cardActive, cardExpired, cardNotCarded);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setShareError("Could not copy to clipboard."); }
  };
  const handleShare = async () => {
    setShareError("");
    if (navigator.share) { try { await navigator.share({ title: "Expiration Report", text: report }); } catch {} }
    else { window.open(`mailto:?subject=${encodeURIComponent("Expiration Report")}&body=${encodeURIComponent(report)}`); }
  };

  const tapAction = (item: ExpirationItem) => { onClose(); item.entityType === "terminal" ? onOpenTerminals() : onOpenEquipment(); };

  const locLabel = selectedCity && selectedState ? `In ${selectedCity}, ${selectedState}` : selectedCity ? `In ${selectedCity}` : "";
  const activeTrucks    = activeItems.filter(i => i.entityType === "truck");
  const activeTrailers  = activeItems.filter(i => i.entityType === "trailer");
  const truckNames      = [...new Set(activeTrucks.map(i => i.entityName))].join(", ");
  const trailerNames    = [...new Set(activeTrailers.map(i => i.entityName))].join(", ");
  const hasCards = cardActive.length + cardExpired.length + cardNotCarded.length > 0;

  // Render a list of ExpirationItems as unified cards
  const renderExpCards = (expItems: ExpirationItem[], isDeferred = false) =>
    expItems.map(item => (
      <ExpirationCard
        key={item.id}
        label={item.entityType === "terminal" ? item.entityName : item.label}
        statusText={
          isDeferred
            ? (item.expired ? `Expired ${Math.abs(item.daysLeft)}d ago` : `${item.daysLeft}d left`)
            : item.expired
              ? `⛔ Expired ${Math.abs(item.daysLeft)}d ago`
              : `⚠ ${item.daysLeft}d left`
        }
        expired={item.expired}
        urgent={!item.expired}
        deferred={isDeferred}
        onTap={() => tapAction(item)}
        onToggleDefer={() => toggleDefer(item.id)}
      />
    ));

  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Truck docs ── */}
        {activeTrucks.length > 0 && (
          <div>
            <SectionLabel left="Truck Documents" right={truckNames ? `For ${truckNames}` : undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {renderExpCards(activeTrucks)}
            </div>
          </div>
        )}

        {/* ── Trailer docs ── */}
        {activeTrailers.length > 0 && (
          <div>
            <SectionLabel left="Trailer Documents" right={trailerNames ? `For ${trailerNames}` : undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {renderExpCards(activeTrailers)}
            </div>
          </div>
        )}

        {/* ── Terminal Cards — all terminals in city as unified cards ── */}
        {hasCards && (
          <div>
            <SectionLabel left="Terminal Cards" right={locLabel || undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>

              {cardExpired.map(c => (
                <ExpirationCard key={`exp-${c.name}`}
                  label={c.name}
                  statusText={`⛔ ${c.expires} · ${Math.abs(c.daysLeft)}d ago`}
                  expired={true} urgent={false} deferred={false}
                  onTap={() => { onClose(); onOpenTerminals(); }}
                  onToggleDefer={() => {}}
                />
              ))}

              {cardActive.map(c => (
                <ExpirationCard key={`act-${c.name}`}
                  label={c.name}
                  statusText={c.daysLeft <= 7 ? `⚠ ${c.expires} · ${c.daysLeft}d` : `${c.expires} · ${c.daysLeft}d`}
                  expired={false} urgent={c.daysLeft <= 7} deferred={false}
                  onTap={() => { onClose(); onOpenTerminals(); }}
                  onToggleDefer={() => {}}
                />
              ))}

              {cardNotCarded.map(name => (
                <div key={`nc-${name}`} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.25)" }}>{name}</div>
                </div>
              ))}

            </div>
          </div>
        )}

        {/* ── Deferred — collapsed ── */}
        {deferredItems.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            <button type="button" onClick={() => setDeferredExpanded(p => !p)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.20)" }}>
                Deferred ({deferredItems.length})
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)" }}>{deferredExpanded ? "▲" : "▼"}</div>
            </button>
            {deferredExpanded && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {renderExpCards(deferredItems, true)}
              </div>
            )}
          </div>
        )}

        {items.length === 0 && !hasCards && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>Nothing to show.</div>
        )}

        {/* ── Share ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>Share Report</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleCopy} style={BTN}>{copied ? "✓ Copied" : "Copy"}</button>
            <button type="button" onClick={handleShare} style={BTN}>Share / Email</button>
          </div>
          {shareError && <div style={{ marginTop: 6, fontSize: 11, color: "rgba(239,68,68,0.80)" }}>{shareError}</div>}
        </div>

      </div>
    </FullscreenModal>
  );
}
