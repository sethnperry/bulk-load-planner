"use client";
// app/planner/CalculatorLayoutClient.tsx
//
// Redesign shell (Phase 1 of the "ProTankr mobile app design" handoff):
// full-bleed gradient header (hamburger/bell/gear + alerts cluster) and a
// Planner/Cards/Vault tab bar, shared across three real routes
// (/planner, /planner/cards, /planner/vault) rather than in-page
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
import SettingsModal from "./modals/SettingsModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import RackSelectSheet from "./components/RackSelectSheet";
import { CalculatorShellProvider, useCalculatorShell } from "./CalculatorShellContext";
import { addDaysISO_, isPastISO_, formatMDYWithCountdown_ } from "./utils/dates";
import { normState } from "./utils/normalize";
import {
  themeFill, themeHeaderGradient, themeIconStroke, themeTabActive, themeTabInactive,
  themeUnderlineTrack, themeUnderlineActive,
} from "./theme";
import type { Role } from "@/lib/ui/driver/role";

// Terminal Tier pivot (2026-08-03, see CLAUDE.md "Terminal Tier — Build
// Spec"). Every tab now has a stable, unique id regardless of role --
// Dispatch and Planner used to share id "planner" so the tab bar could
// toggle between them for admin, which caused a real bug: landing on bare
// /planner (Planner's route) while the tab bar's "Dispatch" slot
// highlighted itself (same shared id) made it look like Dispatch was
// showing when Planner content actually was. Fixed by giving admin real,
// separate Dispatch AND Planner tabs (no more toggle) instead of trying to
// keep one shared slot honest.
//
// Dispatch never gets a Planner tab -- dispatchers don't get in a truck.
// Admin and super admins get both, since "admins should have the planner
// used by lead drivers" (see page.tsx's canDriverTrain).
const TERMINAL_TAB = { id: "terminal", label: "Terminal", href: "/planner/terminal" };
const DISPATCH_TAB = { id: "dispatch", label: "Dispatch", href: "/planner/dispatch" };
const PLANNER_TAB = { id: "planner", label: "Planner", href: "/planner" };
const CARDS_TAB = { id: "cards", label: "Cards", href: "/planner/cards" };
const VAULT_TAB = { id: "vault", label: "Vault", href: "/planner/vault" };

function tabsFor(role: Role | null, isSuperAdmin: boolean) {
  // Terminal and Dispatch swapped 2026-08-06 (per explicit direction) so
  // Terminal sits next to Planner.
  if (role === "dispatch") return [DISPATCH_TAB, TERMINAL_TAB, CARDS_TAB, VAULT_TAB];
  if (role === "admin" || isSuperAdmin) return [DISPATCH_TAB, TERMINAL_TAB, PLANNER_TAB, CARDS_TAB, VAULT_TAB];
  return [TERMINAL_TAB, PLANNER_TAB, CARDS_TAB, VAULT_TAB]; // driver, lead, or unresolved
}

function activeTabFor(pathname: string | null): string | "none" {
  if (pathname?.startsWith("/planner/terminal")) return "terminal";
  if (pathname?.startsWith("/planner/dispatch")) return "dispatch";
  if (pathname?.startsWith("/planner/cards")) return "cards";
  if (pathname?.startsWith("/planner/vault")) return "vault";
  // Reports is a nav-menu destination, not a peer of Planner/Cards/Vault --
  // "none" leaves every tab unhighlighted instead of falsely bolding
  // Planner while Reports content is what's actually showing.
  if (pathname?.startsWith("/planner/reports")) return "none";
  return "planner";
}

function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const shell = useCalculatorShell();
  const darkMode = shell.theme.darkMode;
  const tabs = useMemo(() => tabsFor(shell.role, shell.isSuperAdmin), [shell.role, shell.isSuperAdmin]);
  const active = activeTabFor(pathname);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollNavRef = useRef(false);

  const centerTab = (id: string, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressScrollNavRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressScrollNavRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerTab(active, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { centerTab(active, true); }, [active, tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch every tab's route so router.push below is served from cache
  // instead of waiting on a fresh RSC round trip -- this is most of what
  // actually reads as "glitchy" switching tabs (a real network/render delay
  // before the new route settles), separate from the theme-flash fix in
  // useTheme.ts.
  useEffect(() => {
    tabs.forEach((t) => router.prefetch(t.href));
  }, [tabs, router]);

  function onScroll() {
    if (suppressScrollNavRef.current) return;
    // "none" means we're on a non-tab destination (e.g. Reports) where no
    // tab is meant to be highlighted -- scroll-driven auto-navigation would
    // otherwise treat every settle as "closest tab != none" and push away.
    if (active === "none") return;
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
      const id = tabs[best]?.id;
      if (id && id !== active) router.push(tabs[best].href);
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
        {tabs.map((t) => {
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
                color: isActive ? themeTabActive(darkMode) : themeTabInactive(darkMode),
                transition: "all 150ms ease",
              }}>
                {t.label}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, height: 1, background: themeUnderlineTrack(darkMode) }} />
        <div style={{ flex: 1, height: 2, background: themeUnderlineActive(darkMode) }} />
        <div style={{ flex: 1, height: 1, background: themeUnderlineTrack(darkMode) }} />
      </div>
    </div>
  );
}

function BellIcon({ count, onClick, stroke }: { count: number; onClick: () => void; stroke: string }) {
  return (
    <button type="button" onClick={onClick} aria-label="Alerts" style={{ position: "relative", border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      {count > 0 && (
        <span style={{ position: "absolute", top: -4, right: -8, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 8, background: "#ef4444", font: "500 9px Outfit", lineHeight: "15px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function GearIcon({ onClick, stroke }: { onClick: () => void; stroke: string }) {
  return (
    <button type="button" onClick={onClick} aria-label="Settings" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  );
}

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const shell = useCalculatorShell();
  const { darkMode, accentColor } = shell.theme;
  const iconStroke = themeIconStroke(darkMode);
  const pathname = usePathname();

  // The OS status bar / PWA chrome strip above this header is drawn by the
  // browser from <meta name="theme-color">, not from any CSS on the page --
  // layout.tsx's static `viewport.themeColor` only sets its initial value,
  // so it has to be kept in sync here whenever Dark Mode/accent change.
  //
  // 2026-08-06: this used to reset the tag to "#ffffff" in a cleanup
  // function, which React fires before *every* re-run of this effect (i.e.
  // on every darkMode/accentColor change), not just on Header's true
  // unmount -- a real, needless "flash white, then set the real color"
  // write pattern that lines up with the reported "dark mode flashes back
  // to white then corrects" glitch. That pass's reasoning was: Next's own
  // per-route metadata already re-applies whatever static
  // `viewport.themeColor` a *different* layout declares once the user
  // actually navigates away from /planner entirely, so this effect only
  // needs to keep the tag in sync while Header is mounted, never reset it.
  //
  // 2026-08-19: that reasoning missed a case -- Next re-applies the
  // CURRENT route segment's own static metadata on every client-side
  // navigation, including navigation between two routes that share this
  // SAME layout (e.g. /planner -> /planner/reports). Since Header never
  // unmounts for that transition, its effect doesn't re-run on its own
  // (darkMode/accentColor didn't change) -- so Next's re-applied static
  // white default sat there uncorrected. `pathname` in the dependency
  // array makes this effect re-assert the real color on every route
  // change too, not just every theme change.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeFill(darkMode, accentColor, "#ffffff"));
  }, [darkMode, accentColor, pathname]);

  return (
    <div style={{
      // iOS's translucent status bar (see layout.tsx) shows whatever this
      // div paints underneath it -- extending the padding (and therefore
      // this gradient background) up through the safe area is what actually
      // makes the status bar match the current theme instead of leaving a
      // seam; the icon row below is unaffected since it's a separate nested
      // div with its own fixed padding.
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
      background: themeHeaderGradient(darkMode, accentColor), flexShrink: 0, position: "relative", overflow: "visible",
      transition: "background 200ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <NavMenu darkMode={darkMode} />
        <div style={{ display: "flex", gap: 26, flexShrink: 0, alignItems: "center" }}>
          <BellIcon count={shell.expirations.expiredCount + shell.expirations.warningCount} onClick={() => shell.setExpModalOpen(true)} stroke={iconStroke} />
          <GearIcon onClick={onOpenSettings} stroke={iconStroke} />
        </div>
      </div>
      <TabBar />
    </div>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const shell = useCalculatorShell();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div style={{ height: "100dvh", background: "#0b0b0b", color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Header onOpenSettings={() => setSettingsOpen(true)} />
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
        myRole={shell.role}
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
        formatMDYWithCountdown_={formatMDYWithCountdown_}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Location/Terminal picker -- shared single instance (same reasoning
          as EquipmentModal above): the Planner's "Select Location" card and
          the Terminal tab's identity header both open THIS modal pair, both
          read/write the one shared shell.location, so picking a city/
          terminal from either tab is instantly reflected in the other. */}
      <LocationModal
        open={shell.locOpen} onClose={() => shell.setLocOpen(false)}
        selectedState={shell.location.selectedState}
        selectedStateLabel={shell.selectedStateLabel}
        selectedStateName={shell.selectedStateName}
        statesError={shell.location.statesError}
        statesLoading={shell.location.statesLoading}
        statePickerOpen={shell.statePickerOpen}
        setStatePickerOpen={shell.setStatePickerOpen}
        stateOptions={shell.stateOptions}
        setSelectedState={shell.location.setSelectedState}
        selectedCity={shell.location.selectedCity}
        citiesLoading={shell.location.citiesLoading}
        citiesError={shell.location.citiesError}
        cities={shell.cities}
        topCities={shell.topCities}
        allCities={shell.allCities}
        setSelectedCity={shell.location.setSelectedCity}
        normState={normState}
        toggleCityStar={shell.toggleCityStar}
        isCityStarred={shell.isCityStarred}
        setLocOpen={shell.setLocOpen}
      />

      <MyTerminalsModal
        open={shell.termOpen} onClose={() => shell.setTermOpen(false)}
        selectedState={shell.location.selectedState}
        selectedCity={shell.location.selectedCity}
        termError={shell.terminals.termError}
        terminalsFiltered={shell.terminalFilters.terminalsFiltered}
        selectedTerminalId={shell.location.selectedTerminalId}
        expandedTerminalId={shell.expandedTerminalId}
        setExpandedTerminalId={shell.setExpandedTerminalId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        accessDateByTerminalId={shell.terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={shell.terminals.setAccessDateForTerminal}
        cardDataByTerminalId={shell.cardDataByTerminalId}
        myTerminalIds={shell.myTerminalIdSet}
        setMyTerminalIds={() => {}}
        setSelectedTerminalId={shell.chooseTerminal}
        setTermOpen={shell.setTermOpen}
        onChangeLocation={() => { shell.setTermOpen(false); shell.setLocOpen(true); }}
      />

      <RackSelectSheet
        open={shell.rackPickerOpen}
        terminalLabel={shell.terminalFilters.terminalsFiltered.find(
          (t: any) => String(t.terminal_id) === String(shell.location.selectedTerminalId)
        )?.terminal_name ?? undefined}
        racks={shell.rackPickerRacks}
        onPick={shell.resolveRackPick}
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
