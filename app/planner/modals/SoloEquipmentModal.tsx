"use client";
// modals/SoloEquipmentModal.tsx
//
// Solo-tier main Equipment modal -- equipment-settings-spec.md §1.
// Purely "pick from MY equipment": two-column truck/trailer grid, a
// connector line between the selected pair, a non-scrolling report section
// (tare/target/service-due/washed-on), and a Scale/Service/Wash/Binder
// action row. No fleet browsing, no region filters, no claim/couple-from-
// fleet UI -- this is the entire modal for solo companies.
//
// Bridges to existing/stub components in this pass, per spec's own screen-
// by-screen sequencing (their dedicated redesign passes are still pending):
//  - Scale button -> ScaleTicketModal (§6, done: renamed, no Save/Decouple
//    buttons, autosaves).
//  - Service / Wash buttons -> minimal functional modals against the new
//    service_records/wash_records tables (full field set is §2/§3's own
//    pass -- this pass only needs them working end-to-end for the report
//    section to have real data to read).
//  - Binder button -> simple stub for this pass; reusing the existing
//    EquipmentDetailsModal isn't clean since it's unexported and tightly
//    coupled to fleet claim state -- §7 is its own pass.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { SetupSession } from "@/lib/setupSession";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import ScaleTicketModal from "./ScaleTicketModal";
import ScaleHistoryModal from "./ScaleHistoryModal";
import RecordHistoryModal from "./RecordHistoryModal";
import BinderModal from "./BinderModal";
import { TruckModal as AdminTruckModal, TrailerModal as AdminTrailerModal } from "@/lib/ui/driver/EquipmentDetails";
import { type ServiceType, ServiceTypeSelect, ServiceTypeEditorModal, SimpleServiceModal } from "./ServiceTypeManager";

// ─── Types ────────────────────────────────────────────────────────────────────

type TruckRow = { truck_id: string; truck_name: string; active: boolean | null };
type TrailerRow = { trailer_id: string; trailer_name: string; active: boolean | null };
type ComboRow = {
  combo_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  target_weight: number | null;
  active: boolean | null;
};
type UnitServiceDue = {
  unitLabel: "Truck" | "Trailer";
  typeName: string | null; // null only when the unit has no service records at all
  display: string;         // "Due at 295,300 mi" / "Due 07/30/2026" / "Last serviced 07/18/2026" / "No service recorded"
};
type UnitWash = {
  unitLabel: "Truck" | "Trailer" | "Both";
  display: string; // formatted date
};

type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  companyId: string;
  selectedComboId: string;
  onSelectComboId: (id: string) => void;
  onRefreshCombos: () => void;
  // Full-app admin impersonation ("Use app as {driver}", 2026-08-04) --
  // when set, couple_combo must claim equipment for setupSession.targetUserId
  // via the service-role /api/admin/setup proxy, not the real admin's own
  // browser session (which has no way to act as anyone but auth.uid()).
  setupSession?: SetupSession | null;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

// Report-line readouts (due dates, wash dates) keep meaningful color -- an
// at-a-glance status signal. The action buttons and selection chrome below
// are just navigation/category chrome, not status -- monochrome, per theme.
const COLOR_TARE = "rgba(255,255,255,0.86)";
const COLOR_SERVICE = "#fbbf24";
const COLOR_WASH = "#67e8f9";

const S = {
  sectionHeader: {
    fontSize: 13, fontWeight: 800 as const, color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 10,
    textAlign: "center" as const,
  },
  card: {
    borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)", padding: "14px 10px",
    textAlign: "center" as const, cursor: "pointer", userSelect: "none" as const,
    fontWeight: 900, fontSize: 17, color: "rgba(255,255,255,0.85)",
  } as React.CSSProperties,
  cardSelected: {
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.45)",
    color: "#fff",
  } as React.CSSProperties,
  plusCard: {
    borderRadius: 6, border: "1px dashed rgba(255,255,255,0.18)",
    background: "transparent", padding: "14px 10px", textAlign: "center" as const,
    cursor: "pointer", fontWeight: 900, fontSize: 20, color: "rgba(255,255,255,0.35)",
  } as React.CSSProperties,
  divider: { height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0" },
  reportLine: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
  } as React.CSSProperties,
  reportLabel: { fontSize: 13, fontWeight: 700 as const, color: "rgba(255,255,255,0.45)" },
  actionBtn: (): React.CSSProperties => ({
    flex: 1, borderRadius: 6, padding: "12px 8px", textAlign: "center" as const,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 900, fontSize: 13, letterSpacing: 0.3, cursor: "pointer",
  }),
};

// ─── Connector line ───────────────────────────────────────────────────────────
// Draws a line + arrowhead from the selected truck card to the selected
// trailer card, tracking position on scroll/resize. Purely visual.

function ComboConnector({
  containerRef, fromRef, toRef, active,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!active || !container || !from || !to) {
      setLine((prev) => (prev === null ? prev : null));
      return;
    }

    const cRect = container.getBoundingClientRect();
    const fRect = from.getBoundingClientRect();
    const tRect = to.getBoundingClientRect();

    const next = {
      x1: fRect.right - cRect.left + container.scrollLeft,
      y1: fRect.top + fRect.height / 2 - cRect.top + container.scrollTop,
      x2: tRect.left - cRect.left + container.scrollLeft,
      y2: tRect.top + tRect.height / 2 - cRect.top + container.scrollTop,
    };
    // Redrawing the SVG can itself nudge the container's measured size by a
    // sub-pixel amount, which would re-trigger the ResizeObserver below and
    // loop forever. Only update state when the coordinates actually moved.
    setLine((prev) =>
      prev && prev.x1 === next.x1 && prev.y1 === next.y1 && prev.x2 === next.x2 && prev.y2 === next.y2
        ? prev
        : next
    );
  }, [active, containerRef, fromRef, toRef]);

  useEffect(() => {
    recompute();
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    container.addEventListener("scroll", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [recompute, containerRef]);

  if (!line) return null;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
    >
      <line
        x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
        stroke="rgba(255,255,255,0.55)" strokeWidth={2}
      />
    </svg>
  );
}

// ─── Long-press handlers ──────────────────────────────────────────────────────
// Plain factory (not a hook) -- built fresh per rendered card inside a .map(),
// so it must not call useRef/useCallback/etc. (variable-length lists would
// violate the Rules of Hooks). State lives in a closure instead; that's fine
// here since it's stateless timer plumbing, not anything that needs to
// survive re-renders with referential stability.

function createLongPress(onLongPress: () => void, ms = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  const start = () => {
    fired = false;
    timer = setTimeout(() => { fired = true; onLongPress(); }, ms);
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
  };

  return {
    onMouseDown: start, onMouseUp: clear, onMouseLeave: clear,
    onTouchStart: start, onTouchEnd: clear, onTouchMove: clear,
    didFire: () => fired,
  };
}

// CustomSelect itself now lives in lib/ui/CustomSelect.tsx (shared with
// RecordHistoryModal.tsx's record-edit form -- importing it locally per-file
// is how the native-<select> popup styling bug crept back in once already).

// ServiceTypeEditorModal/ServiceTypeSelect moved to ServiceTypeManager.tsx
// 2026-08-07 so the fleet-tier equipment modal can share them too.

// ─── Service/Wash due computation ────────────────────────────────────────────
// Per-unit, not merged across truck+trailer: the report shows one line per
// present unit. Within a unit, "what's next" is the type whose OWN next-due
// threshold is soonest -- not whichever type happened to be logged most
// recently (2026-08-07: that was the original behavior and could surface a
// type that's actually due far in the future just because it was the last
// thing entered, while a type due imminently sat unreported one row down in
// the full Service History).

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

type ServiceRecordLite = { service_type_id: string; date: string; reading_value: number | null; created_at: string };

function computeUnitServiceDue(
  unitLabel: "Truck" | "Trailer",
  records: ServiceRecordLite[],
  types: ServiceType[],
): UnitServiceDue {
  // A record whose type doesn't apply to this unit only exists here because
  // it tagged along on a "Both" service with the other unit (see
  // SimpleServiceModal.save()) -- it's not a real service requirement for
  // *this* unit, so it can't be "what's next due" here. That companion
  // context still shows in the full Service History; this compact report
  // line should never surface a "(with Truck)"-style entry.
  const applicable = records.filter((r) => {
    const type = types.find((t) => t.service_type_id === r.service_type_id);
    return !type || type.applies_to === "both" || type.applies_to === unitLabel.toLowerCase();
  });
  if (!applicable.length) return { unitLabel, typeName: null, display: "No service recorded" };

  // Only the most recently logged record OF EACH TYPE determines that
  // type's own current due state -- `date` is a date-only column, so two
  // same-day records for the same type/unit tie on it; created_at breaks
  // the tie.
  const latestByType = new Map<string, ServiceRecordLite>();
  for (const r of applicable) {
    const prev = latestByType.get(r.service_type_id);
    if (!prev || r.date > prev.date || (r.date === prev.date && r.created_at > prev.created_at)) {
      latestByType.set(r.service_type_id, r);
    }
  }

  type Candidate = { record: ServiceRecordLite; type: ServiceType | null; sortKey: number };
  const durationCandidates: Candidate[] = [];
  const milesCandidates: Candidate[] = [];
  const hoursCandidates: Candidate[] = [];
  // "No computable due" bucket -- interval_kind "none", or a miles/hours
  // type whose latest record predates the reading field being required.
  const fallbackCandidates: Candidate[] = [];

  for (const record of latestByType.values()) {
    const type = types.find((t) => t.service_type_id === record.service_type_id) ?? null;
    if (!type || type.interval_kind === "none" || type.interval_value == null) {
      fallbackCandidates.push({ record, type, sortKey: 0 });
      continue;
    }
    if (type.interval_kind === "duration") {
      const due = new Date(record.date);
      due.setDate(due.getDate() + type.interval_value);
      durationCandidates.push({ record, type, sortKey: due.getTime() });
      continue;
    }
    if (record.reading_value == null) {
      fallbackCandidates.push({ record, type, sortKey: 0 });
      continue;
    }
    const nextReading = record.reading_value + type.interval_value;
    (type.interval_kind === "miles" ? milesCandidates : hoursCandidates).push({ record, type, sortKey: nextReading });
  }

  // A due DATE and a due ODOMETER/HOURS READING aren't the same unit of
  // "soon" -- only rankable within their own kind (comparing raw due
  // readings across records for the SAME unit is still valid even without
  // live telemetry, since it's the same monotonically increasing odometer/
  // hour meter counting up toward each threshold). When both a duration-due
  // and a mileage/hours-due type exist, duration wins -- a concrete
  // calendar deadline is the more universally actionable of the two.
  const soonest = (list: Candidate[]) => list.reduce((a, b) => (b.sortKey < a.sortKey ? b : a));
  const winner =
    durationCandidates.length ? soonest(durationCandidates) :
    milesCandidates.length ? soonest(milesCandidates) :
    hoursCandidates.length ? soonest(hoursCandidates) :
    // Nothing computably "due" for any type -- fall back to whichever was
    // logged most recently, same as this function's original behavior.
    fallbackCandidates.reduce((a, b) =>
      b.record.date !== a.record.date ? (b.record.date > a.record.date ? b : a)
        : (b.record.created_at > a.record.created_at ? b : a)
    );

  const { record: latest, type } = winner;
  const typeName = type?.name ?? "Service";

  if (!type || type.interval_kind === "none" || type.interval_value == null) {
    return { unitLabel, typeName, display: `Last serviced ${fmtDate(latest.date)}` };
  }

  if (type.interval_kind === "duration") {
    const due = new Date(latest.date);
    due.setDate(due.getDate() + type.interval_value);
    return { unitLabel, typeName, display: `Due ${fmtDate(due.toISOString())}` };
  }

  // miles / hours -- needs the reading recorded at the last service to
  // compute a next-due threshold. Older records saved before the reading
  // field was required may not have one.
  if (latest.reading_value == null) {
    return { unitLabel, typeName, display: `Last serviced ${fmtDate(latest.date)} (reading not recorded)` };
  }
  const unitWord = type.interval_kind === "miles" ? "mi" : "hrs";
  const nextReading = latest.reading_value + type.interval_value;
  return { unitLabel, typeName, display: `Due at ${nextReading.toLocaleString()} ${unitWord}` };
}

function computeWashLines(truckWashedAt: string | null, trailerWashedAt: string | null): UnitWash[] {
  const sameDay = !!truckWashedAt && !!trailerWashedAt && truckWashedAt.slice(0, 10) === trailerWashedAt.slice(0, 10);
  if (sameDay) return [{ unitLabel: "Both", display: fmtDate(truckWashedAt!) }];

  const lines: UnitWash[] = [];
  if (truckWashedAt) lines.push({ unitLabel: "Truck", display: fmtDate(truckWashedAt) });
  if (trailerWashedAt) lines.push({ unitLabel: "Trailer", display: fmtDate(trailerWashedAt) });
  return lines;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SoloEquipmentModal({
  open, onClose, authUserId, companyId, selectedComboId, onSelectComboId, onRefreshCombos,
  setupSession,
}: Props) {
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [combos, setCombos] = useState<ComboRow[]>([]);
  // Starts true (not false): the init/resolve effects below both guard on
  // `loading` to avoid acting on an empty pre-fetch `combos` array. If this
  // started false, there'd be a one-tick window on mount where combos is []
  // but loading hasn't flipped true yet, and the resolve-combo effect would
  // read that as "nothing selected" and clear the parent's selection.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceLines, setServiceLines] = useState<UnitServiceDue[]>([]);
  const [washLines, setWashLines] = useState<UnitWash[]>([]);

  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleHistoryOpen, setScaleHistoryOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [washOpen, setWashOpen] = useState(false);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);
  const [washHistoryOpen, setWashHistoryOpen] = useState(false);
  const [binderOpen, setBinderOpen] = useState(false);
  const [addTruckOpen, setAddTruckOpen] = useState(false);
  const [addTrailerOpen, setAddTrailerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<
    { kind: "truck" | "trailer"; id: string; name: string } | null
  >(null);
  const [newTareTarget, setNewTareTarget] = useState<{ truckId: string; trailerId: string } | null>(null);
  const [newTareInput, setNewTareInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const truckCardRef = useRef<HTMLDivElement>(null);
  const trailerCardRef = useRef<HTMLDivElement>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: t, error: tErr }, { data: tr, error: trErr }, { data: c, error: cErr }] = await Promise.all([
      supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", companyId).eq("active", true).order("truck_name"),
      supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", companyId).eq("active", true).order("trailer_name"),
      supabase.from("equipment_combos").select("combo_id, truck_id, trailer_id, tare_lbs, target_weight, active").eq("company_id", companyId).eq("active", true),
    ]);
    if (tErr || trErr || cErr) {
      setError(tErr?.message ?? trErr?.message ?? cErr?.message ?? "Failed to load equipment.");
    }
    setTrucks((t ?? []) as TruckRow[]);
    setTrailers((tr ?? []) as TrailerRow[]);
    setCombos((c ?? []) as ComboRow[]);
    setLoading(false);
  }, [companyId]);

  const loadServiceTypes = useCallback(async () => {
    const { data } = await supabase
      .from("service_types")
      .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
      .eq("company_id", companyId)
      .order("name");
    const fresh = (data ?? []) as ServiceType[];
    setServiceTypes(fresh);
    return fresh;
  }, [companyId]);

  // Fetches service_types fresh on every call rather than reading the
  // `serviceTypes` state var. A caller that just created a new type (Service
  // modal's "+ New type" flow) calls onTypesChanged() then onSaved() back to
  // back -- onTypesChanged's setServiceTypes() hasn't committed by the time
  // onSaved's closure (captured at the last render) runs, so reading state
  // here would silently show "No service recorded" right after a successful
  // save. A fresh, uncached fetch sidesteps the staleness entirely.
  const loadServiceAndWash = useCallback(async (truckId: string | null, trailerId: string | null) => {
    if (!truckId && !trailerId) { setServiceLines([]); setWashLines([]); return; }

    const { data: typesData } = await supabase
      .from("service_types").select("service_type_id, name, interval_kind, interval_value, applies_to, is_active").eq("company_id", companyId);
    const types = (typesData ?? []) as ServiceType[];

    const serviceResults: UnitServiceDue[] = [];
    let truckWashedAt: string | null = null;
    let trailerWashedAt: string | null = null;

    if (truckId) {
      const [{ data: records }, { data: washes }] = await Promise.all([
        supabase.from("service_records").select("service_type_id, date, reading_value, created_at").eq("truck_id", truckId),
        supabase.from("wash_records").select("washed_at").eq("truck_id", truckId).order("washed_at", { ascending: false }).limit(1),
      ]);
      serviceResults.push(computeUnitServiceDue("Truck", (records ?? []) as any, types));
      truckWashedAt = (washes ?? [])[0]?.washed_at ?? null;
    }
    if (trailerId) {
      const [{ data: records }, { data: washes }] = await Promise.all([
        supabase.from("service_records").select("service_type_id, date, reading_value, created_at").eq("trailer_id", trailerId),
        supabase.from("wash_records").select("washed_at").eq("trailer_id", trailerId).order("washed_at", { ascending: false }).limit(1),
      ]);
      serviceResults.push(computeUnitServiceDue("Trailer", (records ?? []) as any, types));
      trailerWashedAt = (washes ?? [])[0]?.washed_at ?? null;
    }

    setServiceLines(serviceResults);
    setWashLines(computeWashLines(truckWashedAt, trailerWashedAt));
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    loadEquipment();
    loadServiceTypes();
  }, [open, loadEquipment, loadServiceTypes]);

  // Initialize local truck/trailer selection from the current combo.
  useEffect(() => {
    if (!open || loading) return;
    const current = combos.find((c) => String(c.combo_id) === String(selectedComboId));
    setSelectedTruckId(current?.truck_id ?? null);
    setSelectedTrailerId(current?.trailer_id ?? null);
  }, [open, loading, selectedComboId, combos]);

  useEffect(() => {
    if (!open) return;
    void loadServiceAndWash(selectedTruckId, selectedTrailerId);
  }, [open, selectedTruckId, selectedTrailerId, loadServiceAndWash]);

  // ── Actions ──────────────────────────────────────────────────────────────
  //
  // Resolving/creating the combo for a (truck, trailer) pair happens
  // imperatively, called directly from the tap handlers below -- NOT as a
  // reactive effect watching selectedTruckId/selectedTrailerId. An earlier
  // version did that reactively and it fed back into itself: resolving a
  // pair calls onSelectComboId -> parent re-renders with a new
  // selectedComboId -> the "sync local selection from external state" effect
  // above reacts to that -> which could re-trigger the resolve effect ->
  // React's "Maximum update depth exceeded" loop. Doing this in direct
  // response to the user's tap (a one-shot event, never re-invoked by a
  // render) removes the cycle entirely.

  async function resolvePair(truckId: string | null, trailerId: string | null, tareLbs?: number) {
    if (!truckId || !trailerId) {
      if (selectedComboId) onSelectComboId("");
      return;
    }

    const existing = combos.find(
      (c) => String(c.truck_id) === String(truckId) && String(c.trailer_id) === String(trailerId)
    );
    if (existing) {
      if (String(existing.combo_id) !== String(selectedComboId)) onSelectComboId(String(existing.combo_id));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let comboId: string;
      if (setupSession) {
        // Full-app impersonation -- must couple on the TARGET driver's
        // behalf via the service-role proxy, not this browser's own
        // session (which only has RLS/RPC standing to act as auth.uid(),
        // the real admin). Confirmed live: without this branch, the combo
        // got claimed under the admin's own account, and
        // useEquipment.ts's setup-mode selectedComboId derivation (only
        // shows combos claimed_by the target user) silently reverted the
        // selection back to empty right after.
        const { coupleCombo } = await import("@/lib/adminSetupClient");
        try {
          const res = await coupleCombo(setupSession.targetUserId, truckId, trailerId, {
            tareLbs, force: true,
          });
          comboId = String(res?.data?.combo_id ?? "");
        } catch (e: any) {
          if (!tareLbs && /provide a tare weight/i.test(e?.message ?? "")) {
            setNewTareTarget({ truckId, trailerId });
            return;
          }
          throw e;
        }
      } else {
        const { data, error: rpcErr } = await supabase.rpc("couple_combo", {
          p_truck_id: truckId,
          p_trailer_id: trailerId,
          p_tare_lbs: tareLbs ?? null,
          // Lets re-selecting equipment here decouple+recouple in one step,
          // instead of rejecting with "already coupled" -- this screen's whole
          // point is trivial swapping. Fleet's Browse-Fleet-and-Couple flow
          // still defaults to p_force=false (unaffected).
          p_force: true,
        });
        if (rpcErr) {
          // No prior history for this exact pair -- needs a one-time tare
          // weight, same as fleet's "New Pairing" step. Prompt for it instead
          // of just surfacing the raw error.
          if (!tareLbs && /provide a tare weight/i.test(rpcErr.message ?? "")) {
            setNewTareTarget({ truckId, trailerId });
            return;
          }
          throw rpcErr;
        }
        comboId = String((data as any)?.combo_id ?? "");
      }
      if (!comboId) throw new Error("No combo_id returned.");
      onSelectComboId(comboId);
      await Promise.all([loadEquipment(), onRefreshCombos()]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to pair equipment.");
    } finally {
      setBusy(false);
    }
  }

  function toggleTruck(id: string) {
    const next = selectedTruckId === id ? null : id;
    setSelectedTruckId(next);
    void resolvePair(next, selectedTrailerId);
  }
  function toggleTrailer(id: string) {
    const next = selectedTrailerId === id ? null : id;
    setSelectedTrailerId(next);
    void resolvePair(selectedTruckId, next);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (removeTarget.kind === "truck") {
        const { error: rpcErr } = await supabase.rpc("delete_truck", { p_truck_id: removeTarget.id, p_company_id: companyId });
        if (rpcErr) throw rpcErr;
        if (selectedTruckId === removeTarget.id) setSelectedTruckId(null);
      } else {
        const { error: rpcErr } = await supabase.rpc("delete_trailer", { p_trailer_id: removeTarget.id, p_company_id: companyId });
        if (rpcErr) throw rpcErr;
        if (selectedTrailerId === removeTarget.id) setSelectedTrailerId(null);
      }
      setRemoveTarget(null);
      await Promise.all([loadEquipment(), onRefreshCombos()]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove equipment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewTare() {
    if (!newTareTarget) return;
    const tare = Number(newTareInput);
    if (!Number.isFinite(tare) || tare <= 0) {
      setError("Enter a valid tare weight (lbs).");
      return;
    }
    const { truckId, trailerId } = newTareTarget;
    setNewTareTarget(null);
    setNewTareInput("");
    await resolvePair(truckId, trailerId, tare);
  }

  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  const truckLongPress = (t: TruckRow) => createLongPress(() => setRemoveTarget({ kind: "truck", id: t.truck_id, name: t.truck_name }));
  const trailerLongPress = (t: TrailerRow) => createLongPress(() => setRemoveTarget({ kind: "trailer", id: t.trailer_id, name: t.trailer_name }));

  return (
    <>
      <FullscreenModal open={open} onClose={onClose} title="Equipment" footer={null}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

          {error && (
            <div style={{ borderRadius: 6, padding: 12, marginBottom: 10, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)", color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}

          {/* ── Scrollable truck/trailer grid ── */}
          <div ref={scrollRef} style={{ position: "relative", flex: 1, overflowY: "auto", minHeight: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={S.sectionHeader}>Trucks</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {trucks.map((t) => {
                    const selected = t.truck_id === selectedTruckId;
                    const { didFire, ...lpHandlers } = truckLongPress(t);
                    return (
                      <div
                        key={t.truck_id}
                        ref={selected ? truckCardRef : undefined}
                        style={{ ...S.card, ...(selected ? S.cardSelected : {}) }}
                        onClick={() => { if (!didFire()) toggleTruck(t.truck_id); }}
                        {...lpHandlers}
                      >
                        {t.truck_name}
                      </div>
                    );
                  })}
                  <div style={S.plusCard} onClick={() => setAddTruckOpen(true)}>+</div>
                </div>
              </div>

              <div>
                <div style={S.sectionHeader}>Trailers</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {trailers.map((t) => {
                    const selected = t.trailer_id === selectedTrailerId;
                    const { didFire, ...lpHandlers } = trailerLongPress(t);
                    return (
                      <div
                        key={t.trailer_id}
                        ref={selected ? trailerCardRef : undefined}
                        style={{ ...S.card, ...(selected ? S.cardSelected : {}) }}
                        onClick={() => { if (!didFire()) toggleTrailer(t.trailer_id); }}
                        {...lpHandlers}
                      >
                        {t.trailer_name}
                      </div>
                    );
                  })}
                  <div style={S.plusCard} onClick={() => setAddTrailerOpen(true)}>+</div>
                </div>
              </div>
            </div>

            <ComboConnector
              containerRef={scrollRef}
              fromRef={truckCardRef}
              toRef={trailerCardRef}
              active={!!(selectedTruckId && selectedTrailerId)}
            />
          </div>

          <div style={S.divider} />

          {/* ── Report section (non-scrolling) ── */}
          <div style={{ flexShrink: 0 }}>
            {selectedCombo && Number(selectedCombo.tare_lbs ?? 0) > 0 && (
              <div style={S.reportLine} onClick={() => setScaleHistoryOpen(true)}>
                <span style={S.reportLabel}>Tare weight</span>
                <span style={{ fontWeight: 900, color: COLOR_TARE }}>{Number(selectedCombo.tare_lbs).toLocaleString()} lbs</span>
              </div>
            )}
            {selectedCombo && Number(selectedCombo.target_weight ?? 0) > 0 && (
              <div style={S.reportLine} onClick={() => setScaleHistoryOpen(true)}>
                <span style={S.reportLabel}>Target gross weight</span>
                <span style={{ fontWeight: 900, color: COLOR_TARE }}>{Number(selectedCombo.target_weight).toLocaleString()} lbs</span>
              </div>
            )}
            {serviceLines.length > 0 ? (
              <div style={S.reportLine} onClick={() => setServiceHistoryOpen(true)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {serviceLines.map((s) => (
                    <div key={s.unitLabel} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={S.reportLabel}>{s.unitLabel}{s.typeName ? ` · ${s.typeName}` : ""}</span>
                      <span style={{ fontWeight: 900, color: COLOR_SERVICE, fontSize: 13 }}>{s.display}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={S.reportLine} onClick={() => setServiceHistoryOpen(true)}>
                <span style={S.reportLabel}>Service</span>
                <span style={{ fontWeight: 900, color: COLOR_SERVICE }}>No service recorded</span>
              </div>
            )}
            {washLines.length > 0 ? (
              <div style={S.reportLine} onClick={() => setWashHistoryOpen(true)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {washLines.map((w) => (
                    <div key={w.unitLabel} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={S.reportLabel}>{w.unitLabel === "Both" ? "Washed" : `${w.unitLabel} washed`}</span>
                      <span style={{ fontWeight: 900, color: COLOR_WASH, fontSize: 13 }}>{w.display}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={S.reportLine} onClick={() => setWashHistoryOpen(true)}>
                <span style={S.reportLabel}>Washed on</span>
                <span style={{ fontWeight: 900, color: COLOR_WASH }}>No wash recorded</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <div style={S.actionBtn()} onClick={() => setScaleOpen(true)}>Scale</div>
              <div style={S.actionBtn()} onClick={() => setServiceOpen(true)}>Service</div>
              <div style={S.actionBtn()} onClick={() => setWashOpen(true)}>Wash</div>
              <div style={S.actionBtn()} onClick={() => setBinderOpen(true)}>File</div>
            </div>
          </div>
        </div>
      </FullscreenModal>

      {/* ── Scale Ticket (§6) ── */}
      {selectedCombo && (
        <ScaleTicketModal
          open={scaleOpen}
          onClose={() => setScaleOpen(false)}
          combo={selectedCombo}
          companyId={companyId}
          authUserId={authUserId}
          truckName={trucks.find((t) => t.truck_id === selectedCombo.truck_id)?.truck_name}
          trailerName={trailers.find((t) => t.trailer_id === selectedCombo.trailer_id)?.trailer_name}
          onSaved={() => { loadEquipment(); onRefreshCombos(); }}
        />
      )}

      {/* ── Scale History -- opened by tapping the Tare/Target report lines above ── */}
      <ScaleHistoryModal
        open={scaleHistoryOpen}
        onClose={() => setScaleHistoryOpen(false)}
        companyId={companyId}
        comboId={selectedCombo?.combo_id ?? null}
        onChanged={() => { loadEquipment(); onRefreshCombos(); }}
        truckName={trucks.find((t) => t.truck_id === selectedCombo?.truck_id)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedCombo?.trailer_id)?.trailer_name}
      />

      {/* ── Service / Wash (minimal for this pass -- full spec is §2/§3) ── */}
      <SimpleServiceModal
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
        companyId={companyId}
        authUserId={authUserId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
        serviceTypes={serviceTypes}
        onTypesChanged={loadServiceTypes}
        onSaved={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />
      <SimpleWashModal
        open={washOpen}
        onClose={() => setWashOpen(false)}
        companyId={companyId}
        authUserId={authUserId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
        onSaved={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />

      {/* ── Service / Wash history (§5) -- opened by tapping the report lines above ── */}
      <RecordHistoryModal
        open={serviceHistoryOpen}
        onClose={() => setServiceHistoryOpen(false)}
        kind="service"
        title="Service History"
        companyId={companyId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        trucks={trucks}
        trailers={trailers}
        onChanged={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />
      <RecordHistoryModal
        open={washHistoryOpen}
        onClose={() => setWashHistoryOpen(false)}
        kind="wash"
        title="Wash History"
        companyId={companyId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        trucks={trucks}
        trailers={trailers}
        onChanged={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />

      {/* ── Binder (§7) ── */}
      <BinderModal
        open={binderOpen}
        onClose={() => setBinderOpen(false)}
        companyId={companyId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
      />

      {/* ── Add new truck / trailer ── */}
      {addTruckOpen && (
        <AdminTruckModal truck={null} companyId={companyId} onClose={() => setAddTruckOpen(false)} onDone={() => { setAddTruckOpen(false); loadEquipment(); }} />
      )}
      {addTrailerOpen && (
        <AdminTrailerModal trailer={null} companyId={companyId} onClose={() => setAddTrailerOpen(false)} onDone={() => { setAddTrailerOpen(false); loadEquipment(); }} />
      )}

      {/* ── Remove confirmation ── */}
      {removeTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 20, maxWidth: 360 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Delete this unit?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 18 }}>
              This permanently removes {removeTarget.name} and its full service and wash history. This can't be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setRemoveTarget(null)} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={confirmRemove} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.25)", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New pairing needs a one-time tare weight (no history for this exact truck+trailer pair) ── */}
      {newTareTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>New Pairing</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 14 }}>
              This truck and trailer haven't been paired before. Enter the tare weight from a certified scale ticket.
            </div>
            <input
              type="number" inputMode="numeric" placeholder="e.g. 34800" autoFocus
              value={newTareInput} onChange={(e) => setNewTareInput(e.target.value)}
              style={{ width: "100%", borderRadius: 6, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 18, fontWeight: 700, boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setNewTareTarget(null);
                  setNewTareInput("");
                  // Revert local selection to whatever's actually paired --
                  // otherwise the cards would show connected with no real
                  // combo behind them.
                  const current = combos.find((c) => String(c.combo_id) === String(selectedComboId));
                  setSelectedTruckId(current?.truck_id ?? null);
                  setSelectedTrailerId(current?.trailer_id ?? null);
                }}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button type="button" onClick={submitNewTare} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                {busy ? "Pairing…" : "Couple & Select"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Minimal Wash record modal (full spec §3 is a later pass) ──
// SimpleServiceModal/ServiceTypeSelect/ServiceTypeEditorModal moved to
// ServiceTypeManager.tsx 2026-08-07 so the fleet-tier equipment modal can
// share them too -- see that file's header comment.

function SimpleWashModal({
  open, onClose, companyId, authUserId, truckId, trailerId, truckName, trailerName, onSaved,
}: {
  open: boolean; onClose: () => void; companyId: string; authUserId: string | null;
  truckId: string | null; trailerId: string | null; truckName?: string | null; trailerName?: string | null;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState<"truck" | "trailer" | "both">("both");
  const [location, setLocation] = useState("");
  const [washedAt, setWashedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUnit(truckId && trailerId ? "both" : trailerId ? "trailer" : "truck");
      setLocation("");
      setWashedAt(new Date().toISOString().slice(0, 16));
      setNotes("");
      setErr(null);
    }
  }, [open, truckId, trailerId]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const rows: any[] = [];
      const ts = new Date(washedAt).toISOString();
      if ((unit === "both" || unit === "truck") && truckId) rows.push({ company_id: companyId, truck_id: truckId, trailer_id: null, location: location || null, washed_at: ts, notes: notes || null, created_by: authUserId });
      if ((unit === "both" || unit === "trailer") && trailerId) rows.push({ company_id: companyId, truck_id: null, trailer_id: trailerId, location: location || null, washed_at: ts, notes: notes || null, created_by: authUserId });
      if (!rows.length) throw new Error("No unit selected.");

      const { error } = await supabase.from("wash_records").insert(rows);
      if (error) throw error;

      if (location.trim()) await supabase.from("service_locations").upsert({ company_id: companyId, name: location.trim() }, { onConflict: "company_id,name" });

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save wash record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title="Wash Record" footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}
        <div>
          <label style={S.reportLabel}>Unit</label>
          <CustomSelect
            value={unit}
            onChange={(v) => setUnit(v as any)}
            options={[
              ...(truckId ? [{ value: "truck", label: `Truck only (${truckName})` }] : []),
              ...(trailerId ? [{ value: "trailer", label: `Trailer only (${trailerName})` }] : []),
              ...(truckId && trailerId ? [{ value: "both", label: "Both" }] : []),
            ]}
          />
        </div>
        <div>
          <label style={S.reportLabel}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={S.reportLabel}>Date/time</label>
          <input type="datetime-local" value={washedAt} onChange={(e) => setWashedAt(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={S.reportLabel}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit", resize: "vertical" as const }} />
        </div>
        <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </FullscreenModal>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 6, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 15, boxSizing: "border-box",
};
const saveBtnStyle: React.CSSProperties = {
  width: "100%", padding: "14px 18px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
};
