"use client";
// app/calculator/dispatch/page.tsx
//
// Real Dispatch tab dashboard, replacing the old Dashboard/Tasks/Ledger
// placeholder shell (shelved along with the rest of the 2026-07-30
// role-tabs work -- see CLAUDE.md "Terminal Tier — Build Spec"). Reachable
// as the Dispatch/Admin roles' middle tab (CalculatorLayoutClient.tsx).
//
// Pick a driver (shared via shell.selectedDriverId so the Cards tab and
// Terminal tab agree on the same driver across tab switches), then see:
// identity/schedule, equipment + its expiring/expired permit items,
// terminal card status (grouped by city), badges, credentials, and a
// dispatcher-notes box. All expiration coloring throughout this page uses
// the one shared cardStateFor rule (expiring within 7 days = amber, expired
// = red, older/inactive = gray) so nothing on this page disagrees with
// itself about what "soon" means.
//
// 2026-08-07 rework (per explicit user direction): Terminal Cards grouped
// by city; added Badges and Credentials sections (same admin+dispatch RLS
// FleetCredentialsModal.tsx already relies on -- driver_licenses/
// driver_medical_cards/driver_twic_cards/driver_port_ids); Equipment moved
// above Terminal Cards and switched from "primary" equipment
// (user_primary_trucks/trailers) to whatever combo the driver has actually
// claimed right now (equipment_combos.claimed_by) -- "primary" is a
// separate, different concept (a fallback default, not "what they're in
// today") and reading it here would show stale/wrong equipment for a
// driver who slip-seated into something else. Equipment now also lists
// every expiring/expired permit item across the full permit set (not just
// truck registration) -- reads the same trucks/trailers columns
// EquipmentDetails.tsx's TruckModal/TrailerModal actually write today, not
// the newer equipment_permits table, which a live query confirmed tracks
// truck permits but was never verified for trailers/newly-added fields and
// carries its own documented "can silently go stale if the admin edit form
// bypasses it" risk (see supabase/migrations/20260723000000_permit_types_binder.sql's
// own header comment) -- the old columns are the one source guaranteed to
// match what admin/dispatch actually sees and edits in the Equipment modal.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { startSetupSession } from "@/lib/setupSession";
import { useCalculatorShell } from "../CalculatorShellContext";
import DriverPicker from "../components/DriverPicker";
import { cardStateFor } from "../cards/cardTheme";
import { addDaysISO_, formatMDYWithCountdown_ } from "../utils/dates";

const DARK_EXP_COLOR: Record<string, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches the mockup's day-icon row

type DriverIdentity = {
  display_name: string;
  division: string | null;
  region: string | null;
  local_area: string | null;
  employee_number: string | null;
};

type TerminalCardRow = {
  terminal_id: string;
  terminal_name: string;
  city: string | null;
  state: string | null;
  expiresISO: string | null;
  hasCard: boolean;
};

type PermitItem = { label: string; iso: string };

type EquipmentSummary = {
  truckName: string | null;
  truckMake: string | null;
  trailerName: string | null;
  trailerMake: string | null;
  permitItems: PermitItem[]; // pre-filtered to expiring/expired only, soonest first
};

type BadgeRow = { id: string; port_name: string; category: string | null; expiration_date: string | null };

type CredentialSummary = { licenseExp: string | null; medicalExp: string | null; twicExp: string | null };

// Mirrors the exact labels/columns EquipmentDetails.tsx's TruckModal/
// TrailerModal already use -- see that file's PermitEditRow/TankEditRow
// call sites. Not the dynamic permit_types system (see file header comment
// on why).
const TRUCK_PERMIT_FIELDS: { key: string; label: string }[] = [
  { key: "reg_expiration_date", label: "Registration" },
  { key: "inspection_expiration_date", label: "Annual Inspection" },
  { key: "ifta_expiration_date", label: "IFTA Permits + Decals" },
  { key: "phmsa_expiration_date", label: "PHMSA HazMat Permit" },
  { key: "alliance_expiration_date", label: "Alliance HazMat Permit" },
  { key: "fleet_ins_expiration_date", label: "Fleet Insurance Cab Card" },
  { key: "hazmat_lic_expiration_date", label: "HazMat Transportation Lic" },
  { key: "inner_bridge_expiration_date", label: "Inner Bridge Permit" },
];
const TRAILER_PERMIT_FIELDS: { key: string; label: string }[] = [
  { key: "trailer_reg_expiration_date", label: "Trailer Registration" },
  { key: "trailer_inspection_expiration_date", label: "Annual Inspection" },
  { key: "tank_v_expiration_date", label: "Tank V — External Visual" },
  { key: "tank_k_expiration_date", label: "Tank K — Leakage Test" },
  { key: "tank_l_expiration_date", label: "Tank L — Lining Inspection" },
  { key: "tank_t_expiration_date", label: "Tank T — Thickness Test" },
  { key: "tank_i_expiration_date", label: "Tank I — Internal Visual" },
  { key: "tank_p_expiration_date", label: "Tank P — Pressure Test" },
  { key: "tank_uc_expiration_date", label: "Tank UC — Upper Coupler" },
];

function collectExpiringPermits(row: Record<string, any> | null, fields: { key: string; label: string }[]): PermitItem[] {
  if (!row) return [];
  const out: PermitItem[] = [];
  for (const f of fields) {
    const iso = row[f.key] as string | null;
    if (!iso) continue;
    const state = cardStateFor(iso);
    if (state === "expiring" || state === "expired") out.push({ label: f.label, iso });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ExpirationLine({ label, iso }: { label: string; iso: string | null }) {
  const state = cardStateFor(iso);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#fff", fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
        {iso ? formatMDYWithCountdown_(iso) : "Not on file"}
      </span>
    </div>
  );
}

export default function DispatchPage() {
  const shell = useCalculatorShell();
  const { selectedDriverId, setSelectedDriverId, companyId, effectiveUserId, authUserId } = shell;
  const canUseAppAs = shell.role === "admin" || shell.isSuperAdmin;

  const [identity, setIdentity] = useState<DriverIdentity | null>(null);
  const [schedule, setSchedule] = useState<{ days: number[]; start: string; end: string }>({ days: [], start: "", end: "" });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [cards, setCards] = useState<TerminalCardRow[]>([]);
  const [cardSearch, setCardSearch] = useState("");
  const [equipment, setEquipment] = useState<EquipmentSummary>({ truckName: null, truckMake: null, trailerName: null, trailerMake: null, permitItems: [] });
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary>({ licenseExp: null, medicalExp: null, twicExp: null });
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDriverId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [
        { data: nameRows }, { data: schedRow }, { data: notesRow },
        { data: accessRows }, { data: cardRows },
        { data: claimedCombos },
        { data: badgeRows },
        { data: licRows }, { data: medRows }, { data: twicRows },
      ] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: [selectedDriverId] }),
        supabase.from("driver_schedules").select("days_of_week, shift_start_local, shift_end_local").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("dispatcher_notes").select("note").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("terminal_access").select("terminal_id, carded_on").eq("user_id", selectedDriverId),
        supabase.from("user_terminal_cards").select("terminal_id").eq("user_id", selectedDriverId),
        // Whatever combo the driver actually has claimed right now -- not
        // "primary" (a separate fallback-default concept, see file header).
        supabase.from("equipment_combos").select("truck_id, trailer_id, claimed_at").eq("claimed_by", selectedDriverId).neq("active", false).order("claimed_at", { ascending: false }).limit(1),
        supabase.from("driver_port_ids").select("id, port_name, category, expiration_date").eq("user_id", selectedDriverId).order("expiration_date", { ascending: true, nullsFirst: false }),
        supabase.from("driver_licenses").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_medical_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_twic_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
      ]);
      if (cancelled) return;

      const nameRow = (nameRows ?? [])[0] as any;
      setIdentity(nameRow ? {
        display_name: nameRow.display_name ?? "Unknown",
        division: nameRow.division ?? null,
        region: nameRow.region ?? null,
        local_area: nameRow.local_area ?? null,
        employee_number: nameRow.employee_number ?? null,
      } : null);

      setSchedule({
        days: (schedRow as any)?.days_of_week ?? [],
        start: (schedRow as any)?.shift_start_local?.slice(0, 5) ?? "",
        end: (schedRow as any)?.shift_end_local?.slice(0, 5) ?? "",
      });
      setNotes((notesRow as any)?.note ?? "");

      const cardIdSet = new Set(((cardRows ?? []) as any[]).map((r) => String(r.terminal_id)));
      const accessByTerminal = new Map<string, string>();
      for (const r of (accessRows ?? []) as any[]) accessByTerminal.set(String(r.terminal_id), r.carded_on);

      const terminalIds = Array.from(new Set([...accessByTerminal.keys(), ...cardIdSet]));
      let termRows: any[] = [];
      if (terminalIds.length > 0) {
        const { data } = await supabase.from("terminals").select("terminal_id, terminal_name, city, state, renewal_days").in("terminal_id", terminalIds);
        termRows = data ?? [];
      }
      const rows: TerminalCardRow[] = termRows.map((t) => {
        const tid = String(t.terminal_id);
        const cardedOn = accessByTerminal.get(tid) ?? null;
        const renewalDays = t.renewal_days ?? 90;
        return {
          terminal_id: tid,
          terminal_name: t.terminal_name,
          city: t.city, state: t.state,
          expiresISO: cardedOn ? addDaysISO_(cardedOn, renewalDays) : null,
          hasCard: cardIdSet.has(tid),
        };
      }).sort((a, b) => a.terminal_name.localeCompare(b.terminal_name));
      setCards(rows);

      const claimed = ((claimedCombos ?? [])[0] as any) ?? null;
      const truckId = claimed?.truck_id ?? null;
      const trailerId = claimed?.trailer_id ?? null;
      const [truckRes, trailerRes] = await Promise.all([
        truckId
          ? supabase.from("trucks").select(["truck_name", "make", ...TRUCK_PERMIT_FIELDS.map((f) => f.key)].join(", ")).eq("truck_id", truckId).maybeSingle()
          : Promise.resolve({ data: null }),
        trailerId
          ? supabase.from("trailers").select(["trailer_name", "make", ...TRAILER_PERMIT_FIELDS.map((f) => f.key)].join(", ")).eq("trailer_id", trailerId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const truckRow = (truckRes as any)?.data ?? null;
      const trailerRow = (trailerRes as any)?.data ?? null;
      const permitItems = [
        ...collectExpiringPermits(truckRow, TRUCK_PERMIT_FIELDS),
        ...collectExpiringPermits(trailerRow, TRAILER_PERMIT_FIELDS),
      ].sort((a, b) => a.iso.localeCompare(b.iso));
      setEquipment({
        truckName: truckRow?.truck_name ?? null,
        truckMake: truckRow?.make ?? null,
        trailerName: trailerRow?.trailer_name ?? null,
        trailerMake: trailerRow?.make ?? null,
        permitItems,
      });

      setBadges((badgeRows ?? []) as BadgeRow[]);
      setCredentials({
        licenseExp: (licRows as any)?.expiration_date ?? null,
        medicalExp: (medRows as any)?.expiration_date ?? null,
        twicExp: (twicRows as any)?.expiration_date ?? null,
      });

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDriverId]);

  async function saveSchedule(next: { days: number[]; start: string; end: string }) {
    setSchedule(next);
    setScheduleSaving(true);
    await supabase.from("driver_schedules").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      days_of_week: next.days,
      shift_start_local: next.start || null,
      shift_end_local: next.end || null,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setScheduleSaving(false);
  }

  function toggleDay(d: number) {
    const days = schedule.days.includes(d) ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort();
    saveSchedule({ ...schedule, days });
  }

  async function saveNotes() {
    setNotesSaving(true);
    await supabase.from("dispatcher_notes").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      note: notes,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setNotesSaving(false);
  }

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => `${c.terminal_name} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  // Group by city -- "No City" bucket sorts last so real cities always lead.
  const cardsByCity = useMemo(() => {
    const groups = new Map<string, TerminalCardRow[]>();
    for (const c of filteredCards) {
      const city = c.city?.trim() || "No City";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(c);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "No City") return 1;
      if (b === "No City") return -1;
      return a.localeCompare(b);
    });
  }, [filteredCards]);

  if (!selectedDriverId) {
    return (
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Select a driver to view.</div>
        <DriverPicker companyId={companyId} onPick={(id) => setSelectedDriverId(id)} />
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setSelectedDriverId("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          ‹ Change Driver
        </button>
      </div>

      {/* "Back strip" -- admin/super-admin only (dispatchers never get in a
          truck). Starts a real full-app setup session (same mechanism as
          /admin's "Set up planner for X"), not just this tab's own
          contextual card/notes view -- lets the admin use the whole app
          (Planner, Terminal, everything) as this driver. returnTo points
          back here so "← Return to Dispatch" lands where they actually
          started, not /admin. */}
      {canUseAppAs && !loading && identity && (
        <button
          type="button"
          onClick={() => {
            startSetupSession({
              targetUserId: selectedDriverId,
              targetDisplayName: identity.display_name,
              adminUserId: authUserId,
              returnTo: "/calculator/dispatch",
            });
            // Hard navigation, not router.push -- the admin is already
            // inside the /calculator layout, so CalculatorShellProvider is
            // already mounted and only ever reads sessionStorage once on
            // mount. A client-side push wouldn't remount it, so the new
            // setup session would silently never take effect (confirmed
            // live: content stayed the admin's own equipment/terminal data
            // after a router.push here). Matches JoinFleetView.tsx's own
            // same-class fix for the identical problem.
            window.location.href = "/calculator";
          }}
          style={{
            width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 10, marginBottom: 14,
            border: "1px solid rgba(251,146,60,0.35)", background: "rgba(251,146,60,0.10)",
            color: "#fb923c", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}
        >
          Use app as {identity.display_name} →
        </button>
      )}

      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && identity && (
        <>
          <SectionCard title="Driver">
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{identity.display_name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              {identity.division ? `Store ${identity.division}` : "—"}
              {identity.local_area ? ` – ${identity.local_area}` : ""}
              {identity.region ? `, ${identity.region}` : ""}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
              {DAY_LABELS.map((label, i) => {
                const active = schedule.days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    disabled={scheduleSaving}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", fontSize: 11, fontWeight: 800, cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: active ? "#fff" : "rgba(255,255,255,0.05)",
                      color: active ? "#111" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <input
                type="time" value={schedule.start}
                onChange={(e) => saveSchedule({ ...schedule, start: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
              <span style={{ color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>–</span>
              <input
                type="time" value={schedule.end}
                onChange={(e) => saveSchedule({ ...schedule, end: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
            </div>
          </SectionCard>

          <SectionCard title="Equipment">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Truck{equipment.truckName ? ` · ${equipment.truckName}` : ""}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.truckMake ?? ""}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Trailer{equipment.trailerName ? ` · ${equipment.trailerName}` : ""}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.trailerMake ?? ""}</span>
            </div>
            {!equipment.truckName && !equipment.trailerName && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No equipment currently selected.</div>
            )}
            {(equipment.truckName || equipment.trailerName) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 6 }}>
                {equipment.permitItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Nothing expiring soon.</div>
                ) : (
                  equipment.permitItems.map((p) => <ExpirationLine key={p.label} label={p.label} iso={p.iso} />)
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Terminal Cards">
            <input
              type="text" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)}
              placeholder="All Terminals — search…"
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, marginBottom: 10 }}
            />
            {cardsByCity.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No terminal cards on file.</div>}
            <div style={{ display: "grid", gap: 14 }}>
              {cardsByCity.map(([city, cityCards]) => (
                <div key={city}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>
                    {city}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {cityCards.map((c) => (
                      <ExpirationLine
                        key={c.terminal_id}
                        label={c.terminal_name}
                        iso={c.expiresISO}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Badges">
            {badges.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No badges on file.</div>}
            <div style={{ display: "grid", gap: 6 }}>
              {badges.map((b) => (
                <ExpirationLine
                  key={b.id}
                  label={b.category ? `${b.port_name} (${b.category})` : b.port_name}
                  iso={b.expiration_date}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Credentials">
            <div style={{ display: "grid", gap: 6 }}>
              <ExpirationLine label="License" iso={credentials.licenseExp} />
              <ExpirationLine label="Medical" iso={credentials.medicalExp} />
              <ExpirationLine label="TWIC" iso={credentials.twicExp} />
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
              placeholder="Internal notes for dispatch/lead/admin — not visible to the driver…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, resize: "vertical" as const }}
            />
            {notesSaving && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Saving…</div>}
          </SectionCard>
        </>
      )}
    </div>
  );
}
