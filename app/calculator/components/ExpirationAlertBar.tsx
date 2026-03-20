"use client";
// components/ExpirationAlertBar.tsx

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

  // All deferred — show a quiet grey tag
  if (allDeferred) {
    return (
      <button type="button" onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 10px", borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        cursor: "pointer", flexShrink: 0,
      }}>
        <span style={{ fontSize: "clamp(10px, 2.4vw, 12px)", fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: 0.2 }}>
          Expirations
        </span>
      </button>
    );
  }

  const isRed = expiredCount > 0;
  const total = activeItems.length;

  let label: string;
  if (total === 1 && mostUrgent) {
    label = mostUrgent.expired
      ? `EXP ${mostUrgent.entityName}`
      : `EXP ${mostUrgent.daysLeft}d`;
  } else {
    const parts: string[] = [];
    if (expiredCount > 0) parts.push(`${expiredCount} expired`);
    if (warningCount > 0) parts.push(`${warningCount} expiring`);
    label = parts.join(" · ");
  }

  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "6px 10px", borderRadius: 10,
      border: `1px solid ${isRed ? "rgba(239,68,68,0.40)" : "rgba(234,179,8,0.40)"}`,
      background: isRed ? "rgba(239,68,68,0.12)" : "rgba(234,179,8,0.10)",
      cursor: "pointer", flexShrink: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 12, color: isRed ? "rgba(239,68,68,0.90)" : "rgba(234,179,8,0.90)", flexShrink: 0 }}>
        {isRed ? "⛔" : "⚠"}
      </span>
      <span style={{
        fontSize: "clamp(10px, 2.4vw, 12px)", fontWeight: 700,
        color: isRed ? "rgba(239,68,68,0.90)" : "rgba(234,179,8,0.90)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.2,
      }}>
        {label}
      </span>
    </button>
  );
}
