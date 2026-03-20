"use client";
// components/ExpirationAlertBar.tsx
// Amber/red pill shown between equipment pill and NavMenu.
// Hidden when nothing is expiring.

import React from "react";
import type { ExpirationItem } from "../hooks/useExpirations";

type Props = {
  items: ExpirationItem[];
  expiredCount: number;
  warningCount: number;
  mostUrgent: ExpirationItem | null;
  onClick: () => void;
};

export default function ExpirationAlertBar({ items, expiredCount, warningCount, mostUrgent, onClick }: Props) {
  if (items.length === 0) return null;

  const isRed = expiredCount > 0;
  const total = items.length;

  // Label: single item shows its detail, multiple shows count
  let label: string;
  if (total === 1 && mostUrgent) {
    if (mostUrgent.expired) {
      label = `EXP ${mostUrgent.entityName} · ${mostUrgent.label}`;
    } else {
      label = `EXP ${mostUrgent.daysLeft}d · ${mostUrgent.entityName}`;
    }
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
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 10px",
        borderRadius: 10,
        border: `1px solid ${isRed ? "rgba(239,68,68,0.40)" : "rgba(234,179,8,0.40)"}`,
        background: isRed ? "rgba(239,68,68,0.12)" : "rgba(234,179,8,0.10)",
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <span style={{
        fontSize: 12,
        color: isRed ? "rgba(239,68,68,0.90)" : "rgba(234,179,8,0.90)",
        flexShrink: 0,
      }}>
        {isRed ? "⛔" : "⚠"}
      </span>
      <span style={{
        fontSize: "clamp(10px, 2.4vw, 12px)",
        fontWeight: 700,
        color: isRed ? "rgba(239,68,68,0.90)" : "rgba(234,179,8,0.90)",
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
        letterSpacing: 0.2,
      }}>
        {label}
      </span>
    </button>
  );
}
