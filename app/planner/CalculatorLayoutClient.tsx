"use client";
// app/planner/CalculatorLayoutClient.tsx
//
// Redesign shell: full-bleed gradient header (hamburger/bell/gear + alerts
// cluster), shared across every /planner/* route via this one layout client
// component rather than in-page chrome -- gets back/forward navigation for
// free and matches this app's existing multi-route convention.
//
// The visible tab bar (Dispatch/Insights/Planner/Cards/Vault) that used to
// render below/inline with this header is gone entirely -- every
// destination it held now lives in NavMenu's own dropdown instead, per
// explicit direction ("do away with the tabs and put the pages in the nav
// hamburger with reports etc."). See lib/ui/NavMenu.tsx and
// lib/ui/driver/navDestinations.ts for where that logic moved.
//
// Split out from layout.tsx (which is now a server component exporting its
// own `viewport.themeColor`) because Next's Metadata API requires viewport/
// metadata exports to live in a server component -- this client component
// holds all the actual interactive shell logic.

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NavMenu from "@/lib/ui/NavMenu";
import EquipmentModal from "./modals/EquipmentModal";
import ExpirationModal from "./modals/ExpirationModal";
import SettingsModal from "./modals/SettingsModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import RackSelectSheet from "./components/RackSelectSheet";
import TerminalOutageBanner from "./components/TerminalOutageBanner";
import { useActiveOutageBanner } from "./hooks/useTerminalOutageReports";
import { CalculatorShellProvider, useCalculatorShell } from "./CalculatorShellContext";
import { addDaysISO_, isPastISO_, formatMDYWithCountdown_ } from "./utils/dates";
import { normState } from "./utils/normalize";
import { themeFill, themeHeaderGradient, themeIconStroke } from "./theme";

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

  // Fetched once here (not inside TerminalOutageBanner itself), same as
  // before the tab bar was removed -- kept at Header's level since the
  // outage banner still needs to render across every route this shared
  // Header covers, not just the Planner page.
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const outageBanner = useActiveOutageBanner(terminalId, shell.effectiveUserId || null, shell.plannedProductIds);

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
      {/* Left/right safe-area padding, added alongside the existing top
          one -- per explicit follow-up with a real device screenshot
          showing black bars down both edges in landscape (a soft-nav-bar
          strip on one side, confirmed live). Without viewportFit:"cover"
          (layout.tsx) these env() calls are always 0 and this is a no-op;
          with it, the gradient BACKGROUND still paints the full physical
          width (padding never shrinks an element's own background), only
          the icon row's actual CONTENT gets pushed in from the unsafe
          edges. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 calc(env(safe-area-inset-right, 0px) + 16px) 0 calc(env(safe-area-inset-left, 0px) + 16px)",
      }}>
        <NavMenu darkMode={darkMode} />
        <div style={{ display: "flex", gap: 26, flexShrink: 0, alignItems: "center" }}>
          <BellIcon count={shell.expirations.expiredCount + shell.expirations.warningCount} onClick={() => shell.setExpModalOpen(true)} stroke={iconStroke} />
          <GearIcon onClick={onOpenSettings} stroke={iconStroke} />
        </div>
      </div>
      {/* Outage banner still renders right after the icon row either way
          -- when there's nothing to show it contributes zero height
          (see TerminalOutageBanner's own conditional return), so the
          header stays maximally thin; when there IS an active outage,
          this is what makes the header expand downward to show it, per
          explicit direction ("expand down when there's a terminal
          outage banner otherwise keep collapsed"). The tab bar that used
          to render below this (its own row in portrait, inline with the
          icon row in landscape) is gone entirely -- every destination it
          used to hold (Dispatch/Insights/Planner/Cards/Vault) now lives
          in NavMenu's own dropdown instead, per explicit direction ("do
          away with the tabs and put the pages in the nav hamburger with
          reports etc."). This also retires the just-fixed centerTab
          offsetLeft bug and the inline/compact variants along with it --
          no other caller, nothing left to keep working. */}
      <TerminalOutageBanner
        tickerMessage={outageBanner.tickerMessage}
        reports={outageBanner.reports}
        timeZone={outageBanner.timeZone}
        refresh={outageBanner.refresh}
      />
    </div>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const shell = useCalculatorShell();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div style={{ height: "100dvh", background: "#0b0b0b", color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      {/* Left/right padding adds the device's safe-area inset (real,
          non-zero now that layout.tsx declares viewportFit:"cover") ON TOP
          of the existing 12px, same reasoning as Header's own icon-row
          padding above -- background stays #0b0b0b all the way to the
          physical edge (this div's own width is never constrained, so it
          already reaches as far as the now-extended layout viewport does),
          only CONTENT gets pushed clear of the unsafe strip. Bottom keeps
          its own existing safe-area handling wherever it already existed
          (unaffected here) -- this fix is specifically the left/right
          "black bars" the user pointed at, not a bottom-inset change. */}
      <div
        className="pt-tabscroll"
        style={{
          flex: 1, overflowY: "auto", background: "#0b0b0b",
          padding: "0px calc(env(safe-area-inset-right, 0px) + 12px) 12px calc(env(safe-area-inset-left, 0px) + 12px)",
        }}
      >
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
        authUserId={shell.effectiveUserId}
        myRole={shell.role}
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
