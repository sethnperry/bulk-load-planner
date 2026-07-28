"use client";
// app/calculator/reports/page.tsx
//
// One consolidated hub for every report that used to be scattered across
// separate entry points (My Loads button on the Planner, Scale/Service/Wash
// history tucked inside the Equipment modal, the bell icon's Expiring Items,
// and the Cards tab's Terminals/Credentials sub-tabs). Reached from the
// hamburger nav rather than the Planner/Cards/Vault tab bar -- it's a
// destination, not a 4th peer tab.
//
// Deliberately reuses the existing report modals as-is (MyLoadsModal,
// ScaleHistoryModal, RecordHistoryModal, ExpirationModal) rather than
// rebuilding their data/UI here -- this page is just a front door that
// wires them up. Scale/Service/Wash History are scoped to whichever
// equipment combo is currently selected on the Planner (shared via
// CalculatorShellContext, so it's the same selection, not a second picker);
// Expiring Items reuses the ExpirationModal ShellChrome already mounts
// globally, so it doesn't even need a second instance here. Terminal Cards
// and Credentials already have full pages of their own (the Cards tab), so
// their tiles just navigate there.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useLoadHistory } from "../hooks/useLoadHistory";
import MyLoadsModal from "../modals/MyLoadsModal";
import ScaleHistoryModal from "../modals/ScaleHistoryModal";
import RecordHistoryModal from "../modals/RecordHistoryModal";
import TerminalCardsPickerModal from "../modals/TerminalCardsPickerModal";
import TerminalCardsReportModal from "../modals/TerminalCardsReportModal";
import CredentialsReportModal, { type LicenseData, type MedicalData, type TwicData } from "../modals/CredentialsReportModal";
import { toneFor, cardStateFor, EXP_COLOR } from "../cards/cardTheme";
import { daysUntilISO_ } from "../utils/dates";
import { buildTerminalCardsReportBody, type TerminalCardsScope, type TerminalStatusItem } from "./buildTerminalCardsReport";

type EquipRow = { truck_id?: string; trailer_id?: string; truck_name?: string; trailer_name?: string; active: boolean | null };

// ── Section label + tile ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function ReportTile({ title, sub, stat, statColor, onClick, disabled }: {
  title: string; sub: string; stat?: string; statColor?: string; onClick: () => void; disabled?: boolean;
}) {
  const [base, shade] = toneFor(title);
  return (
    <div
      role="button" tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 8,
        background: disabled ? "rgba(255,255,255,0.04)" : `radial-gradient(circle at 20% 15%, rgba(255,255,255,0.7), transparent 55%), linear-gradient(135deg, ${base} 0%, ${shade} 100%)`,
        border: disabled ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
        boxShadow: disabled ? "none" : "0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)",
        cursor: disabled ? "default" : "pointer", userSelect: "none" as const,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: disabled ? "rgba(255,255,255,0.4)" : "#161616" }}>{title}</div>
        <div style={{ fontSize: 12, color: disabled ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.5)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{sub}</div>
      </div>
      {stat && (
        <div style={{ fontSize: 13, fontWeight: 800, color: statColor ?? (disabled ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.55)"), textAlign: "right" as const, flexShrink: 0, whiteSpace: "nowrap" as const }}>
          {stat}
        </div>
      )}
      {!disabled && <span style={{ fontSize: 16, color: "rgba(0,0,0,0.25)", flexShrink: 0 }}>›</span>}
    </div>
  );
}

// ── Reports hub ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const shell = useCalculatorShell();
  const { effectiveUserId, authUserId, equipment, terminals, expirations } = shell;

  const loadHistory = useLoadHistory(authUserId);
  useEffect(() => { loadHistory.fetch(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<EquipRow[]>([]);
  const [trailers, setTrailers] = useState<EquipRow[]>([]);
  const [driverName, setDriverName] = useState("");
  const [license, setLicense] = useState<LicenseData>(null);
  const [medical, setMedical] = useState<MedicalData>(null);
  const [twic, setTwic] = useState<TwicData>(null);

  const credSummary = useMemo(() => {
    const dates = [license?.expiration_date, medical?.expiration_date, twic?.expiration_date].filter(Boolean) as string[];
    if (dates.length === 0) return { label: "Not on file", color: "rgba(0,0,0,0.4)" };
    const soonestDays = Math.min(...dates.map((d) => daysUntilISO_(d) ?? 99999));
    const soonestIso = dates[dates.map((d) => daysUntilISO_(d) ?? 99999).indexOf(soonestDays)];
    const state = cardStateFor(soonestIso);
    return { label: `${soonestDays}d to next exp.`, color: EXP_COLOR[state] };
  }, [license, medical, twic]);

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const { data: s } = await supabase.from("user_settings").select("active_company_id").eq("user_id", effectiveUserId).maybeSingle();
      const cid = (s?.active_company_id as string | null) ?? null;
      setCompanyId(cid);
      if (cid) {
        const [{ data: t }, { data: tr }] = await Promise.all([
          supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", cid).eq("active", true).order("truck_name"),
          supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", cid).eq("active", true).order("trailer_name"),
        ]);
        setTrucks((t ?? []) as EquipRow[]);
        setTrailers((tr ?? []) as EquipRow[]);
      }

      const [{ data: profile }, { data: lic }, { data: med }, { data: tw }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("driver_licenses").select("*").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("driver_medical_cards").select("*").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("driver_twic_cards").select("*").eq("user_id", effectiveUserId).maybeSingle(),
      ]);
      setDriverName((profile?.display_name as string | null) ?? "");
      setLicense((lic as LicenseData) ?? null);
      setMedical((med as MedicalData) ?? null);
      setTwic((tw as TwicData) ?? null);
    })();
  }, [effectiveUserId]);

  const [myLoadsOpen, setMyLoadsOpen] = useState(false);
  const [scaleHistoryOpen, setScaleHistoryOpen] = useState(false);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);
  const [washHistoryOpen, setWashHistoryOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [terminalReport, setTerminalReport] = useState<{ title: string; body: string } | null>(null);
  const [credentialsReportOpen, setCredentialsReportOpen] = useState(false);

  const combo = equipment.selectedCombo;
  const hasEquipment = !!combo;
  const equipmentSub = hasEquipment ? (equipment.equipmentLabel ?? "Selected equipment") : "Select equipment on the Planner first";

  const terminalsExpiringSoon = useMemo(() => {
    let count = 0;
    for (const t of terminals.terminals ?? []) {
      const tid = String((t as any).terminal_id);
      const iso = terminals.terminalDisplayInfo(t, tid);
      const state = cardStateFor(iso);
      if (state === "expiring" || state === "expired" || state === "inactive") count++;
    }
    return count;
  }, [terminals.terminals, terminals.terminalDisplayInfo]);

  const expiringCount = expirations.expiredCount + expirations.warningCount;

  const cityOptions = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of terminals.terminals ?? []) {
      const city = String((t as any).city ?? "Unknown");
      if (!map.has(city)) map.set(city, (t as any).state ?? null);
    }
    return Array.from(map.entries()).map(([city, state]) => ({ city, state })).sort((a, b) => a.city.localeCompare(b.city));
  }, [terminals.terminals]);

  const handlePickCity = (city: string, stateCode: string | null, scope: TerminalCardsScope) => {
    const starred: TerminalStatusItem[] = (terminals.terminals ?? [])
      .filter((t: any) => String(t.city ?? "Unknown") === city)
      .map((t: any) => {
        const tid = String(t.terminal_id);
        const expiresISO = terminals.terminalDisplayInfo(t, tid);
        return { tid, name: String(t.terminal_name ?? "Terminal"), state: cardStateFor(expiresISO), expiresISO };
      });
    const catalog = (terminals.terminalCatalog ?? [])
      .filter((c: any) => String(c.city ?? "Unknown") === city)
      .map((c: any) => ({ terminal_id: String(c.terminal_id), name: String(c.terminal_name ?? "Terminal") }));

    const body = buildTerminalCardsReportBody({ city, stateCode, scope, starred, catalog });
    setTerminalReport({ title: `Terminal Cards — ${city}${stateCode ? `, ${stateCode}` : ""}`, body });
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Reports</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Everything you can pull up, in one place.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        <div>
          <SectionLabel>Loads</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title="My Loads"
              sub="Completed and planned loads across all equipment"
              stat={loadHistory.loading ? undefined : `${loadHistory.rows.length}`}
              onClick={() => setMyLoadsOpen(true)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Equipment</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title="Scale History"
              sub={equipmentSub}
              onClick={() => setScaleHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Service History"
              sub={equipmentSub}
              onClick={() => setServiceHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Wash History"
              sub={equipmentSub}
              onClick={() => setWashHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Expiring Items"
              sub="Truck & trailer permits, terminal card renewals"
              stat={expiringCount > 0 ? `${expiringCount}` : "None"}
              statColor={expiringCount > 0 ? "#b91c1c" : undefined}
              onClick={() => shell.setExpModalOpen(true)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Compliance</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title="Terminal Cards"
              sub="Share who's carded where, by city"
              stat={terminalsExpiringSoon > 0 ? `${terminalsExpiringSoon} expiring` : "All current"}
              statColor={terminalsExpiringSoon > 0 ? "#b45309" : undefined}
              onClick={() => setCityPickerOpen(true)}
            />
            <ReportTile
              title="Credentials"
              sub="Printable report — driver's license, medical card, TWIC"
              stat={credSummary?.label}
              statColor={credSummary?.color}
              onClick={() => setCredentialsReportOpen(true)}
            />
          </div>
        </div>

      </div>

      <MyLoadsModal
        open={myLoadsOpen} onClose={() => setMyLoadsOpen(false)}
        authUserId={effectiveUserId}
        rows={loadHistory.rows}
        loading={loadHistory.loading}
        error={loadHistory.error}
        linesCache={loadHistory.linesCache}
        linesLoading={loadHistory.linesLoading}
        onFetchLines={loadHistory.fetchLines}
        onFetchRange={loadHistory.fetch}
        terminalCatalog={terminals.terminalCatalog ?? []}
        combos={equipment.combos ?? []}
        onDeleteLoad={loadHistory.deleteLoad}
      />

      {hasEquipment && companyId && (
        <>
          <ScaleHistoryModal
            open={scaleHistoryOpen} onClose={() => setScaleHistoryOpen(false)}
            companyId={companyId}
            comboId={combo!.combo_id}
            truckName={equipment.truckNameById[combo!.truck_id ?? ""]}
            trailerName={equipment.trailerNameById[combo!.trailer_id ?? ""]}
          />
          <RecordHistoryModal
            open={serviceHistoryOpen} onClose={() => setServiceHistoryOpen(false)}
            kind="service" title="Service History"
            companyId={companyId}
            truckId={combo!.truck_id ?? ""}
            trailerId={combo!.trailer_id ?? ""}
            trucks={trucks as any}
            trailers={trailers as any}
          />
          <RecordHistoryModal
            open={washHistoryOpen} onClose={() => setWashHistoryOpen(false)}
            kind="wash" title="Wash History"
            companyId={companyId}
            truckId={combo!.truck_id ?? ""}
            trailerId={combo!.trailer_id ?? ""}
            trucks={trucks as any}
            trailers={trailers as any}
          />
        </>
      )}

      <TerminalCardsPickerModal
        open={cityPickerOpen} onClose={() => setCityPickerOpen(false)}
        cities={cityOptions}
        onPick={handlePickCity}
      />
      <TerminalCardsReportModal
        open={!!terminalReport} onClose={() => setTerminalReport(null)}
        title={terminalReport?.title ?? ""} body={terminalReport?.body ?? ""}
      />
      <CredentialsReportModal
        open={credentialsReportOpen} onClose={() => setCredentialsReportOpen(false)}
        driverName={driverName} license={license} medical={medical} twic={twic}
      />
    </div>
  );
}
