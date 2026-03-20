"use client";
// components/ExpirationAlertBar.tsx
// Text-only alert — no pill, no border. Just a tappable label.

import React from "react";
import type { ExpirationItem } from "../hooks/useExpirations";

type Props = {
  items: ExpirationItem[];
  activeItems: ExpirationItem[];
  expiredCount: number;
  warningCount: number;
  mostUrgent: ExpirationItem | null;
  allDeferred: boolean;
  onClick: () => void;
};

export default function ExpirationAlertBar({
  items, activeItems, expiredCount, warningCount, mostUrgent, allDeferred, onClick,
}: Props) {
  if (items.length === 0) return null;

  const isRed  = expiredCount > 0;
  const color  = allDeferred
    ? "rgba(255,255,255,0.28)"
    : isRed
      ? "rgba(239,68,68,0.90)"
      : "rgba(234,179,8,0.90)";

  let label: string;
  if (allDeferred) {
    label = "Expirations";
  } else if (activeItems.length === 1 && mostUrgent) {
    label = mostUrgent.expired ? `EXP ${mostUrgent.entityName}` : `EXP ${mostUrgent.daysLeft}d`;
  } else {
    const parts: string[] = [];
    if (expiredCount > 0) parts.push(`${expiredCount} expired`);
    if (warningCount > 0) parts.push(`${warningCount} expiring`);
    label = parts.join(" · ");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "4px 2px",
        cursor: "pointer",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <span style={{
        fontSize: "clamp(11px, 2.6vw, 13px)",
        fontWeight: 800,
        color,
        whiteSpace: "nowrap",
        letterSpacing: 0.2,
      }}>
        {!allDeferred && (isRed ? "⛔ " : "⚠ ")}{label}
      </span>
    </button>
  );
}
