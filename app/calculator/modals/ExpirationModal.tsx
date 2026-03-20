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
  truckName: string,
  city: string, state: string,
  cardActive:    { name: string; expires: string; daysLeft: number }[],
  cardExpired:   { name: string; expires: string; daysLeft: number }[],
  cardNotCarded: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const loc = city && state ? `${city}, ${state}` : city || state || "";
  const lines: string[] = [];

  // Equipment expirations
  const trucks   = activeItems.filter(i => i.entityType === "truck");
  const trailers = activeItems.filter(i => i.entityType === "trailer");
  const termExp  = activeItems.filter(i => i.entityType === "terminal");
  const hasEquipExp = trucks.length + trailers.length + termExp.length > 0;

  if (hasEquipExp) {
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

  // Card directory
  const hasCards = cardActive.length + cardExpired.length + cardNotCarded.length > 0;
  if (hasCards) {
    lines.push(`Terminals${loc ? ` — ${loc}` : ""}  ${date}`, "");

    if (cardActive.length > 0) {
      lines.push("ACTIVE");
      const maxLen = Math.max(...cardActive.map(c => c.name.length));
      for (const c of cardActive) {
        const pad = " ".repeat(Math.max(1, maxLen - c.name.length + 2));
        lines.push(`${c.name}${pad}${c.expires}  ${c.daysLeft}d`);
      }
      lines.push("");
    }
    if (cardExpired.length > 0) {
      lines.push("EXPIRED");
      const maxLen = Math.max(...cardExpired.map(c => c.name.length));
      for (const c of cardExpired) {
        const pad = " ".repeat(Math.max(1, maxLen - c.name.length + 2));
        lines.push(`${c.name}${pad}${c.expires}  ${Math.abs(c.daysLeft)}d ago`);
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
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.30)" }}>
        {left}
      </div>
      {right && (
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.20)", letterSpacing: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}

// ── Expiration item row ───────────────────────────────────────────────────────
function ItemRow({ label, subtitle, statusText, statusColor, deferred, onTap, onToggleDefer }: {
  label: string; subtitle?: string;
  statusText: string; statusColor: string;
  deferred: boolean; onTap: () => void; onToggleDefer: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px", borderRadius: 8,
      border: `1px solid ${deferred ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
      background: deferred ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
    }}>
      <div role="button" tabIndex={0} onClick={onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: deferred ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.88)" }}>
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: statusColor, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
        {statusText}
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleDefer(); }}
        title={deferred ? "Restore" : "Defer"}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          fontSize: 13, color: "rgba(255,255,255,0.18)", flexShrink: 0, lineHeight: 1 }}>
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

  // ── Build card directory ──────────────────────────────────────────────────
  type CardEntry = { name: string; expires: string; expiresISO: string; daysLeft: number };
  const cardActive:    CardEntry[] = [];
  const cardExpired:   CardEntry[] = [];
  const cardNotCarded: string[]    = [];

  for (const t of allTerminalsInCity) {
    const tid     = String(t.terminal_id);
    const name    = t.terminal_name ?? `Terminal ${tid}`;
    const lastISO = accessDateByTerminalId[tid];
    if (!lastISO) { cardNotCarded.push(name); continue; }
    const renewalDays = Number(t.renewal_days ?? t.renewalDays ?? t.renewal ?? 90) || 90;
    const expiresISO  = addDaysISO_(lastISO, renewalDays);
    const expired     = isPastISO_(expiresISO);
    const today = new Date(); today.setHours(0,0,0,0);
    const daysLeft = Math.round((new Date(expiresISO + "T00:00:00").getTime() - today.getTime()) / 86400000);
    const expiresText = formatMDYWithCountdown_(expiresISO).split(" (")[0];
    const entry: CardEntry = { name, expires: expiresText, expiresISO, daysLeft };
    expired ? cardExpired.push(entry) : cardActive.push(entry);
  }
  cardActive.sort((a, b) => a.daysLeft - b.daysLeft);
  cardExpired.sort((a, b) => a.daysLeft - b.daysLeft);
  cardNotCarded.sort();

  // Derive truck name for report header
  const truckItem = activeItems.find(i => i.entityType === "truck");
  const truckName = truckItem?.entityName ?? "";

  const report = buildReport(activeItems, truckName, selectedCity, selectedState, cardActive, cardExpired, cardNotCarded);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setShareError("Could not copy to clipboard."); }
  };
  const handleShare = async () => {
    setShareError("");
    if (navigator.share) { try { await navigator.share({ title: "Expiration Report", text: report }); } catch {} }
    else { window.open(`mailto:?subject=${encodeURIComponent("Expiration Report")}&body=${encodeURIComponent(report)}`); }
  };

  const tapAction = (item: ExpirationItem) => {
    onClose();
    item.entityType === "terminal" ? onOpenTerminals() : onOpenEquipment();
  };

  const loc = selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : selectedCity || selectedState || "";
  const locLabel = selectedCity && selectedState ? `In ${selectedCity}, ${selectedState}` : selectedCity ? `In ${selectedCity}` : "";

  // Group active items
  const activeTrucks    = activeItems.filter(i => i.entityType === "truck");
  const activeTrailers  = activeItems.filter(i => i.entityType === "trailer");
  const activeTerminals = activeItems.filter(i => i.entityType === "terminal");

  // Unique truck/trailer names for section labels
  const truckNames   = [...new Set(activeTrucks.map(i => i.entityName))].join(", ");
  const trailerNames = [...new Set(activeTrailers.map(i => i.entityName))].join(", ");

  const renderItems = (items: ExpirationItem[], isDeferred = false, onTap: (i: ExpirationItem) => void) =>
    items.map(item => {
      const deferred = isDeferred;
      const statusColor = deferred ? "rgba(255,255,255,0.22)"
        : item.expired ? "rgba(239,68,68,0.88)" : "rgba(234,179,8,0.88)";
      const statusText = item.expired
        ? `${deferred ? "" : "⛔ "}Expired ${Math.abs(item.daysLeft)}d ago`
        : `${deferred ? "" : "⚠ "}${item.daysLeft}d left`;
      // For terminals: show terminal name as title, doc type as subtitle
      // For equipment: show doc type as title (entity name is in section header)
      const isTerminal = item.entityType === "terminal";
      return (
        <ItemRow key={item.id}
          label={isTerminal ? item.entityName : item.label}
          subtitle={isTerminal ? undefined : undefined}
          statusText={statusText} statusColor={statusColor}
          deferred={deferred}
          onTap={() => onTap(item)}
          onToggleDefer={() => toggleDefer(item.id)}
        />
      );
    });

  const hasCards = cardActive.length + cardExpired.length + cardNotCarded.length > 0;

  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Truck docs ── */}
        {activeTrucks.length > 0 && (
          <div>
            <SectionLabel left="Truck Documents" right={truckNames ? `For ${truckNames}` : undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {renderItems(activeTrucks, false, tapAction)}
            </div>
          </div>
        )}

        {/* ── Trailer docs ── */}
        {activeTrailers.length > 0 && (
          <div>
            <SectionLabel left="Trailer Documents" right={trailerNames ? `For ${trailerNames}` : undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {renderItems(activeTrailers, false, tapAction)}
            </div>
          </div>
        )}

        {/* ── Terminal Cards — one card per terminal, sorted by status ── */}
        {hasCards && (
          <div>
            <SectionLabel left="Terminal Cards" right={locLabel || undefined} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>

              {/* Expired */}
              {cardExpired.map(c => (
                <div key={`exp-${c.name}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.20)", background: "rgba(239,68,68,0.06)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{c.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(239,68,68,0.85)", whiteSpace: "nowrap" as const }}>⛔ {c.expires} · {Math.abs(c.daysLeft)}d ago</div>
                </div>
              ))}

              {/* Active — sorted soonest first */}
              {cardActive.map(c => {
                const urgent = c.daysLeft <= 7;
                return (
                  <div key={`act-${c.name}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${urgent ? "rgba(234,179,8,0.20)" : "rgba(255,255,255,0.07)"}`, background: urgent ? "rgba(234,179,8,0.05)" : "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{c.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: urgent ? "rgba(234,179,8,0.85)" : "rgba(255,255,255,0.38)", whiteSpace: "nowrap" as const }}>{urgent ? "⚠ " : ""}{c.expires} · {c.daysLeft}d</div>
                  </div>
                );
              })}

              {/* Not carded — grey, no date */}
              {cardNotCarded.map(name => (
                <div key={`nc-${name}`} style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
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
                {renderItems(deferredItems, true, tapAction)}
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
