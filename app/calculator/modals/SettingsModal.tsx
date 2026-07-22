"use client";
// app/calculator/modals/SettingsModal.tsx
//
// App-level settings -- the gear icon used to (wrongly) open the Equipment
// modal; this is its real destination. Only placeholders for now (dark
// theme is the only theme that exists today, and subscription/IAP via
// RevenueCat isn't wired up yet per CLAUDE.md's product direction) --
// Profile is the one row that's a real, already-existing route.

import React from "react";
import { useRouter } from "next/navigation";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

function ComingSoonTag() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" as const,
      color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" as const,
    }}>
      Coming soon
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SettingsRow({ label, sub, right, onClick }: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)", cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
      {onClick && <span style={{ fontSize: 15, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>›</span>}
    </div>
  );
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  return (
    <FullscreenModal open={open} title="Settings" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div>
          <SectionLabel>Appearance</SectionLabel>
          <SettingsRow
            label="Dark Mode"
            sub="ProTankr is dark-themed only for now"
            right={<ComingSoonTag />}
          />
        </div>

        <div>
          <SectionLabel>Account</SectionLabel>
          <div style={{ display: "grid", gap: 8 }}>
            <SettingsRow
              label="Profile"
              sub="Name, license info, contact details"
              onClick={() => { onClose(); router.push("/profile"); }}
            />
            <SettingsRow
              label="Subscription"
              sub="Manage your plan and billing"
              right={<ComingSoonTag />}
            />
          </div>
        </div>

      </div>
    </FullscreenModal>
  );
}
