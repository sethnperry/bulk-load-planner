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
import { useCalculatorShell } from "../CalculatorShellContext";
import { supabase } from "@/lib/supabase/client";
import JoinFleetView from "../components/JoinFleetView";

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, borderRadius: 999, border: "none", padding: 3,
        background: checked ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.14)",
        display: "flex", justifyContent: checked ? "flex-end" : "flex-start",
        cursor: "pointer", transition: "background 150ms", flexShrink: 0,
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: checked ? "#111" : "#fff", transition: "transform 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
    </button>
  );
}

function AccentColorPicker({ value, onChange, onReset }: { value: string | null; onChange: (v: string) => void; onReset: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      {value && (
        <button type="button" onClick={onReset} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          Reset
        </button>
      )}
      <label style={{ position: "relative", width: 28, height: 28, borderRadius: "50%", overflow: "hidden", border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer", background: value ?? "#3a3a3c", display: "block" }}>
        <input
          type="color"
          value={value ?? "#3a3a3c"}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", opacity: 0, cursor: "pointer", border: "none", padding: 0 }}
        />
      </label>
    </div>
  );
}

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
  const shell = useCalculatorShell();
  const { darkMode, accentColor, setDarkMode, setAccentColor } = shell.theme;
  const [view, setView] = useState<"root" | "profile" | "joinFleet">("root");
  const [isSolo, setIsSolo] = useState(false);

  useEffect(() => { if (open) setView("root"); }, [open]);

  // "Join a Fleet" only makes sense for a solo company -- an existing fleet
  // member switching companies via a different invite code is a separate,
  // unaddressed scenario, out of scope here.
  useEffect(() => {
    if (!open || !shell.companyId) return;
    let cancelled = false;
    supabase.from("companies").select("is_solo").eq("company_id", shell.companyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsSolo(Boolean(data?.is_solo)); });
    return () => { cancelled = true; };
  }, [open, shell.companyId]);

  return (
    <FullscreenModal open={open} title={view === "profile" ? "Profile" : view === "joinFleet" ? "Join a Fleet" : "Settings"} onClose={onClose}>
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
      ) : view === "joinFleet" ? (
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
          <JoinFleetView onJoined={() => { window.location.href = "/calculator"; }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div>
            <SectionLabel>Appearance</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              <SettingsRow
                label="Dark Mode"
                sub="Graphite header, Load button, handles & CG dot"
                right={<ToggleSwitch checked={darkMode} onChange={setDarkMode} />}
              />
              <SettingsRow
                label="Accent Color"
                sub={accentColor ? "Overrides Dark Mode's fill on those same elements" : "Optional -- pick a custom color for those same elements"}
                right={<AccentColorPicker value={accentColor} onChange={setAccentColor} onReset={() => setAccentColor(null)} />}
              />
            </div>
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
              {isSolo && (
                <SettingsRow
                  label="Join a Fleet"
                  sub="Have an invite code from your company?"
                  onClick={() => setView("joinFleet")}
                />
              )}
            </div>
          </div>

        </div>
      )}
    </FullscreenModal>
  );
}
