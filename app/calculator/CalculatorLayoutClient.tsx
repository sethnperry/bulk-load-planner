"use client";
// app/calculator/CalculatorLayoutClient.tsx
//
// Redesign shell (Phase 1 of the "ProTankr mobile app design" handoff):
// full-bleed gradient header (hamburger/bell/gear + alerts cluster) and a
// Planner/Cards/Vault tab bar, shared across three real routes
// (/calculator, /calculator/cards, /calculator/vault) rather than in-page
// tab state -- gets back/forward navigation for free and matches this
// app's existing multi-route convention.
//
// The preset-letter watermark from the design is deliberately omitted here
// -- "which preset is currently loaded" is Planner-only state that doesn't
// exist yet in the real app (usePlanSlots has no "active letter" concept
// today); wiring that up is part of a later phase, not this shell pass.
//
// Split out from layout.tsx (which is now a server component exporting its
// own `viewport.themeColor`) because Next's Metadata API requires viewport/
// metadata exports to live in a server component -- this client component
// holds all the actual interactive shell logic.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import NavMenu from "@/lib/ui/NavMenu";
import EquipmentModal from "./modals/EquipmentModal";
import ExpirationModal from "./modals/ExpirationModal";
import { CalculatorShellProvider, useCalculatorShell } from "./CalculatorShellContext";
import { addDaysISO_, isPastISO_, formatMDYWithCountdown_ } from "./utils/dates";

const TABS = [
  { id: "planner", label: "Planner", href: "/calculator" },
  { id: "cards", label: "Cards", href: "/calculator/cards" },
  { id: "vault", label: "Vault", href: "/calculator/vault" },
] as const;

function activeTabFor(pathname: string | null): typeof TABS[number]["id"] {
  if (pathname === "/calculator/cards") return "cards";
  if (pathname === "/calculator/vault") return "vault";
  return "planner";
}

function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeTabFor(pathname);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollNavRef = useRef(false);

  const centerTab = (id: string, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = TABS.findIndex((t) => t.id === id);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressScrollNavRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressScrollNavRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerTab(active, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { centerTab(active, true); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    if (suppressScrollNavRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let best = 0, bestDist = Infinity;
      Array.from(container.children).forEach((child, i) => {
        const r = (child as HTMLElement).getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - centerX);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      const id = TABS[best]?.id;
      if (id && id !== active) router.push(TABS[best].href);
    }, 80);
  }

  return (
    <div style={{ marginTop: 18, flexShrink: 0 }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="pt-tabscroll"
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory",
          padding: "0 calc(50% - 60px)", WebkitOverflowScrolling: "touch",
        }}
      >
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              onClick={() => { if (t.id !== active) router.push(t.href); else centerTab(t.id, true); }}
              style={{ flex: "0 0 120px", scrollSnapAlign: "center", display: "flex", justifyContent: "center", cursor: "pointer" }}
            >
              <div style={{
                padding: "14px 2px",
                font: isActive ? "500 16px Outfit" : "400 14px Outfit",
                color: isActive ? "#111" : "rgba(0,0,0,0.35)",
                transition: "all 150ms ease",
              }}>
                {t.label}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.15)" }} />
        <div style={{ flex: 1, height: 2, background: "#111" }} />
        <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.15)" }} />
      </div>
    </div>
  );
}

function BellIcon({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Alerts" style={{ position: "relative", border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      {count > 0 && (
        <span style={{ position: "absolute", top: -4, right: -8, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 8, background: "#ef4444", font: "500 9px Outfit", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function GearIcon({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Equipment" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  );
}

function Header() {
  const shell = useCalculatorShell();
  return (
    <div style={{ paddingTop: 60, background: "linear-gradient(180deg, #ffffff 0%, #f2f2f2 100%)", flexShrink: 0, position: "relative", overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <NavMenu />
        <div style={{ display: "flex", gap: 26, flexShrink: 0, alignItems: "center" }}>
          <BellIcon count={shell.expirations.expiredCount + shell.expirations.warningCount} onClick={() => shell.setExpModalOpen(true)} />
          <GearIcon onClick={() => shell.setEquipOpen(true)} />
        </div>
      </div>
      <TabBar />
    </div>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const shell = useCalculatorShell();
  return (
    <div style={{ height: "100dvh", background: "#0b0b0b", color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Header />
      <div className="pt-tabscroll" style={{ flex: 1, overflowY: "auto", padding: "0px 12px 12px", background: "#0b0b0b" }}>
        {children}
      </div>

      <EquipmentModal
        open={shell.equipOpen}
        onClose={() => shell.setEquipOpen(false)}
        authUserId={shell.effectiveUserId}
        setupSession={shell.setupSession}
        combos={shell.equipment.combos}
        combosLoading={shell.equipment.combosLoading}
        combosError={shell.equipment.combosError}
        selectedComboId={shell.equipment.selectedComboId ?? ""}
        onSelectComboId={(id: string) => shell.equipment.setSelectedComboId(id)}
        onRefreshCombos={shell.equipment.fetchCombos}
        onTourAdvance={() => {}}
      />

      <ExpirationModal
        open={shell.expModalOpen}
        onClose={() => shell.setExpModalOpen(false)}
        items={shell.expirations.items}
        activeItems={shell.expirations.activeItems}
        deferredItems={shell.expirations.deferredItems}
        toggleDefer={shell.expirations.toggleDefer}
        onOpenEquipment={() => shell.setEquipOpen(true)}
        onOpenTerminals={() => shell.setTermOpen(true)}
        selectedCity={shell.location.selectedCity}
        selectedState={shell.location.selectedState}
        allTerminalsInCity={shell.terminalFilters.catalogTerminalsInCity}
        accessDateByTerminalId={shell.terminals.accessDateByTerminalId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
      />

      <style jsx global>{`
        .pt-tabscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .pt-tabscroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

export default function CalculatorLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CalculatorShellProvider>
      <ShellChrome>{children}</ShellChrome>
    </CalculatorShellProvider>
  );
}
