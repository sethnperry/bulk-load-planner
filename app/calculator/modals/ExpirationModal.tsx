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
  // Card directory
  selectedCity: string;
  selectedState: string;
  allTerminalsInCity: TerminalEntry[];
  accessDateByTerminalId: Record<string, string | undefined>;
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
};

// ── Report builder ────────────────────────────────────────────────────────────
function buildReport(
  active: ExpirationItem[],
  deferred: ExpirationItem[],
  city: string,
  state: string,
  cardActive: { name: string; expires: string; daysLeft: number }[],
  cardExpired: { name: string; expires: string; daysLeft: number }[],
  cardNotCarded: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });

  const lines: string[] = [];

  // ── Expiration section ────────────────────────────────────────────────────
  const hasExp = active.length > 0 || deferred.length > 0;
  if (hasExp) {
    lines.push(`Expiration Report — ${date}`, "");
    const trucks   = active.filter(i => i.entityType === "truck");
    const trailers = active.filter(i => i.entityType === "trailer");
    const terminals = active.filter(i => i.entityType === "terminal");
    for (const [label, group] of [["TRUCK", trucks], ["TRAILER", trailers], ["TERMINAL", terminals]] as [string, ExpirationItem[]][]) {
      if (group.length === 0) continue;
      lines.push(label);
      for (const i of group) {
        const status = i.expired ? `expired ${Math.abs(i.daysLeft)}d ago` : `${i.daysLeft}d remaining`;
        lines.push(`${i.entityName}  ${i.entitySubtitle}  ${status}`);
      }
      lines.push("");
    }
  }

  // ── Card directory section ────────────────────────────────────────────────
  const loc = city && state ? `${city}, ${state}` : city || state || "";
  lines.push(`Card Directory${loc ? ` — ${loc}` : ""}  ${date}`, "");

  if (cardActive.length > 0) {
    lines.push("ACTIVE");
    // Pad names for clean columns
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

  return lines.join("\n").trimEnd();
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const SECTION_HEADER: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.30)",
  marginBottom: 6,
};
const BTN: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.80)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
};

// ── Expiration item row ───────────────────────────────────────────────────────
function ItemRow({ item, deferred, onTap, onToggleDefer }: {
  item: ExpirationItem; deferred: boolean;
  onTap: () => void; onToggleDefer: () => void;
}) {
  const statusColor = deferred ? "rgba(255,255,255,0.25)"
    : item.expired ? "rgba(239,68,68,0.90)" : "rgba(234,179,8,0.90)";
  const statusText = item.expired
    ? `Expired ${Math.abs(item.daysLeft)}d ago` : `${item.daysLeft}d left`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 12px", borderRadius: 10,
      border: `1px solid ${deferred ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
      background: deferred ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
    }}>
      <div role="button" tabIndex={0} onClick={onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: deferred ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.90)" }}>
          {item.entityName}
        </div>
        <div style={{ fontSize: 11, color: deferred ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.45)", marginTop: 1 }}>
          {item.entitySubtitle}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: statusColor, whiteSpace: "nowrap", flexShrink: 0 }}>
        {!deferred && (item.expired ? "⛔" : "⚠")} {statusText}
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleDefer(); }}
        title={deferred ? "Restore alert" : "Defer alert"}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          fontSize: 14, color: deferred ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.20)",
          flexShrink: 0, lineHeight: 1 }}
        aria-label={deferred ? "Restore" : "Defer"}>
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

  // ── Build card directory data ─────────────────────────────────────────────
  type CardEntry = { name: string; expires: string; expiresISO: string; daysLeft: number };
  const cardActive:    CardEntry[] = [];
  const cardExpired:   CardEntry[] = [];
  const cardNotCarded: string[]    = [];

  for (const t of allTerminalsInCity) {
    const tid    = String(t.terminal_id);
    const name   = t.terminal_name ?? `Terminal ${tid}`;
    const lastISO = accessDateByTerminalId[tid];
    if (!lastISO) {
      cardNotCarded.push(name);
      continue;
    }
    const renewalDays = Number(t.renewal_days ?? t.renewalDays ?? t.renewal ?? 90) || 90;
    const expiresISO  = addDaysISO_(lastISO, renewalDays);
    const expired     = isPastISO_(expiresISO);
    const today       = new Date(); today.setHours(0,0,0,0);
    const expDate     = new Date(expiresISO + "T00:00:00");
    const daysLeft    = Math.round((expDate.getTime() - today.getTime()) / 86400000);
    const expiresText = formatMDYWithCountdown_(expiresISO).split(" (")[0]; // just the date
    const entry: CardEntry = { name, expires: expiresText, expiresISO, daysLeft };
    expired ? cardExpired.push(entry) : cardActive.push(entry);
  }

  // Sort active by soonest expiring, expired by most recently expired
  cardActive.sort((a, b) => a.daysLeft - b.daysLeft);
  cardExpired.sort((a, b) => a.daysLeft - b.daysLeft);
  cardNotCarded.sort();

  const report = buildReport(
    activeItems, deferredItems,
    selectedCity, selectedState,
    cardActive, cardExpired, cardNotCarded,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setShareError("Could not copy to clipboard."); }
  };

  const handleShare = async () => {
    setShareError("");
    if (navigator.share) {
      try { await navigator.share({ title: "Expiration Report", text: report }); } catch {}
    } else {
      window.open(`mailto:?subject=${encodeURIComponent("Expiration Report")}&body=${encodeURIComponent(report)}`);
    }
  };

  const tapAction = (item: ExpirationItem) => {
    onClose();
    item.entityType === "terminal" ? onOpenTerminals() : onOpenEquipment();
  };

  const renderExpSection = (label: string, sectionItems: ExpirationItem[], isDeferred = false) => {
    if (sectionItems.length === 0) return null;
    return (
      <div>
        <div style={SECTION_HEADER}>{label}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sectionItems.map(item => (
            <ItemRow key={item.id} item={item} deferred={isDeferred}
              onTap={() => tapAction(item)} onToggleDefer={() => toggleDefer(item.id)} />
          ))}
        </div>
      </div>
    );
  };

  const loc = selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : selectedCity || selectedState || "";
  const hasCards = cardActive.length + cardExpired.length + cardNotCarded.length > 0;
  const hasExpirations = items.length > 0;

  const activeTrucks    = activeItems.filter(i => i.entityType === "truck");
  const activeTrailers  = activeItems.filter(i => i.entityType === "trailer");
  const activeTerminals = activeItems.filter(i => i.entityType === "terminal");

  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Expiration alerts ── */}
        {hasExpirations && (
          <>
            {renderExpSection("Truck Documents",   activeTrucks)}
            {renderExpSection("Trailer Documents",  activeTrailers)}
            {renderExpSection("Terminal Cards",     activeTerminals)}

            {/* Deferred — collapsed into single row */}
            {deferredItems.length > 0 && (
              <div>
                <button type="button"
                  onClick={() => setDeferredExpanded(p => !p)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ ...SECTION_HEADER, marginBottom: 0 }}>
                    Deferred ({deferredItems.length})
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    {deferredExpanded ? "▲" : "▼"}
                  </div>
                </button>
                {deferredExpanded && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {deferredItems.map(item => (
                      <ItemRow key={item.id} item={item} deferred={true}
                        onTap={() => tapAction(item)} onToggleDefer={() => toggleDefer(item.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!hasExpirations && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>No equipment or terminal expirations.</div>
        )}

        {/* ── Card directory ── */}
        {hasCards && (
          <>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
              <div style={{ ...SECTION_HEADER, marginBottom: 12 }}>
                Card Directory{loc ? ` — ${loc}` : ""}
              </div>

              {/* Expired first */}
              {cardExpired.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(239,68,68,0.60)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Expired</div>
                  {cardExpired.map(c => (
                    <div key={c.expiresISO + c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(239,68,68,0.80)", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {c.expires} · {Math.abs(c.daysLeft)}d ago
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active */}
              {cardActive.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.30)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Active</div>
                  {cardActive.map(c => (
                    <div key={c.expiresISO + c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {c.expires} · {c.daysLeft}d
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Not carded */}
              {cardNotCarded.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.20)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Not Carded</div>
                  {cardNotCarded.map(name => (
                    <div key={name} style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Share ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <div style={{ ...SECTION_HEADER, marginBottom: 8 }}>Share Report</div>
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
