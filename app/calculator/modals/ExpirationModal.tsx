"use client";
// modals/ExpirationModal.tsx

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { ExpirationItem } from "../hooks/useExpirations";

type Props = {
  open: boolean;
  onClose: () => void;
  items: ExpirationItem[];
  activeItems: ExpirationItem[];
  deferredItems: ExpirationItem[];
  toggleDefer: (id: string) => void;
  onOpenEquipment: () => void;
  onOpenTerminals: () => void;
};

// ── Report builder ────────────────────────────────────────────────────────────
function buildReport(active: ExpirationItem[], deferred: ExpirationItem[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });

  const lines: string[] = [`Expiration Report — ${date}`, ""];

  const sections: { label: string; items: ExpirationItem[] }[] = [
    { label: "Truck",    items: active.filter(i => i.entityType === "truck") },
    { label: "Trailer",  items: active.filter(i => i.entityType === "trailer") },
    { label: "Terminal", items: active.filter(i => i.entityType === "terminal") },
  ];

  for (const { label, items } of sections) {
    if (items.length === 0) continue;
    lines.push(label.toUpperCase());
    for (const i of items) {
      const status = i.expired
        ? `expired ${Math.abs(i.daysLeft)}d ago`
        : `${i.daysLeft}d remaining`;
      lines.push(`${i.entityName}  ${i.entitySubtitle}  ${status}`);
    }
    lines.push("");
  }

  if (deferred.length > 0) {
    lines.push("DEFERRED");
    for (const i of deferred) {
      const status = i.expired
        ? `expired ${Math.abs(i.daysLeft)}d ago`
        : `${i.daysLeft}d remaining`;
      lines.push(`${i.entityName}  ${i.entitySubtitle}  ${status}`);
    }
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

// ── Item row ──────────────────────────────────────────────────────────────────
function ItemRow({
  item, deferred, onTap, onToggleDefer,
}: {
  item: ExpirationItem;
  deferred: boolean;
  onTap: () => void;
  onToggleDefer: () => void;
}) {
  const statusColor = deferred
    ? "rgba(255,255,255,0.25)"
    : item.expired
      ? "rgba(239,68,68,0.90)"
      : "rgba(234,179,8,0.90)";

  const statusText = item.expired
    ? `Expired ${Math.abs(item.daysLeft)}d ago`
    : `${item.daysLeft}d left`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 12px", borderRadius: 10,
      border: `1px solid ${deferred ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
      background: deferred ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
    }}>
      {/* Main content — tappable to open modal */}
      <div
        role="button" tabIndex={0} onClick={onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: deferred ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.90)" }}>
          {item.entityName}
        </div>
        <div style={{ fontSize: 11, color: deferred ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.45)", marginTop: 1 }}>
          {item.entitySubtitle}
        </div>
      </div>

      {/* Status */}
      <div style={{ fontSize: 12, fontWeight: 800, color: statusColor, whiteSpace: "nowrap", flexShrink: 0 }}>
        {!deferred && (item.expired ? "⛔" : "⚠")} {statusText}
      </div>

      {/* Defer toggle */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDefer(); }}
        title={deferred ? "Restore alert" : "Defer alert"}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          fontSize: 14, color: deferred ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.20)",
          flexShrink: 0, lineHeight: 1,
        }}
        aria-label={deferred ? "Restore alert" : "Defer alert"}
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
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");

  const report = buildReport(activeItems, deferredItems);

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
      try { await navigator.share({ title: "ProTankr Expiration Report", text: report }); } catch {}
    } else {
      window.open(`mailto:?subject=${encodeURIComponent("ProTankr Expiration Report")}&body=${encodeURIComponent(report)}`);
    }
  };

  const tapAction = (item: ExpirationItem) => {
    onClose();
    item.entityType === "terminal" ? onOpenTerminals() : onOpenEquipment();
  };

  const renderSection = (
    label: string,
    sectionItems: ExpirationItem[],
    isDeferred = false,
  ) => {
    if (sectionItems.length === 0) return null;
    return (
      <div>
        <div style={SECTION_HEADER}>{label}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sectionItems.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              deferred={isDeferred}
              onTap={() => tapAction(item)}
              onToggleDefer={() => toggleDefer(item.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  // Group active items by entity type for display
  const activeTrucks    = activeItems.filter(i => i.entityType === "truck");
  const activeTrailers  = activeItems.filter(i => i.entityType === "trailer");
  const activeTerminals = activeItems.filter(i => i.entityType === "terminal");

  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Nothing expiring soon.</div>
        ) : (
          <>
            {renderSection("Truck Documents",  activeTrucks)}
            {renderSection("Trailer Documents", activeTrailers)}
            {renderSection("Terminal Cards",    activeTerminals)}
            {renderSection("Deferred",          deferredItems, true)}

            {/* Share */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
              <div style={{ ...SECTION_HEADER, marginBottom: 8 }}>Share Report</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleCopy} style={BTN}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button type="button" onClick={handleShare} style={BTN}>
                  Share / Email
                </button>
              </div>
              {shareError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "rgba(239,68,68,0.80)" }}>{shareError}</div>
              )}
            </div>
          </>
        )}
      </div>
    </FullscreenModal>
  );
}
