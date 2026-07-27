"use client";
// app/calculator/modals/SettingsModal.tsx
//
// App-level settings -- the gear icon used to (wrongly) open the Equipment
// modal; this is its real destination. Only placeholders for now (dark
// theme is the only theme that exists today, and subscription/IAP via
// RevenueCat isn't wired up yet per CLAUDE.md's product direction).
//
// Profile used to be its own hamburger-menu destination (/profile); it's
// now merged in here instead -- tapping "Profile" swaps this same modal's
// content to the embedded SelfProfileView rather than navigating away,
// with its own "‹ Back" row (FullscreenModal's header "Close" always means
// close, per the same convention as the Cards tab's AddCardSheet). The
// /profile route itself still exists (it's the post-signup magic-link
// landing page -- see app/login/page.tsx's emailRedirectTo), just no
// longer linked from the hamburger.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SelfProfileView } from "@/lib/ui/driver/SelfProfileView";

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
  const [view, setView] = useState<"root" | "profile">("root");

  useEffect(() => { if (open) setView("root"); }, [open]);

  return (
    <FullscreenModal open={open} title={view === "profile" ? "Profile" : "Settings"} onClose={onClose}>
      {view === "profile" ? (
        <div>
          <button
            type="button"
            onClick={() => setView("root")}
            style={{
              display: "flex", alignItems: "center", gap: 4, marginBottom: 16,
              border: "none", background: "none", padding: 0, cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)",
            }}
          >
            ‹ Back to Settings
          </button>
          <SelfProfileView />
        </div>
      ) : (
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
                sub="Name, hire date, division/region"
                onClick={() => setView("profile")}
              />
              <SettingsRow
                label="Subscription"
                sub="Manage your plan and billing"
                right={<ComingSoonTag />}
              />
            </div>
          </div>

        </div>
      )}
    </FullscreenModal>
  );
}
