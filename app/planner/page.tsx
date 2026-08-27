"use client";
import { motion } from "framer-motion";
import { clearSetupSession } from "@/lib/setupSession";
import { useRouter } from "next/navigation";
import SetupGate from "./components/SetupGate";
import { useCalculatorShell } from "./CalculatorShellContext";

/**
 * page.tsx — CalculatorPage
 *
 * This file is intentionally thin: it wires hooks together and renders JSX.
 * Business logic lives in:
 *   hooks/useEquipment.ts   — combos, selectedComboId, persistence
 *   hooks/useLocation.ts    — states/cities, ambient temp, persistence
 *   hooks/useTerminals.ts   — my terminals, catalog, get_carded
 *   hooks/usePlanSlots.ts   — plan snapshot save/load, Supabase sync
 *   hooks/useLoadWorkflow.ts — begin_load / complete_load RPCs
 *   hooks/usePlanRows.ts    — binary search for weight-constrained max gallons
 *   utils/planMath.ts       — lbsPerGallonAtTemp, planForGallons, allocateWithCaps
 *   types.ts                — all shared types
 */



import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase/client";

// Module-level (not component state) so it survives this page component
// unmounting/remounting on every route change, but still resets on a true
// full reload -- exactly the "did we already do the once-per-session
// landing redirect" flag needs. A ref/useState living inside the component
// can't do this: this page genuinely remounts every time the user
// navigates back to it, which would make a same-scope flag "fresh" again
// on every visit, defeating the "once per session" intent below.
let hasCheckedDefaultLanding = false;

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { usePlanRows } from "./hooks/usePlanRows";
import { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";

// ── Sections ───────────────────────────────────────────────────────────────────
import PlannerControls from "./sections/PlannerControls";
import PresetDial from "./sections/PresetDial";
import PresetActionSheet from "./components/PresetActionSheet";
import DriverTrainingModal from "./components/DriverTrainingModal";

// ── Modals ─────────────────────────────────────────────────────────────────────
// LocationModal/MyTerminalsModal now mount once in ShellChrome
// (CalculatorLayoutClient.tsx) -- see the render-site comment further down.
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import LoadingModal from "./modals/LoadingModal";
import CancelLoadSheet from "./components/CancelLoadSheet";
import { submitOutageReport, type OutageReportType } from "./hooks/useTerminalOutageReports";
import ProductTempModal from "./modals/ProductTempModal";
import CompartmentModal from "./modals/CompartmentModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, daysUntilISO_, formatMDYWithCountdown_, formatMDYWithTime_, isPastISO_ } from "./utils/dates";
import { themeFill, themeTextOnFill } from "./theme";
import { normState } from "./utils/normalize";
import { cgSliderToBias, bestLbsPerGallon, planForGallons, CG_NEUTRAL, computeActualLbsForLine } from "./utils/planMath";
import { generatePayPeriods, type PayPeriodType } from "@/app/admin/payPeriods";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow } from "./types";

const PERIOD_TYPE_LABELS: Record<PayPeriodType, string> = {
  weekly: "Weekly", biweekly: "Biweekly", semi_monthly: "Semi-Monthly", monthly: "Monthly",
};


// ─── Local UI helpers ─────────────────────────────────────────────────────────

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));



// TempDial component -- "moon" redesign: a glowing gradient orb with
// scattered decorative tick marks around it (reference image supplied by
// user), same drag-anywhere-in-the-widget sensitivity as the old ring/arc
// version (the hit area is still the full outer box, not just the visible
// orb, so dragging isn't harder to grab). Tapping without dragging opens a
// centered numeric-keypad popup to type the value directly -- same pattern
// as the compartment cap's precise-entry popup in PlannerControls.tsx.
type TempDialProps = { value: number; min: number; max: number; step: number; onChange: (v: number) => void };

const TEMP_DIAL_TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 30 + 9; // slight offset so ticks don't land exactly on the cardinal points
  const big = i % 2 === 0;
  const dist = big ? 116 : 108 + ((i * 37) % 9); // subtle scatter, not a perfect ring
  const rad = (angle * Math.PI) / 180;
  return { cx: 120 + Math.cos(rad) * dist, cy: 120 + Math.sin(rad) * dist, angle, big };
});

function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const sweepStart = -135;
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const angleToValue = useCallback((deg: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    const raw = 60 + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
    return clampNum(Math.round((Math.round(raw / step) * step) * 10) / 10, min, max);
  }, [min, max, step, sweep, sweepStart, sweepEnd]);

  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    onChange(angleToValue(clampNum((Math.atan2(dy, dx) * 180) / Math.PI, sweepStart, sweepEnd)));
  }, [angleToValue, onChange, sweepStart, sweepEnd]);

  function commitTyped() {
    const parsed = clampNum(Math.round((Number(typedValue) || 0) * 10) / 10, min, max);
    onChange(parsed);
    setTyping(false);
  }

  return (
    <div
      ref={ref}
      style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: "1/1", position: "relative", touchAction: "none" }}
      onPointerDown={(e) => {
        if (typing) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        pointerDownRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (typing || !dragging) return;
        const start = pointerDownRef.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) movedRef.current = true;
        if (movedRef.current) setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        if (typing) return;
        setDragging(false);
        if (!movedRef.current) { setTypedValue(String(value)); setTyping(true); }
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        {TEMP_DIAL_TICKS.map((t, i) => t.big ? (
          <rect key={i} x={t.cx - 1.5} y={t.cy - 8} width={3} height={16} rx={1.5}
            fill="rgba(255,255,255,0.55)" transform={`rotate(${t.angle + 90} ${t.cx} ${t.cy})`} />
        ) : (
          <rect key={i} x={t.cx - 2} y={t.cy - 2} width={4} height={4}
            fill="rgba(255,255,255,0.28)" transform={`rotate(45 ${t.cx} ${t.cy})`} />
        ))}
      </svg>
      <div style={{ position: "absolute", top: 6, left: 0, right: 0, textAlign: "center", fontWeight: 900, fontSize: 14, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>60°F</div>
      <div style={{
        position: "absolute", inset: 0, margin: "auto", width: "68%", height: "68%",
        borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle at 34% 28%, #ffffff 0%, #f4f4f4 30%, #d9d9d9 62%, #b6b6b6 100%)",
        boxShadow: "0 22px 48px rgba(0,0,0,0.55), inset 0 -12px 26px rgba(0,0,0,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, letterSpacing: -0.6, color: "#181818" }}>
          {value.toFixed(1)}°F
        </div>
      </div>

      {/* Tap-to-type -- opens on a tap that didn't drag, anywhere in the widget */}
      {typing && (
        <div
          onClick={(e) => { e.stopPropagation(); setTyping(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 280, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>
              Set Temp (°F) for All Products
            </div>
            <input
              type="text" inputMode="decimal" autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value.replace(/[^0-9.\-]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }}
              style={{ width: "100%", textAlign: "center" as const, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)", color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0" }}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{min}° to {max}°</div>
            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
              <button type="button" onClick={() => setTyping(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={commitTyped}
                style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────


export default function CalculatorPage() {
  // ── Shared shell state (equipment/location/terminals/expirations) ──────────
  // Owned once in CalculatorShellContext (layout.tsx) so the header's gear/
  // bell icons and this page's own planning logic never see two
  // independently-hydrated copies of the same selection state.
  const shell = useCalculatorShell();
  const { authUserId, setupSession, effectiveUserId, equipment, location, terminals, expirations } = shell;
  const router = useRouter();

  // Dispatch's real home is the Dispatch tab, not this one -- but whatever
  // actually lands the app on bare /planner (e.g. a login redirect that
  // doesn't know about roles) doesn't know that. Admin/super-admin are
  // deliberately excluded here per explicit user direction (2026-08-04):
  // "the only role that should default to the dispatch tab on open is the
  // dispatch role. all other roles should open to the planner." Admin's
  // route into the Dispatch tab's driver-scoped view is the Dispatch tab
  // itself (a permanent, always-available tab, not a default landing);
  // this redirect previously also fired for admin/super-admin and was the
  // actual cause of a real reported bug ("twitches back to dispatch" when
  // tapping Planner) -- if this page's own JS chunk got re-evaluated after
  // a route away and back (e.g. under memory pressure on mobile), the
  // module-level hasCheckedDefaultLanding flag reset, so the "one-time"
  // redirect silently refired on what the admin experienced as a deliberate
  // Planner visit. Scoping this to dispatch-only doesn't fix that
  // re-evaluation risk in the abstract, but it does mean the one role that
  // can hit it (dispatch) has no Planner tab to be bounced away from in the
  // first place -- the whole bug class no longer has a visible symptom for
  // any role that experiences it.
  useEffect(() => {
    if (hasCheckedDefaultLanding) return;
    if (shell.role == null) return;
    hasCheckedDefaultLanding = true;
    if (shell.role === "dispatch") {
      router.replace("/planner/dispatch");
    }
  }, [shell.role, router]);

  // ── Card data (card number + PIN + private note, per terminal, per user) ──
  // Owned in CalculatorShellContext now -- the new Cards tab route needs the
  // same data, so it's shared rather than fetched twice (same pattern as
  // equipment/location/terminals above).
  const { cardDataByTerminalId, setCardDataForTerminal_ } = shell;

  // Framer-motion's layoutId shared-element transitions render a differently
  // serialized `style` attribute server-side vs. after hydration (e.g. its
  // color values gain spaces: "rgba(255,255,255,0.45)" -> "rgba(255, 255,
  // 255, 0.45)"), which is a real, uncorrected hydration mismatch React won't
  // patch up. Render plain <button>s for SSR/first paint and only swap to
  // motion.button post-mount, so hydration always diffs identical DOM.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Modal open/close flags ─────────────────────────────────────────────────
  // equipOpen/expModalOpen/termOpen live in the shared shell context now --
  // the header (layout.tsx) needs to trigger the same Equipment/Expirations/
  // Terminals sheets this page renders (ExpirationModal's "resolve" links
  // open Terminals, so it has to be a shared boolean, not local to either).
  // locOpen/statePickerOpen/expandedTerminalId and the city-star/stateOptions/
  // cities derived values also live in shell now (see CalculatorShellContext) --
  // the Terminal tab's own identity header opens the same LocationModal/
  // MyTerminalsModal instances (now mounted once in ShellChrome), so this
  // page and that one can't each carry an independent copy without risking
  // the two drifting out of sync.
  const {
    equipOpen, setEquipOpen, termOpen, setTermOpen,
    locOpen, setLocOpen, statePickerOpen, setStatePickerOpen,
    expandedTerminalId, setExpandedTerminalId,
    isCityStarred, toggleCityStar,
    stateOptions, selectedStateLabel, selectedStateName, cities, topCities, allCities,
  } = shell;
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
  const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  // The Loading modal's single exit point -- opened by its bottom button
  // (renamed from "LOADED" to "Complete") or by FullscreenModal's own
  // backdrop-click/Escape (the header Close button is hidden now, see
  // hideCloseButton in LoadingModal.tsx). Offers Log the Load / Update
  // Card Only / Keep Editing -- see CancelLoadSheet.tsx for why the
  // "update card only" branch is real, not just a courtesy: begin_load
  // already re-cards the terminal on LOAD tap, before this modal ever
  // opens.
  const [cancelLoadConfirmOpen, setCancelLoadConfirmOpen] = useState(false);
  // Captured the instant LOAD/RELOAD is tapped -- whatever this terminal's
  // access date was *before* begin_load's silent re-card, so "Back to
  // Planner" can genuinely undo it (see handleBackToPlannerNoUpdate below).
  // null prevValue means the terminal had no prior access record at all.
  const preLoadCardedOnRef = useRef<{ terminalId: string; prevValue: string | null } | null>(null);

  // ── Action row state ────────────────────────────────────────────────────────
  // activeSlotLetter mirrors PresetDial's own (cosmetic) centered/last-tapped
  // slot, so "Save plan {letter}" always names the right preset. selectedComp
  // is which compartment bar was last tapped (tapping a bar now selects it
  // instead of opening the product picker directly -- the picker only opens
  // via the "Edit Comp N Product" action button, per the design handoff).
  const [activeSlotLetter, setActiveSlotLetter] = useState(1);
  // Separate from activeSlotLetter on purpose. activeSlotLetter mirrors
  // PresetDial's own scroll-centered position -- it changes on a mere
  // swipe/preview, with no real load involved (PresetDial's own comment:
  // scrolling "deliberately does NOT itself trigger any action"). But it
  // used to ALSO be what got tagged onto load_log.plan_slot at load time,
  // so a driver who previewed a different letter without tapping it could
  // get a completed load tagged with the wrong preset -- confirmed live,
  // this is why refresh sometimes highlighted the wrong letter even though
  // the restored compPlan content itself was correct. lastLoadedSlot only
  // ever changes inside a genuine load action (PresetDial's onLoad,
  // PresetActionSheet's onLoad, or the mount-time resync below) and is
  // what actually gets tagged to the load -- activeSlotLetter still drives
  // "Save plan {letter}" unchanged.
  const [lastLoadedSlot, setLastLoadedSlot] = useState<number | null>(null);
  const [selectedComp, setSelectedComp] = useState<number | null>(null);
  // One-shot sync target for PresetDial -- set once the last-completed
  // load's own plan_slot resolves after mount, so the dial's highlighted
  // letter agrees with whichever preset's plan was actually restored into
  // the compartments (previously it always showed A regardless of which
  // preset the restored plan came from). See the effect below and the
  // presetDialSyncedRef guard, which stops this from ever overriding a
  // preset the driver has since manually tapped.
  const [presetDialSyncTo, setPresetDialSyncTo] = useState<number | null>(null);
  const presetDialSyncedRef = useRef(false);

  // ── Feature hooks ──────────────────────────────────────────────────────────
  // equipment/location/terminals come from the shared shell context (see above).

  // Resolve timezone after both hooks exist
  const selectedTerminalTimeZoneResolved = useMemo(() => {
    const tid = String(location.selectedTerminalId ?? "");
    if (!tid) return null;
    // timezone lives in terminalCatalog (from terminals table), not in my_terminals_with_status view
    return (terminals.terminalCatalog as any[])?.find((x) => String(x.terminal_id) === tid)?.timezone ?? null;
  }, [location.selectedTerminalId, terminals.terminalCatalog]);

  // ── Compartments ───────────────────────────────────────────────────────────
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const selectedTrailerId = equipment.selectedCombo?.trailer_id ?? null;

  useEffect(() => {
    (async () => {
      setCompError(null);
      setCompartments([]);
      if (!selectedTrailerId) return;
      setCompLoading(true);
      const { data, error } = await supabase
        .from("trailer_compartments")
        .select("trailer_id, comp_number, max_gallons, cap_gallons, position, active")
        .eq("trailer_id", selectedTrailerId)
        .order("comp_number", { ascending: true });
      if (error) { setCompError(error.message); setCompartments([]); }
      else { setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false)); }
      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

  // ── Equipment details (truck/trailer name + make, for the Equipment info card) ──
  const [equipmentDetails, setEquipmentDetails] = useState({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
  const selectedTruckId = equipment.selectedCombo?.truck_id ?? null;

  useEffect(() => {
    (async () => {
      if (!selectedTruckId && !selectedTrailerId) {
        setEquipmentDetails({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
        return;
      }
      const [truckRes, trailerRes] = await Promise.all([
        selectedTruckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", selectedTruckId).maybeSingle() : Promise.resolve({ data: null }),
        selectedTrailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", selectedTrailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setEquipmentDetails({
        truckName: (truckRes as any)?.data?.truck_name ?? "",
        truckMake: (truckRes as any)?.data?.make ?? "",
        trailerName: (trailerRes as any)?.data?.trailer_name ?? "",
        trailerMake: (trailerRes as any)?.data?.make ?? "",
      });
    })();
  }, [selectedTruckId, selectedTrailerId]);

  // ── Terminal products ──────────────────────────────────────────────────────
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);

  // Extract terminal products fetch as a named callback so it can be called post-load.
  //
  // Reads rack_product_status only -- every terminal always has at least
  // one rack now (auto-named "Main Rack" for terminals that never touched
  // the Terminal tab, see the "unify_terminals_onto_racks" migration), so
  // there's no more terminal-wide-pool-with-optional-rack-override dual
  // path: a rack IS the terminal's product list and reference reading, full
  // stop. Waits for location.selectedRackId to resolve (chooseTerminal sets
  // it async, right after selectedTerminalId) rather than reading anything
  // terminal-scoped in the meantime -- a brief empty list while it resolves
  // beats a stale/wrong terminal's data flashing first.
  const fetchTerminalProducts = useCallback(async () => {
    if (!location.selectedTerminalId || !location.selectedRackId) { setTerminalProducts([]); return; }
    const { data, error } = await supabase
      .from("rack_product_status")
      .select(`active, last_api, last_temp_f, updated_at,
        products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f, un_number, is_dyed, canonical_product_id)`)
      .eq("rack_id", location.selectedRackId);
    if (error) { setTerminalProducts([]); return; }
    // Stats lookup by product_id across ALL rows on this rack (not just
    // active ones) -- a rack-injected-variance product (e.g. dyed diesel)
    // pools its tracking onto the canonical product's row, which needs to
    // be found here even if the canonical product itself isn't separately
    // offered/active on this rack's driver-facing list.
    const statsByProductId: Record<string, { last_api: number | null; last_api_updated_at: string | null; last_temp_f: number | null; last_loaded_at: string | null }> = {};
    for (const row of (data ?? []) as any[]) {
      const pid = row.products?.product_id;
      if (!pid) continue;
      statsByProductId[pid] = {
        last_api: row.last_api ?? null,
        last_api_updated_at: row.updated_at ?? null,
        last_temp_f: row.last_temp_f ?? null,
        last_loaded_at: row.updated_at ?? null,
      };
    }

    const products = (data ?? []).filter((row: any) => row.active !== false)
      .map((row: any) => {
        if (!row.products) return null;
        const own = statsByProductId[row.products.product_id];
        const canonicalId = row.products.canonical_product_id as string | null | undefined;
        const stats = (canonicalId && statsByProductId[canonicalId]) ? statsByProductId[canonicalId] : own;
        return { ...row.products, ...stats };
      })
      .filter(Boolean);
    setTerminalProducts(products as ProductRow[]);
  }, [location.selectedTerminalId, location.selectedRackId]);

  // Rack's own name, for ManageTerminalProductsModal's "Active products at
  // {terminal} — {rack}" label (hidden there for the generic "Main Rack"
  // default). Cheap, separate fetch rather than piggybacking on
  // shell.rackPickerRacks -- that list only exists transiently while the
  // rack-select sheet is open, not for whatever rack ends up selected.
  const [selectedRackName, setSelectedRackName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!location.selectedRackId) { setSelectedRackName(undefined); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("terminal_racks")
        .select("rack_name")
        .eq("rack_id", location.selectedRackId)
        .maybeSingle();
      if (!cancelled) setSelectedRackName((data as any)?.rack_name ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [location.selectedRackId]);

  useEffect(() => { fetchTerminalProducts(); }, [fetchTerminalProducts]);

  // ── Planning inputs ────────────────────────────────────────────────────────
  // ── Persisted plan state — survives page refresh ─────────────────────────
  // All initialized to defaults; hydrated from localStorage in useEffect after mount
  // (avoids SSR hydration mismatch — localStorage is client-only)
  const [tempF, setTempFRaw] = useState<number>(60);

  // Per-product planned temp -- split load (e.g. diesel + regular in the same
  // trailer) genuinely have different temps (different tanks), so a single
  // shared tempF was wrong the moment more than one product was in the plan.
  // tempF is kept as the dial's own "reference" value; every existing way of
  // moving it (drag, type-in, quick +/-, snap buttons) now also shifts every
  // product's own temp by the same delta, applied once here so none of those
  // call sites needed to change. Setting one product directly (tapping its
  // row in the modal) bypasses this and only touches that product -- see
  // setSingleProductTempF below. Deliberately NOT persisted to localStorage
  // like tempF is -- same "always re-seeded from the live prediction, never
  // restored from a snapshot" rule tempF itself already follows.
  const [productTempF, setProductTempF] = useState<Record<string, number>>({});

  // Kept in sync synchronously (not via a useEffect) so setTempF can always
  // read "prev" without nesting a second setState call inside setTempFRaw's
  // own updater. That nested-call version worked in production but silently
  // double-applied the delta in dev: React 18 StrictMode double-invokes
  // updater functions to catch impure ones, and an updater that calls
  // setProductTempF as a side effect isn't pure -- both invocations actually
  // fired the nested update, doubling the shift. Caught this live testing
  // the split-load dial (a single +5.8° drag was landing as +11.6°).
  const tempFRef = useRef(60);

  const setTempF = useCallback((v: number | ((prev: number) => number)) => {
    const prev = tempFRef.current;
    const next = typeof v === "function" ? v(prev) : v;
    const delta = Math.round((next - prev) * 10) / 10;
    tempFRef.current = next;
    if (delta !== 0) {
      setProductTempF((prevProd) => {
        if (Object.keys(prevProd).length === 0) return prevProd;
        const out: Record<string, number> = {};
        for (const [pid, val] of Object.entries(prevProd)) out[pid] = Math.round((val + delta) * 10) / 10;
        return out;
      });
    }
    try { localStorage.setItem("protankr_tempF_v1", String(next)); } catch {}
    setTempFRaw(next);
  }, []);

  // Safety net for the one path that sets tempF directly (localStorage
  // hydration on mount, below) instead of through setTempF -- keeps the ref
  // truthful even then, so a delta computed right after mount is never based
  // on the stale initial 60 default.
  useEffect(() => { tempFRef.current = tempF; }, [tempF]);

  const setSingleProductTempF = useCallback((productId: string, value: number) => {
    setProductTempF((prev) => ({ ...prev, [productId]: Math.round(value * 10) / 10 }));
  }, []);

  const [cgSlider, setCgSliderRaw] = useState<number>(0.5);
  const setCgSlider = useCallback((v: number | ((prev: number) => number)) => {
    setCgSliderRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("protankr_cgSlider_v1", String(next)); } catch {}
      return next;
    });
  }, []);

  // compPlan is keyed per combo+terminal so switching equipment restores the right plan
  const compPlanKey = useMemo(() => {
    const cid = equipment.selectedComboId ?? "";
    const tid = location.selectedTerminalId ?? "";
    return cid && tid ? `protankr_compPlan_v1:${cid}:${tid}` : null;
  }, [equipment.selectedComboId, location.selectedTerminalId]);

  const [compPlan, setCompPlanRaw] = useState<Record<number, CompPlanInput>>({});

  const setCompPlan = useCallback((updater: any) => {
    setCompPlanRaw((prev: Record<number, CompPlanInput>) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (compPlanKey) {
        try { localStorage.setItem(compPlanKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [compPlanKey]);

  // "Save plan {letter}" is dirty-tracked against a baseline snapshot taken
  // right after the last load/save -- it only shows when the current plan
  // actually diverges from what's saved, and hides itself immediately after
  // a successful save (per explicit feedback: no button when there's nothing
  // new to save). Covers everything buildSnapshot()/saveToSlot() actually
  // persist -- product selection + empty flag + cap override per comp, and
  // the CG slider -- not just cap overrides, so picking a different product
  // or sliding CG also surfaces the button.
  const overridesSnapshot = useCallback((plan: Record<number, CompPlanInput>, cg: number) => {
    const comps: Record<number, { productId: string; empty: boolean; capOverride: number | null }> = {};
    for (const k of Object.keys(plan || {})) {
      const v = (plan as any)[k] ?? {};
      comps[Number(k)] = {
        productId: v.productId ?? "",
        empty: !!v.empty,
        capOverride: v.capOverride ?? null,
      };
    }
    return JSON.stringify({ comps, cg: Math.round((Number(cg) || 0) * 1000) / 1000 });
  }, []);
  // Lazy initializer (not a literal "{}") so the baseline matches whatever
  // compPlan/cgSlider actually start as -- broadening the snapshot to include
  // productId/empty/cg means a hardcoded "{}" no longer matches an empty
  // plan's real serialized shape, which made "Save plan" appear spuriously
  // on a completely fresh mount.
  const [baselineOverrides, setBaselineOverrides] = useState(() => overridesSnapshot(compPlan, cgSlider));
  const [captureBaselineNext, setCaptureBaselineNext] = useState(false);
  // Which preset slot (1-5) the action sheet is open for, if any -- set by
  // PresetDial's onTapFilled when a filled slot is tapped.
  const [presetSheetSlot, setPresetSheetSlot] = useState<number | null>(null);

  // Fires once compPlan has actually re-rendered post-load (loadFromSlot
  // applies asynchronously via the hook's own setCompPlan), so the baseline
  // reflects what was really loaded, not what was on screen before it.
  //
  // Re-captures on every compPlan/cgSlider change while the flag is set,
  // and only clears it after a short quiet period (debounced, same idea as
  // usePlanSlots' own 350ms autosave debounce) rather than immediately on
  // the first change. usePlanSlots' automatic restores (slot-0-on-terminal-
  // change, last-load-from-log-on-combo-claim) hit the DB first and call
  // setCompPlan/setCgSlider only once that resolves -- consuming the flag
  // on the very next render (the pre-restore value) meant the baseline got
  // locked in *before* the real restore landed, so the button showed
  // "dirty" the instant equipment/terminal was picked, before the user had
  // touched anything.
  useEffect(() => {
    if (!captureBaselineNext) return;
    setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    const t = setTimeout(() => setCaptureBaselineNext(false), 600);
    return () => clearTimeout(t);
  }, [compPlan, cgSlider, captureBaselineNext, overridesSnapshot]);

  // Terminal/combo switches trigger usePlanSlots' own automatic restores
  // (slot-0-on-terminal-change, last-load-from-log-on-combo-claim) -- those
  // land asynchronously via that hook's own setCompPlan/setCgSlider calls,
  // not through the explicit "Load {letter}" path. Reuse the same
  // captureBaselineNext mechanism so the baseline is recaptured once that
  // restore actually lands, instead of comparing against pre-restore state.
  useEffect(() => {
    setCaptureBaselineNext(true);
  }, [location.selectedTerminalId, equipment.selectedComboId]);

  // Hydrate tempF and cgSlider once on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("protankr_tempF_v1");
      if (t != null && Number.isFinite(Number(t))) setTempFRaw(Number(t));
      const cg = localStorage.getItem("protankr_cgSlider_v1");
      if (cg != null && Number.isFinite(Number(cg))) setCgSliderRaw(Number(cg));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref holds the hydrated plan so compartments init doesn't overwrite it
  const hydratedCompPlanRef = useRef<Record<number, CompPlanInput> | null>(null);

  // Hydrate compPlan when combo+terminal key changes
  useEffect(() => {
    if (!compPlanKey) {
      hydratedCompPlanRef.current = null;
      setCompPlanRaw({});
      return;
    }
    try {
      const raw = localStorage.getItem(compPlanKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          hydratedCompPlanRef.current = p;
          setCompPlanRaw(p);
          return;
        }
      }
    } catch {}
    hydratedCompPlanRef.current = null;
    setCompPlanRaw({});
  }, [compPlanKey]);
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});

  // Fuel temp prediction — drives temp button border color and pre-fills ProductTempModal.
  //
  // City/state only -- the server resolves its own fresh ambient + city-level
  // coordinates (see /api/fuel-temp), never trusting a client-supplied value.
  // terminalId is passed through only for the per-terminal bias lookup. The
  // modal below shows this hook's own resolved ambientNowF, not a separately
  // polled value, so the displayed label and the predicted temp can never
  // drift apart (see fuelTempPredictor.ts / route.ts for the fuller history
  // of why this matters -- an earlier version of this app tracked ambient
  // per-terminal and once had 3 terminals silently resolving to (0,0)).
  const {
    predictedFuelTempF, confidence: fuelTempConfidence, loading: fuelTempLoading,
    ambientNowF: fuelTempAmbientF,
  } = useFuelTempPrediction({
    city: location.selectedCity || null,
    state: location.selectedState || null,
    terminalId: location.selectedTerminalId || null,
  });

  // Auto-apply prediction to the slider when it first arrives.
  // userAdjustedTempRef = true means the driver has manually moved the slider.
  // Resets whenever city/state changes so a new terminal gets a fresh auto-apply.
  const predAppliedForRef = useRef<string>("");
  const userAdjustedTempRef = useRef<boolean>(false);

  // Mark as user-adjusted whenever tempF changes AFTER a prediction has been
  // applied. Real bug fixed here: this used to check only whether
  // predAppliedForRef was non-empty -- but the auto-apply effect below sets
  // that ref in the SAME tick it calls setTempF, so this effect's own next
  // run (triggered by that very auto-apply) always saw a non-empty ref and
  // incorrectly marked the auto-apply's own change as a manual edit. That
  // permanently blocked ANY future re-application of a fresh prediction for
  // that city/state -- confirmed live, this is why the modal could show a
  // newer number than the button/load payload ever received. Now compares
  // the new value against the prediction itself: only a change that doesn't
  // match the last-known prediction counts as a genuine manual edit.
  const prevTempFRef = useRef<number>(tempF);
  useEffect(() => {
    if (Math.abs(tempF - prevTempFRef.current) > 0.1) {
      const matchesPrediction = predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) < 0.1;
      if (predAppliedForRef.current !== "" && !matchesPrediction) {
        userAdjustedTempRef.current = true;
      }
    }
    prevTempFRef.current = tempF;
  }, [tempF, predictedFuelTempF]);

  // Reset on city/state change
  useEffect(() => {
    predAppliedForRef.current = "";
    userAdjustedTempRef.current = false;
    prevTempFRef.current = tempF;
  }, [location.selectedCity, location.selectedState]);

  // Apply prediction to slider when it arrives -- skip if the driver has
  // genuinely adjusted it since. Previously this stopped re-applying the
  // instant predAppliedForRef matched the current city/state key, even if
  // a LATER fetch (e.g. the periodic refresh in useFuelTempPrediction.ts)
  // returned a materially different number -- meaning a driver who left
  // the app open all day could keep seeing a temp from hours earlier even
  // though the modal's own banner (which reads predictedFuelTempF
  // directly, bypassing this effect) had already moved on. Now re-checks
  // the actual value each time, so any later fetch with a real delta still
  // lands on the button/load payload, not just the modal.
  useEffect(() => {
    if (predictedFuelTempF == null) return;
    if (userAdjustedTempRef.current) return;
    if (Math.abs(tempF - predictedFuelTempF) < 0.1) return;
    setTempF(predictedFuelTempF);
    predAppliedForRef.current = `${location.selectedCity}|${location.selectedState}`;
  }, [predictedFuelTempF, location.selectedCity, location.selectedState, tempF]);

  // Initialize compPlan entries when compartments change
  // Merges with hydratedCompPlanRef so saved products survive even if
  // this runs in the same batch as hydration (React may see stale prev = {})
  useEffect(() => {
    setCompPlanRaw((prev: Record<number, CompPlanInput>) => {
      const base = hydratedCompPlanRef.current ?? prev;
      const next = { ...base };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        if (!next[n]) next[n] = { empty: false, productId: "" };
      }
      for (const key of Object.keys(next)) {
        const n = Number(key);
        if (!compartments.some((c) => Number(c.comp_number) === n)) delete next[n];
      }
      return next;
    });
  }, [compartments]);

  // ── CG bias ────────────────────────────────────────────────────────────────
  const cgBias = useMemo(() => cgSliderToBias(cgSlider), [cgSlider]);
  const unstableLoad = cgSlider < CG_NEUTRAL;

  // ── Cap helpers ────────────────────────────────────────────────────────────
  // cap_gallons (configured in Binder's Compartments section) is the real
  // ceiling used for load planning -- max_gallons is informational only.
  // compPlan[n].capOverride is a temporary, per-load reduction on top of
  // that cap (never above it), set by dragging a compartment's handle in
  // the planner; clearing it restores the full configured cap.
  const persistedCapForComp = useCallback((compNumber: number) => {
    const c = compartments.find((x) => Number(x.comp_number) === compNumber);
    if (!c) return 0;
    const cap = c.cap_gallons != null ? Number(c.cap_gallons) : Number(c.max_gallons ?? 0);
    return Number.isFinite(cap) ? Math.max(0, cap) : 0;
  }, [compartments]);

  const effectiveMaxGallonsForComp = useCallback((compNumber: number, persistedCap: number) => {
    const override = compPlan[compNumber]?.capOverride;
    if (override == null) return Math.max(0, Math.floor(persistedCap));
    return Math.max(0, Math.floor(Math.min(Number(override), persistedCap)));
  }, [compPlan]);

  // ── lbs/gal helper ────────────────────────────────────────────────────────
  // True if any planned compartment is using the fallback reference API (no driver-observed last_api)
  const planUsesReferenceApi = useMemo(() => {
    return Object.values(compPlan).some((slot) => {
      if (!slot || slot.empty || !slot.productId) return false;
      const p = terminalProducts.find((p) => p.product_id === slot.productId);
      return p != null && (p.last_api == null || !Number.isFinite(Number(p.last_api)));
    });
  }, [compPlan, terminalProducts]);

  const lbsPerGalForProductId = useCallback((productId: string): number | null => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    // Each product uses its OWN planned temp now, not the shared dial value --
    // a split load (e.g. diesel + regular in the same trailer) really can sit
    // at two different temps at once, and the weight math needs to reflect
    // that, not just the display. Falls back to the shared tempF for a
    // product that hasn't been seeded into productTempF yet (shouldn't
    // normally happen -- the seeding effect below keeps every planned
    // product's entry current -- but keeps this callable safely regardless).
    const t = productTempF[productId] ?? tempF;
    // Use driver-observed API (last_api @ last_temp_f) when available — more accurate
    // than the static api_60 reference. bestLbsPerGallon back-corrects to 60°F first.
    return bestLbsPerGallon(
      Number(p.api_60),
      Number(p.alpha_per_f),
      t,
      p.last_api     != null ? Number(p.last_api)     : null,
      p.last_temp_f  != null ? Number(p.last_temp_f)  : null,
    );
  }, [terminalProducts, tempF, productTempF]);

  // ── Active compartments ────────────────────────────────────────────────────
  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId || compartments.length === 0 || terminalProducts.length === 0) return [];
    const out: ActiveComp[] = [];
    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const persistedCap = persistedCapForComp(compNumber);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, persistedCap);
      const position = -(Number(c.position ?? 0)); // DB +position = REAR → flip to FRONT
      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;
      const sel = compPlan[compNumber];
      if (!sel || sel.empty || !sel.productId) continue;
      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;
      out.push({ compNumber, maxGallons, position: Number.isFinite(position) ? position : 0, productId: sel.productId, lbsPerGal });
    }
    out.sort((a, b) => a.position - b.position);
    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF]);

  // Seed productTempF for any planned product that doesn't have an entry yet
  // (new product just added to the plan), and drop entries for products no
  // longer in the plan. New products seed to the CURRENT dial value (tempF)
  // -- not the raw prediction -- so a product added after the driver has
  // already nudged the dial away from the prediction picks up that nudge
  // too, instead of jumping back to the un-adjusted number.
  const plannedProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of activeComps) if (c.productId) s.add(c.productId);
    return s;
  }, [activeComps]);

  useEffect(() => {
    setProductTempF((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const pid of plannedProductIds) {
        if (!(pid in next)) { next[pid] = tempF; changed = true; }
      }
      for (const pid of Object.keys(next)) {
        if (!plannedProductIds.has(pid)) { delete next[pid]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [plannedProductIds, tempF]);

  // ── Weight limits ──────────────────────────────────────────────────────────
  // target_weight = the gross weight the driver is trying to hit (renamed from gross_limit_lbs)
  const targetWeight = Number((equipment.selectedCombo as any)?.target_weight ?? 0);
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0);
  const allowedLbs = Math.max(0, targetWeight - tare);  // payload = target - tare

  const capacityGallonsActive = useMemo(
    () => activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0),
    [activeComps]
  );

  // ── Plan rows (binary search) ──────────────────────────────────────────────
  const plannedResult = usePlanRows({ selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons });
  const planRows = plannedResult.planRows;

  const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const r of planRows as any[]) {
      const n = Number(r.comp_number ?? r.compNumber ?? 0);
      if (Number.isFinite(n)) m[n] = Number(r.planned_gallons ?? r.plannedGallons ?? 0);
    }
    return m;
  }, [planRows]);

  const plannedWeightLbs = useMemo(
    () => planRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [planRows]
  );

  const plannedGallonsTotal = planRows.reduce((s, r) => s + r.planned_gallons, 0);

  // ── Loading modal: Plan Review gallons override ─────────────────────────────
  // Isolated per-compartment override, applied AFTER planRows is already
  // computed -- deliberately NOT compPlan.capOverride, which feeds INTO
  // usePlanRows'/planForGallons's binary-search allocation and can cause
  // OTHER compartments to gain gallons to compensate (confirmed by reading
  // usePlanRows.ts -- it always maximizes total gallons under the weight
  // budget). Editing one compartment here changes only that compartment;
  // every other row is mathematically guaranteed untouched, even if that
  // leaves legal weight capacity unused (explicit product decision -- e.g.
  // reacting to a stale API by intentionally loading light on just that
  // compartment, not redistributing the "missing" gallons elsewhere).
  // Reset to {} on every fresh LOAD tap (see beginLoadToSupabase); never
  // persisted to compPlan or presets -- more ephemeral than capOverride
  // even (which is itself already excluded from saved presets).
  const [loadingGallonsOverride, setLoadingGallonsOverride] = useState<Record<number, number>>({});

  const effectivePlanRows = useMemo(() => {
    if (Object.keys(loadingGallonsOverride).length === 0) return planRows;
    return planRows.map((r) =>
      loadingGallonsOverride[r.comp_number] != null
        ? { ...r, planned_gallons: loadingGallonsOverride[r.comp_number] }
        : r
    );
  }, [planRows, loadingGallonsOverride]);

  const effectivePlannedWeightLbs = useMemo(
    () => effectivePlanRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [effectivePlanRows]
  );
  const effectivePlannedGallonsTotal = effectivePlanRows.reduce((s, r) => s + r.planned_gallons, 0);

  // Live weight/diff preview for the Loading modal's Plan Review phase --
  // reuses computeActualLbsForLine, the exact same formula the final
  // complete_load submission uses (see useLoadWorkflow.ts), so this preview
  // can never disagree with what actually gets submitted. Falls back to
  // planned density for any line whose product doesn't have a valid
  // API+Temp entered yet (matches how the plan's own weight calc already
  // treats an unentered product).
  const livePreviewTotalLbs = useMemo(() => {
    let sum = 0;
    for (const r of effectivePlanRows as any[]) {
      const pid = r.productId as string | undefined;
      const gallons = Number(r.planned_gallons ?? 0);
      const prod = pid ? terminalProducts.find((p) => p.product_id === pid) : null;
      const apiNum = pid ? Number(String(productInputs[pid]?.api ?? "").trim()) : NaN;
      const tempVal = pid ? Number(productInputs[pid]?.tempF) : NaN;
      const alpha = prod?.alpha_per_f != null ? Number(prod.alpha_per_f) : null;
      if (alpha != null && Number.isFinite(apiNum) && Number.isFinite(tempVal)) {
        sum += computeActualLbsForLine(gallons, apiNum, tempVal, alpha);
      } else {
        sum += gallons * Number(r.lbsPerGal ?? 0);
      }
    }
    return sum;
  }, [effectivePlanRows, productInputs, terminalProducts]);

  const livePreviewGrossLbs = Number.isFinite(tare) ? tare + livePreviewTotalLbs : null;
  const livePreviewDiffLbs = livePreviewGrossLbs != null && targetWeight > 0 ? livePreviewGrossLbs - targetWeight : null;

  // ── Plan slots ─────────────────────────────────────────────────────────────
  // Must be declared BEFORE loadWorkflow so planSlots.refreshLastLoad is defined
  const planSlots = usePlanSlots({
    authUserId: effectiveUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, compPlan, setCompPlan,
    cgSlider, setCgSlider,
    compartmentsLoaded: compartments.length > 0,
  });

  // ── Load workflow ──────────────────────────────────────────────────────────
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of terminalProducts) { if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id); }
    return m;
  }, [terminalProducts]);

  // Preset action sheet summary -- a preset saved at a different terminal
  // may reference a product not sold here, which productNameById (scoped to
  // the *current* terminal) won't resolve; surfaced honestly rather than
  // silently dropped, since that's exactly the mismatch the LOAD-blocking
  // flow below also has to catch.
  const presetSheetSummary = useMemo(() => {
    if (presetSheetSlot == null) return "";
    const snap = planSlots.peekSlot(presetSheetSlot);
    const plan = snap?.compPlan;
    if (!plan) return "Empty";
    const names = new Set<string>();
    let hasUnavailable = false;
    for (const v of Object.values(plan)) {
      if (!v || v.empty || !v.productId) continue;
      const name = productNameById.get(v.productId);
      if (name) names.add(name); else hasUnavailable = true;
    }
    const parts = Array.from(names);
    if (hasUnavailable) parts.push("unavailable product");
    return parts.length > 0 ? parts.join(", ") : "Empty";
  }, [presetSheetSlot, planSlots, productNameById]);

  // Compartments whose planned product isn't sold at the currently selected
  // terminal -- almost always the result of loading a preset saved at a
  // different terminal (presets are terminal-independent, per the rework
  // above). A live derived value (not a one-time check at load time) so it
  // also catches a terminal switch after the fact. Feeds both the
  // auto-resolve flow below and the LOAD button's hard block.
  const unavailableComps = useMemo(() => {
    // terminalProducts starts empty and only resolves after its own async
    // chain (terminal -> rack -> network fetch, see fetchTerminalProducts
    // above) -- if a preset applies (autosave restore, or a tap) before
    // that finishes, every real product in compPlan would otherwise look
    // "unavailable" against a still-empty catalog. Confirmed live: a
    // reported "product not available" was a false positive from exactly
    // this race -- the product genuinely was sold at the terminal, the
    // catalog just hadn't loaded yet. No way to tell "still loading" apart
    // from "terminal genuinely has zero configured products" from this
    // array alone, but treating the empty-catalog case as "nothing flagged"
    // is the safe default either way -- the LOAD button's own separate
    // planRows.length === 0 gate already covers a load that can't proceed
    // at all, and flagging "not available" against an unknown catalog is
    // misleading regardless of which case it is.
    if (terminalProducts.length === 0) return [];
    const availableIds = new Set(terminalProducts.map((p) => p.product_id));
    const result: number[] = [];
    for (const [compStr, v] of Object.entries(compPlan)) {
      if (!v || v.empty || !v.productId) continue;
      if (!availableIds.has(v.productId)) result.push(Number(compStr));
    }
    return result.sort((a, b) => a - b);
  }, [compPlan, terminalProducts]);

  // Auto-resolve flow: right after a preset load, open the first unavailable
  // comp's Edit Comp modal with the "Product Not Available" banner. Once
  // that specific comp is actually fixed (no longer in unavailableComps),
  // auto-advance to the next one. A dismiss without fixing stops the
  // auto-advance -- the driver can still resolve manually later, or just
  // hit LOAD and get the hard-block message below.
  const [checkAvailabilityNext, setCheckAvailabilityNext] = useState(false);
  const autoResolveActiveRef = useRef(false);
  const resolvingCompRef = useRef<number | null>(null);
  const prevCompModalOpenRef = useRef(false);

  useEffect(() => {
    if (!checkAvailabilityNext) return;
    setCheckAvailabilityNext(false);
    if (unavailableComps.length > 0) {
      const first = unavailableComps[0];
      autoResolveActiveRef.current = true;
      resolvingCompRef.current = first;
      setCompModalComp(first);
      setCompModalOpen(true);
      setSelectedComp(first);
    }
  }, [checkAvailabilityNext, unavailableComps]);

  useEffect(() => {
    const wasOpen = prevCompModalOpenRef.current;
    prevCompModalOpenRef.current = compModalOpen;
    if (!wasOpen || compModalOpen) return; // only on open -> closed
    if (!autoResolveActiveRef.current) return;

    const justClosedComp = resolvingCompRef.current;
    const stillUnavailable = justClosedComp != null && unavailableComps.includes(justClosedComp);
    if (stillUnavailable) {
      // Dismissed without fixing -- stop auto-advancing.
      autoResolveActiveRef.current = false;
      resolvingCompRef.current = null;
      return;
    }
    if (unavailableComps.length > 0) {
      const next = unavailableComps[0];
      resolvingCompRef.current = next;
      setCompModalComp(next);
      setCompModalOpen(true);
      setSelectedComp(next);
    } else {
      autoResolveActiveRef.current = false;
      resolvingCompRef.current = null;
    }
  }, [compModalOpen, unavailableComps]);

  // ── Driver Training (lead / admin only -- admins get "the planner used by
  // lead drivers", per explicit direction, not a toggle) ─────────────────────
  // Single-load model -- see CLAUDE.md. traineeId just tags whatever load
  // this session submits next; no second plan, no second load_log row.
  const canDriverTrain = shell.role === "lead" || shell.role === "admin" || shell.isSuperAdmin;
  const [traineeId, setTraineeId] = useState("");
  const [traineeName, setTraineeName] = useState("");
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);

  // Trainee-side mirror of the "Loading with X" banner above -- every
  // driver (not just leads) can be a trainee, so this checks unconditionally.
  // Deliberately simple polling, not a live subscription -- see CLAUDE.md's
  // "two devices, one physical load" open question; this is the "try the
  // simplest version first" cut, not a solved real-time sync problem.
  const [trainingLeadName, setTrainingLeadName] = useState<string | null>(null);
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    async function check() {
      const { data } = await supabase
        .from("load_log").select("user_id").eq("trainee_id", effectiveUserId).eq("status", "planned")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const leadUserId = (data as any)?.user_id ?? null;
      if (!leadUserId) { if (!cancelled) setTrainingLeadName(null); return; }
      const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: [leadUserId] });
      if (!cancelled) setTrainingLeadName((nameRows ?? [])[0]?.display_name ?? "your lead");
    }
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [effectiveUserId]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: effectiveUserId || null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedRackId: location.selectedRackId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows: effectivePlanRows, plannedGallonsTotal: effectivePlannedGallonsTotal, plannedWeightLbs: effectivePlannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
    onPostLoadComplete: planSlots.refreshLastLoad,
    predictedTempF: predictedFuelTempF,
    trainingTraineeId: traineeId || null,
    // Pass lastLoadedSlot (the preset actually loaded via a real tap), not
    // activeSlotLetter (the dial's cosmetic scroll position) -- see the
    // comment on lastLoadedSlot's declaration above for why. The hook's own
    // "activeSlotLetter" arg name/doc comment ("which named preset was
    // active when LOAD was tapped") already describes this value's real
    // meaning; left as-is inside useLoadWorkflow.ts to keep this a
    // page.tsx-only fix.
    activeSlotLetter: lastLoadedSlot,
  });

  // ── Incentive running-average card ────────────────────────────────────────
  // Left side is this load's own recovered points; right side is the
  // average recovered points per load across the current report period.
  // The old separate "You earned X points" confirmation line was removed
  // 2026-08-20 as redundant with this card's own "This Load" figure.
  // Running average uses the SAME report period the admin already
  // configures for the Period Report (pay_period_type/pay_period_anchor_date)
  // -- no separate averaging-period concept. Simplified 2026-08-17 per
  // explicit follow-up ("if we are keeping the report period and anchor
  // date thing we can just match the averaging period for the planner card
  // to that same period") -- this reverses the same-day decision to add an
  // independent, anchor-less averaging period. Whole card only renders once
  // incentive_settings.enabled is confirmed true for this company.
  const [incentiveEnabled, setIncentiveEnabled] = useState(false);
  const [payPeriodType, setPayPeriodType] = useState<PayPeriodType>("biweekly");
  const [payPeriodAnchorDate, setPayPeriodAnchorDate] = useState("");
  const [avgRecoveredPoints, setAvgRecoveredPoints] = useState<number | null>(null);

  useEffect(() => {
    if (!shell.companyId) { setIncentiveEnabled(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("incentive_settings")
        .select("enabled, pay_period_type, pay_period_anchor_date")
        .eq("company_id", shell.companyId)
        .maybeSingle();
      if (cancelled) return;
      setIncentiveEnabled(Boolean(data?.enabled));
      setPayPeriodType((data?.pay_period_type as PayPeriodType) ?? "biweekly");
      setPayPeriodAnchorDate((data?.pay_period_anchor_date as string | null) ?? new Date().toISOString().slice(0, 10));
    })();
    return () => { cancelled = true; };
  }, [shell.companyId]);

  // Refetches whenever a load actually completes (loadWorkflow.loadReport
  // changes) so the average reflects the just-finished load immediately,
  // not just on next mount.
  useEffect(() => {
    if (!incentiveEnabled || !effectiveUserId || !shell.companyId || !payPeriodAnchorDate) { setAvgRecoveredPoints(null); return; }
    let cancelled = false;
    (async () => {
      const periodStart = generatePayPeriods(payPeriodType, payPeriodAnchorDate, 1)[0]?.start;
      if (!periodStart) { setAvgRecoveredPoints(null); return; }
      const { data } = await supabase
        .from("load_points")
        .select("load_id, recovered_points")
        .eq("driver_id", effectiveUserId)
        .eq("company_id", shell.companyId)
        .gte("created_at", `${periodStart}T00:00:00Z`);
      if (cancelled) return;
      if (!data || data.length === 0) { setAvgRecoveredPoints(null); return; }
      // Sum per load first (a split load has one load_points row per
      // compartment), then average across distinct loads -- mirrors
      // PayrollReportModal.tsx's own totalPoints / loadIds.size pattern.
      const byLoad = new Map<string, number>();
      for (const row of data as any[]) {
        byLoad.set(row.load_id, (byLoad.get(row.load_id) ?? 0) + Number(row.recovered_points ?? 0));
      }
      const totals = Array.from(byLoad.values());
      const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
      setAvgRecoveredPoints(avg);
    })();
    return () => { cancelled = true; };
  }, [incentiveEnabled, payPeriodType, payPeriodAnchorDate, effectiveUserId, shell.companyId, loadWorkflow.loadReport]);

  // "Back to Planner" -- per explicit follow-up, this must genuinely undo
  // everything: no load logged AND the terminal card reverted to whatever
  // it was before this LOAD tap (not left at the fresh re-card the way
  // "Update Card, No Load" deliberately keeps). Cancels the load first
  // (closes the modal, deletes the load_log row), then restores the
  // captured pre-load access date -- or, if there was none, deletes the
  // row entirely so the terminal goes back to genuinely "not carded"
  // rather than picking some fallback date that was never real.
  const handleBackToPlannerNoUpdate = useCallback(async () => {
    setCancelLoadConfirmOpen(false);
    await loadWorkflow.cancelActiveLoad();
    const captured = preLoadCardedOnRef.current;
    preLoadCardedOnRef.current = null;
    if (!captured) return;
    if (captured.prevValue) {
      await terminals.setAccessDateForTerminal(captured.terminalId, captured.prevValue);
    } else {
      await terminals.deleteAccessDateForTerminal(captured.terminalId);
    }
  }, [loadWorkflow, terminals]);

  // Wired into CancelLoadSheet's new "Report Terminal Issue" flow -- see
  // CLAUDE.md "Terminal outage banners." Stays a thin call-through to the
  // actual write logic in useTerminalOutageReports.ts, matching how
  // handleBackToPlannerNoUpdate above is the only place that touches
  // loadWorkflow/terminals for its own concern.
  const handleSubmitOutageReport = useCallback(
    async (reportType: OutageReportType, productIds: string[]) => {
      const truckId = equipment.selectedCombo?.truck_id ?? "";
      const truckLabel = equipment.truckNameById[truckId] ?? truckId;
      return submitOutageReport({
        terminalId: String(location.selectedTerminalId || ""),
        selectedRackId: location.selectedRackId ? String(location.selectedRackId) : null,
        productIds,
        reportType,
        companyId: shell.companyId || "",
        userId: effectiveUserId || "",
        truckLabel,
      });
    },
    [equipment.selectedCombo, equipment.truckNameById, location.selectedTerminalId, location.selectedRackId, shell.companyId, effectiveUserId]
  );

  // Seed the Target/Actual/Diff summary from the last *completed* load for
  // this combo as soon as it's available (mount, or switching equipment) --
  // there's no "My Loads" button on this page anymore, so this is the only
  // way that summary ever gets populated outside of a load just finished in
  // this same session. Guarded so it never clobbers a fresher report (either
  // one this session just produced, or one restored via My Loads).
  useEffect(() => {
    if (planSlots.lastLoadReport && !loadWorkflow.loadReport) {
      loadWorkflow.setLoadReport(planSlots.lastLoadReport);
    }
    // Sync the preset dial's highlighted letter to match whichever preset
    // the just-restored plan actually came from. Guarded to fire once and
    // only while no genuine load action has happened yet this session
    // (lastLoadedSlot == null) -- previously gated on activeSlotLetter === 1,
    // which assumed an untouched dial always reads exactly 1, but a mere
    // scroll-preview (no tap) moves activeSlotLetter without loading
    // anything, silently breaking this guard before the DB round trip even
    // resolved. lastLoadedSlot is immune to scroll, so this fires reliably
    // regardless of dial timing.
    if (planSlots.lastLoadReport?.plan_slot && !presetDialSyncedRef.current && lastLoadedSlot == null) {
      presetDialSyncedRef.current = true;
      setLastLoadedSlot(planSlots.lastLoadReport.plan_slot);
      setActiveSlotLetter(planSlots.lastLoadReport.plan_slot);
      setPresetDialSyncTo(planSlots.lastLoadReport.plan_slot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlots.lastLoadReport]);

  // "Recall Last Load" card: captures exactly what was live the instant
  // loadReport became set -- either the state a fresh mount just restored
  // from the last completed load (compPlan + CG, see usePlanSlots.ts's
  // restoreCg fix), or the plan the driver just actually submitted this
  // session. Compared against current live state below (recapValid) to
  // decide whether the card's numbers still mean anything -- see that
  // memo's own comment for why this replaced the old "always show the
  // last load's numbers, label says whether they're live" design.
  //
  // Real state, not a ref: a ref mutation doesn't trigger a re-render, so
  // recapValid's comparison below would never re-run right after this was
  // captured (only on some LATER, unrelated state change) -- the classic
  // ref-vs-state trap, caught live before shipping (recapValid stayed
  // false forever otherwise, even the instant after a perfectly matching
  // baseline was captured).
  type RecapBaseline = { compPlanJSON: string; cgSlider: number; comboId: string; terminalId: string; rackId: string };
  const [recapBaseline, setRecapBaseline] = useState<RecapBaseline | null>(null);
  const prevLoadReportRef = useRef<typeof loadWorkflow.loadReport>(null);
  useEffect(() => {
    if (loadWorkflow.loadReport && loadWorkflow.loadReport !== prevLoadReportRef.current) {
      setRecapBaseline({
        compPlanJSON: JSON.stringify(compPlan),
        cgSlider,
        comboId: String(equipment.selectedComboId || ""),
        terminalId: String(location.selectedTerminalId || ""),
        rackId: String(location.selectedRackId || ""),
      });
    }
    prevLoadReportRef.current = loadWorkflow.loadReport;
  }, [loadWorkflow.loadReport, compPlan, cgSlider, equipment.selectedComboId, location.selectedTerminalId, location.selectedRackId]);

  // False the moment ANYTHING about the live plan drifts from the baseline
  // captured above -- product swapped, cap dragged, CG moved, equipment or
  // terminal/rack changed. Per explicit direction: rather than a label
  // that says "this is historical, not live" (tried already, still read as
  // ambiguous), the numbers themselves disappear the instant they'd be
  // wrong -- if they're showing, they're guaranteed accurate to the
  // current plan, full stop.
  const recapValid =
    !!recapBaseline &&
    !!loadWorkflow.loadReport &&
    recapBaseline.compPlanJSON === JSON.stringify(compPlan) &&
    recapBaseline.cgSlider === cgSlider &&
    recapBaseline.comboId === String(equipment.selectedComboId || "") &&
    recapBaseline.terminalId === String(location.selectedTerminalId || "") &&
    recapBaseline.rackId === String(location.selectedRackId || "");


  // ── Terminal filters / expirations ────────────────────────────────────────
  // Also shared via context (see above) -- myTerminalIdSet, terminalFilters,
  // expirations all come from `shell` now.
  const { myTerminalIdSet, terminalFilters } = shell;
  const { catalogTerminalsInCity } = terminalFilters;

  // Fetch terminal access dates for city terminals
  useEffect(() => {
    (async () => {
      if (!authUserId || !location.selectedState || !location.selectedCity) return;
      const ids = catalogTerminalsInCity.map((t) => String(t.terminal_id));
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("terminal_access").select("terminal_id, carded_on")
        .eq("user_id", effectiveUserId).in("terminal_id", ids);
      if (error) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r?.terminal_id && r?.carded_on) map[String(r.terminal_id)] = String(r.carded_on); });
      // Note: access date map lives in useTerminals; this local fetch augments the catalog view
    })();
  }, [authUserId, location.selectedState, location.selectedCity, catalogTerminalsInCity]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const terminalLabel = useMemo(() => {
    if (!location.selectedTerminalId) return undefined;
    const t = terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId));
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [terminals.terminals, terminals.terminalCatalog, location.selectedTerminalId]);

  const selectedTerminal = useMemo(
    () => terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId)) ?? null,
    [terminals.terminals, location.selectedTerminalId]
  );

  // For display name only — also check catalog for terminals not yet visited
  const selectedTerminalAny = useMemo(
    () => selectedTerminal
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? null,
    [selectedTerminal, terminals.terminalCatalog, location.selectedTerminalId]
  );

  const terminalDisplayISO = useMemo(() => {
    if (!selectedTerminal) return null; // needs full TerminalRow for expiry calc
    return terminals.terminalDisplayInfo(selectedTerminal, location.selectedTerminalId);
  }, [selectedTerminal, terminals, location.selectedTerminalId]);

  const terminalCardedText = terminalDisplayISO ? formatMDYWithCountdown_(terminalDisplayISO) : undefined;
  const terminalCardedClass = terminalCardedText
    ? (isPastISO_(terminalDisplayISO!) ? "text-red-500" : "text-white/50") : undefined;

  // ── lastProductInfoById ────────────────────────────────────────────────────
// IMPORTANT: derive from `terminalProducts` because that list is refreshed after LOADED.
const lastProductInfoById = useMemo(() => {
  const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
  for (const p of terminalProducts) {
    const pid = String((p as any).product_id ?? "");
    if (!pid) continue;
    out[pid] = {
      last_api: (p as any).last_api ?? null,
      last_api_updated_at: (p as any).last_api_updated_at ?? null,
    };
  }
  return out;
}, [terminalProducts]);

  // ── Placard data ──────────────────────────────────────────────────────────


  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // Per-product rows for the Temp modal's product list (dot + name + own
  // temp, tap to adjust just that one) -- same shape as LoadingModal's own
  // planned-compartments/product-groups rows, for visual continuity.
  const tempModalProductGroups = useMemo(() => {
    return Array.from(plannedProductIds)
      .map((pid) => ({
        productId: pid,
        name: productNameById.get(pid) ?? pid,
        hex: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
        tempF: productTempF[pid] ?? tempF,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plannedProductIds, productNameById, productHexCodeById, productTempF, tempF]);

  // City starring, stateOptions/selectedStateLabel/selectedStateName/cities/
  // topCities/allCities all live in shell now (see the destructure above) --
  // TerminalCatalogModal below is Planner-only dead code (never opened, see
  // this file's own git history) so its starBtnClass stays local; nothing
  // else here needs a second copy of the picker-list logic.
  const starBtnClass = (active: boolean) =>
    ["h-8 w-8 flex items-center justify-center rounded-lg border transition",
      active ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80"].join(" ");

  // ── Plan styles ────────────────────────────────────────────────────────────
  const planStyles = useMemo(() => ({
    ...styles,
    smallBtn: { ...styles.smallBtn, padding: "10px 14px", minWidth: 112, borderRadius: 14, letterSpacing: "0.4px" },
    badge: { ...styles.badge, marginRight: 10 },
  }), []);

  // ── Derived load state ─────────────────────────────────────────────────────
  // unavailableComps is deliberately NOT folded into loadDisabled -- per
  // spec, tapping LOAD while it's non-empty should produce an explicit
  // "Cannot Load" message (see loadBlockedMsg below), not just a silently
  // inert button, so a driver who ignores the compartment-bar warning still
  // gets told exactly why.
  const loadDisabled =
    loadWorkflow.beginLoadBusy ||
    !equipment.selectedComboId ||
    !location.selectedTerminalId ||
    !location.selectedState ||
    !location.selectedCity ||
    !location.selectedCityId ||
    planRows.length === 0;

  const [loadBlockedMsg, setLoadBlockedMsg] = useState<string | null>(null);
  useEffect(() => {
    if (unavailableComps.length === 0) setLoadBlockedMsg(null);
  }, [unavailableComps]);

  // "RELOAD" means "the plan I'm about to submit is the same one already on
  // file as the last load" -- tracks recapValid (the live plan genuinely
  // matching the last completed load), not just "a last load exists at
  // all" (loadWorkflow.loadReport, which stays set from history even after
  // the driver has built a totally different plan -- that's what made this
  // say RELOAD for a brand new plan; caught live, not the original design).
  const loadLabel = loadWorkflow.beginLoadBusy ? "Loading…"
    : loadWorkflow.activeLoadId ? "Load started"
    : recapValid ? "RELOAD"
    : "LOAD";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Admin setup session banner */}
      {setupSession && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", marginBottom: 8, borderRadius: 12, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.30)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fb923c", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Setting up planner for</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginTop: 1 }}>{setupSession.targetDisplayName}</div>
          </div>
          <button type="button"
            onClick={() => {
              clearSetupSession();
              // Hard navigation -- when returnTo stays inside the
              // /planner layout (e.g. "/planner/dispatch"),
              // CalculatorShellProvider never unmounts on a router.push, so
              // it never re-reads sessionStorage and the just-cleared
              // session would silently stick (confirmed live: the "Setting
              // up planner for" banner stayed visible after this click).
              // Same fix as the Dispatch tab's own "Use app as X" entry
              // point, applied symmetrically to the exit.
              window.location.href = setupSession.returnTo ?? "/admin";
            }}
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(251,146,60,0.40)", background: "rgba(251,146,60,0.15)", color: "#fb923c", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            ← Return to {setupSession.returnTo === "/planner/dispatch" ? "Dispatch" : "Admin"}
          </button>
        </div>
      )}

      {trainingLeadName && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", marginBottom: 8, borderRadius: 12, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Training with {trainingLeadName}</span>
        </div>
      )}

      {/* Preset dial -- sits directly under the Planner/Cards/Vault tab bar,
          per the design handoff (Preset dial is listed first in the
          Planner tab's content, above the compartment strip). */}
      <div>
        <PresetDial
          slots={planSlots.PLAN_SLOTS}
          slotHas={planSlots.slotHas}
          // Also gated on presetsReady -- until the initial server sync for
          // this equipment combo has actually completed, a slot that reads
          // "empty" might just be unsynced, not really empty, and PresetDial
          // treats a tap on an empty slot as an implicit save. Interacting
          // during that window silently overwrote real presets with
          // whatever was on-screen at the time -- see usePlanSlots.ts.
          disabled={!location.selectedTerminalId || !planSlots.presetsReady}
          disabledReason={!location.selectedTerminalId ? "Select a terminal first" : "Syncing presets…"}
          onLoad={(n) => {
            planSlots.loadFromSlot(n);
            setLastLoadedSlot(n);
            setCaptureBaselineNext(true);
            setCheckAvailabilityNext(true);
          }}
          onOpenActions={(n) => setPresetSheetSlot(n)}
          onSave={(n) => { planSlots.saveToSlot(n); setBaselineOverrides(overridesSnapshot(compPlan, cgSlider)); }}
          onActiveChange={setActiveSlotLetter}
          syncTo={presetDialSyncTo}
        />
      </div>

      <PresetActionSheet
        open={presetSheetSlot != null}
        letter={presetSheetSlot != null ? String.fromCharCode(64 + presetSheetSlot) : ""}
        summary={presetSheetSummary}
        onLoad={() => {
          if (presetSheetSlot != null) {
            planSlots.loadFromSlot(presetSheetSlot);
            setLastLoadedSlot(presetSheetSlot);
            setCaptureBaselineNext(true);
            setCheckAvailabilityNext(true);
          }
          setPresetSheetSlot(null);
        }}
        onConfirmEdit={() => {
          if (presetSheetSlot != null) {
            planSlots.saveToSlot(presetSheetSlot);
            setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
          }
          setPresetSheetSlot(null);
        }}
        onConfirmClear={() => {
          if (presetSheetSlot != null) planSlots.clearSlot(presetSheetSlot);
          setPresetSheetSlot(null);
        }}
        onClose={() => setPresetSheetSlot(null)}
      />

      {/* Action row -- left: "Save plan {letter}" once a temporary cap
          override exists anywhere (a concrete "diverges from saved" signal);
          right: "Edit Comp N Product" once a compartment bar has been
          tapped/selected. Both above the compartment strip. */}
      {(() => {
        const currentOverrides = overridesSnapshot(compPlan, cgSlider);
        const isDirty = currentOverrides !== baselineOverrides;
        const activeLetter = String.fromCharCode(64 + activeSlotLetter);
        if (!isDirty && selectedComp == null) return null;
        return (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, minHeight: 18 }}>
            <div>
              {isDirty && (
                <button type="button"
                  onClick={() => { planSlots.saveToSlot(activeSlotLetter); setBaselineOverrides(currentOverrides); }}
                  style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Save plan {activeLetter}
                </button>
              )}
            </div>
            <div>
              {selectedComp != null && (
                <button type="button"
                  onClick={() => { setCompModalComp(selectedComp); setCompModalOpen(true); }}
                  style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Edit Comp {selectedComp} Product
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <PlannerControls
        styles={styles}
        selectedTrailerId={selectedTrailerId}
        compLoading={compLoading}
        compartments={compartments}
        compError={compError}
        persistedCapForComp={persistedCapForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        plannedGallonsByComp={plannedGallonsByComp}
        compPlan={compPlan}
        setCompPlan={setCompPlan}
        terminalProducts={terminalProducts}
        selectedComp={selectedComp}
        onSelectComp={(n: number) => {
          if (!location.selectedTerminalId) return;
          setSelectedComp(n);
        }}
        selectedTerminalId={location.selectedTerminalId ?? ""}
      />

      <CompartmentModal
        open={compModalOpen}
        compNumber={compModalComp}
        compartments={compartments}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        styles={styles}
        setCompPlan={setCompPlan}
        onClose={() => { setCompModalOpen(false); setCompModalComp(null); setSelectedComp(null); }}
        selectedRackId={location.selectedRackId ?? ""}
        rackName={selectedRackName}
        terminalName={terminalLabel}
        onTerminalProductsChanged={fetchTerminalProducts}
        myRole={shell.role}
      />

      {/* CG Slider — always visible */}
      <div style={{ marginTop: 8 }}>
        {unstableLoad && (
          <div style={{ ...styles.error, marginTop: 0, marginBottom: 10, textAlign: "center" }}>
            ⚠️ Unstable load (rear of neutral)
          </div>
        )}
        <style jsx global>{`
          input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; height: 24px; }
          input.cgRange:focus { outline: none; }
          input.cgRange::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -9px; background: transparent; border: none; opacity: 0; }
          input.cgRange::-moz-range-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-moz-range-thumb { width: 22px; height: 22px; background: transparent; border: none; opacity: 0; }
        `}</style>
        <div style={{ position: "relative", width: "100%" }}>
          <input type="range" className="cgRange" min={0} max={1} step={0.005} value={cgSlider}
            onChange={(e) => setCgSlider(Number(e.target.value))}
            style={{ width: "100%" }} disabled={!equipment.selectedCombo}
          />
          {/* Puck — themed fill (light gray / dark graphite / custom accent), no label, centered on the 4px track */}
          <div aria-hidden style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 22, height: 22,
            borderRadius: "50%",
            background: themeFill(shell.theme.darkMode, shell.theme.accentColor, "#d9d9d9"),
            pointerEvents: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px", marginTop: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Rear</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Front</span>
        </div>
      </div>

      {/* ── Info cards, Load button, Load summary ── */}
      {(() => {
        const { loadReport } = loadWorkflow;

        // This card recalls the last completed load -- see recapValid above
        // for the full reasoning. Its numbers only ever show real, accurate
        // figures: exactly what was loaded, for as long as the live plan
        // still matches it exactly (product, gallons, CG, equipment,
        // terminal, rack); the instant any of that drifts, they dash out
        // rather than keep displaying a number that's no longer true.
        // Gallons alone still falls back to the live plan when there's no
        // completed load at all yet (pre-existing behavior, e.g. a brand
        // new combo -- nothing to recall yet, so nothing to invalidate).
        const plannedGal = loadReport
          ? (recapValid ? loadReport.planned_total_gal : null)
          : (planRows.length ? plannedGallonsTotal : null);
        const plannedGalText = plannedGal == null ? "—" : `${Math.round(plannedGal).toLocaleString()} gal`;
        const targetLbs = loadReport && recapValid ? loadReport.planned_gross_lbs : null;
        const targetText = targetLbs == null ? "—" : `${Math.round(targetLbs).toLocaleString()} lbs`;
        const actualLbs = loadReport && recapValid ? loadReport.actual_gross_lbs : null;
        const actualText = actualLbs == null ? "—" : `${Math.round(actualLbs).toLocaleString()} lbs`;
        const diff = loadReport && recapValid ? loadReport.diff_lbs ?? null : null;
        const diffText = diff == null ? "—" : `${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()} lbs`;
        const diffColor = diff == null ? "rgba(255,255,255,0.85)" : diff > 0 ? "#ef4444" : "#4ade80";

        // Always present (and tappable) whenever there's a completed load to
        // recall at all -- but the text itself now tracks recapValid: while
        // the numbers below are genuinely showing the last load ("Recap"),
        // full detail (which plan, when) is worth surfacing; once they've
        // dashed out, the plan/date/time detail would describe numbers that
        // are no longer even visible, so it collapses to a bare action.
        const recapLabel = loadReport
          ? (recapValid
              ? `Recap${loadReport.plan_slot ? ` · Plan ${String.fromCharCode(64 + loadReport.plan_slot)}` : ""}${loadReport.completed_at ? ` · ${formatMDYWithTime_(loadReport.completed_at)}` : ""}`
              : "Recall Last Load")
          : null;

        // Actual weight, colored against this combo's own target and the
        // fixed 80,000 lb federal legal limit (same threshold LoadReportModal
        // already uses for its "drain to 80k" line).
        const LEGAL_GROSS_LBS = 80000;
        const actualGross = actualLbs;
        const actualColor =
          actualGross == null || !(targetWeight > 0) ? "#fff"
          : actualGross >= LEGAL_GROSS_LBS ? "#ef4444"
          : actualGross >= targetWeight ? "#4ade80"
          : "#fff";

        // isOverride = user manually moved temp away from prediction after it auto-applied
        const isOverride = userAdjustedTempRef.current && predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) > 0.5;
        const isHighConfidence = !isOverride && fuelTempConfidence === "high";
        const tempPrimaryColor = isHighConfidence ? "rgba(255,255,255,0.55)" : "#fff";
        const tempSubColor = isOverride ? "#fb923c"
          : fuelTempConfidence === "high"   ? "#4ade80"
          : fuelTempConfidence === "medium" ? "#eab308"
          : fuelTempConfidence === "low"    ? "#ef4444"
          : "rgba(255,255,255,0.35)";
        const tempSubLabel = isOverride ? "Manual override"
          : fuelTempConfidence === "high"   ? "High confidence"
          : fuelTempConfidence === "medium" ? "Medium confidence"
          : fuelTempConfidence === "low"    ? "Low confidence"
          : "—";
        const tempBgAlpha = fuelTempConfidence === "high" ? 0.02 : fuelTempConfidence === "medium" ? 0.045 : 0.07;

        const locationLabel = location.locationLabel ?? null;
        const locationSelected = Boolean(location.selectedCity && location.selectedState);
        const terminalSelected = Boolean(location.selectedTerminalId);
        const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
        const cardNum = tid ? (cardDataByTerminalId[tid]?.cardNumber ?? "") : "";
        const expiryDays = terminalDisplayISO ? daysUntilISO_(terminalDisplayISO) : null;
        const expirationSub = expiryDays != null ? `Exp. ${expiryDays} days` : null;

        const infoCard: React.CSSProperties = {
          borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)", padding: "10px 14px",
          // Explicit "none" -- without it, framer-motion's shared layoutId
          // transition from SetupGate's cyan-glow CTA (boxShadow:
          // "0 0 0 4px rgba(103,232,249,0.10)") leaves that glow as a
          // permanent residual inline style on this button once the gate
          // closes, since nothing here ever told it what to animate back to.
          boxShadow: "none",
        };
        const chevron: React.CSSProperties = { fontSize: 16, color: "rgba(255,255,255,0.25)", flexShrink: 0 };

        const hasEquipment = Boolean(equipment.selectedCombo);

        return (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Equipment card — two-up Truck / Trailer */}
            {(() => {
              const equipBtnProps = {
                type: "button" as const,
                onClick: () => setEquipOpen(true),
                style: { ...infoCard, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", textAlign: "left" as const },
              };
              const children = !hasEquipment ? (
                <>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Select Equipment</span>
                  <span style={chevron}>›</span>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", flex: 1, gap: 20, minWidth: 0 }}>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        Truck{equipmentDetails.truckName ? ` · ${equipmentDetails.truckName}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {equipmentDetails.truckMake || " "}
                      </div>
                    </div>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        Trailer{equipmentDetails.trailerName ? ` · ${equipmentDetails.trailerName}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {equipmentDetails.trailerMake || " "}
                      </div>
                    </div>
                  </div>
                  <span style={chevron}>›</span>
                </>
              );
              return mounted ? (
                <motion.button {...equipBtnProps} layoutId="setup-equipment-btn">{children}</motion.button>
              ) : (
                <button {...equipBtnProps}>{children}</button>
              );
            })()}

            {/* Location / Terminal card — one undivided button, same shape as
                Equipment/Temp/Load. Steps through Location -> Terminal; once
                a location is set the button always opens the terminal picker
                (re-opening Location itself happens from a "Change" link
                inside that picker, not a second tap zone here). */}
            {(() => {
              const step: "location" | "terminal" = locationSelected ? "terminal" : "location";
              const locTermBtnProps = {
                type: "button" as const,
                onClick: () => {
                  if (step === "location") setLocOpen(true);
                  else setTermOpen(true);
                },
                style: { ...infoCard, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", textAlign: "left" as const },
              };
              const children = step === "location" ? (
                <>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Select Location</span>
                  <span style={chevron}>›</span>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", flex: 1, gap: 20, minWidth: 0 }}>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {locationLabel ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {cardNum ? `Card # ${cardNum}` : " "}
                      </div>
                    </div>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: terminalSelected ? "#fff" : "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {terminalSelected ? (terminalLabel ?? "Terminal") : "Select terminal"}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {expirationSub ?? " "}
                      </div>
                    </div>
                    {/* Rack, same column pattern as terminal -- hidden for
                        "Main Rack" (the invisible default every terminal
                        gets, see CLAUDE.md "rack-aware loading, unified"),
                        shown only for a real, named, multi-rack facility. */}
                    {terminalSelected && selectedRackName && selectedRackName !== "Main Rack" && (
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {selectedRackName}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}> </div>
                      </div>
                    )}
                  </div>
                  <span style={chevron}>›</span>
                </>
              );
              return mounted ? (
                <motion.button {...locTermBtnProps} layoutId={step === "location" ? "setup-location-btn" : "setup-terminal-btn"}>{children}</motion.button>
              ) : (
                <button {...locTermBtnProps}>{children}</button>
              );
            })()}

            {/* Temp confidence card */}
            <button type="button" onClick={() => setTempDialOpen(true)}
              style={{
                borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
                background: `rgba(255,255,255,${tempBgAlpha})`, padding: "10px 14px", width: "100%",
                textAlign: "left" as const, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: tempPrimaryColor }}>
                  {Math.round(tempF)}°F predicted product temp
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: tempSubColor, marginTop: 2 }}>{tempSubLabel}</div>
              </div>
              <span style={chevron}>›</span>
            </button>

            {/* Load button */}
            <button type="button"
              onClick={() => {
                if (unavailableComps.length > 0) {
                  setLoadBlockedMsg(`Cannot Load, all planned products are not available at ${terminalLabel || "this terminal"}`);
                  return;
                }
                preLoadCardedOnRef.current = {
                  terminalId: location.selectedTerminalId,
                  prevValue: terminals.accessDateByTerminalId[location.selectedTerminalId] ?? null,
                };
                loadWorkflow.beginLoadToSupabase();
              }}
              disabled={loadDisabled}
              style={{
                borderRadius: 6, border: "none", background: themeFill(shell.theme.darkMode, shell.theme.accentColor), padding: "10px 14px", width: "100%",
                cursor: loadDisabled ? "not-allowed" : "pointer", opacity: loadDisabled ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: themeTextOnFill(shell.theme.darkMode), letterSpacing: 0.3 }}>{loadLabel}</span>
            </button>

            {loadBlockedMsg && (
              <div style={{ ...styles.error, textAlign: "center" as const }}>{loadBlockedMsg}</div>
            )}

            {canDriverTrain && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setTrainingModalOpen(true)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
                >
                  Driver Training
                </button>
                {traineeName && (
                  <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
                    Loading with {traineeName}
                    <button
                      type="button"
                      onClick={() => { setTraineeId(""); setTraineeName(""); }}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer", marginLeft: 6, padding: 0 }}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Load summary -- recalls the last COMPLETED load, see
                recapValid's comment above for the full reasoning. */}
            <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.03)", padding: "10px 14px" }}>
              {recapLabel && (
                <button
                  type="button"
                  onClick={async () => {
                    // planSlots.recallLastLoad() applies the DB snapshot
                    // live and directly (compPlan + CG), unconditionally --
                    // see that function's own comment for why a plain
                    // reload was tried first and found unreliable (races
                    // against this hook's own mount-time restore effects).
                    // Its return value has to be pushed into loadWorkflow
                    // here explicitly -- the effect that normally syncs
                    // planSlots.lastLoadReport into loadWorkflow.loadReport
                    // only ever fires once, on first mount.
                    const report = await planSlots.recallLastLoad();
                    if (report) loadWorkflow.setLoadReport(report);
                  }}
                  style={{
                    background: "none", border: "none", padding: 0, marginBottom: 6, cursor: "pointer",
                    fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                    textTransform: "uppercase" as const, letterSpacing: 0.4, textAlign: "left" as const,
                  }}
                >
                  {recapLabel}
                </button>
              )}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{plannedGalText}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: actualColor, textAlign: "right" as const }}>{actualText}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "right" as const }}>
                  Target {targetText} · <span style={{ color: diffColor, fontWeight: 600 }}>Diff {diffText}</span>
                </div>
              </div>
              {planUsesReferenceApi && planRows.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", marginTop: 4 }}>⚠ using ref API</div>
              )}
            </div>

            {/* Incentive running-average card -- see the effects that
                compute incentiveEnabled/payPeriodType/avgRecoveredPoints
                above. Only rendered once the company has actually turned
                the incentive system on. */}
            {incentiveEnabled && (
              <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.03)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>This Load</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#4ade80" }}>
                    {loadReport?.recovered_points != null ? loadReport.recovered_points.toFixed(1) : "—"} pts
                  </div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
                    {PERIOD_TYPE_LABELS[payPeriodType]} Avg
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                    {avgRecoveredPoints != null ? `${avgRecoveredPoints.toFixed(1)} pts` : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* Footnote */}
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", textAlign: "center" as const, lineHeight: 1.4 }}>
              Product API & temp confirm automatically after this load, sharpening the number for the next driver at this terminal.
            </div>

          </div>
        );
      })()}


      <SetupGate
        comboSelected={!!equipment.selectedComboId}
        locationSelected={!!(location.selectedState && location.selectedCity)}
        terminalSelected={!!location.selectedTerminalId}
        equipmentLabel={equipment.equipmentLabel}
        locationLabel={location.locationLabel}
        terminalLabel={terminalLabel}
        onOpenEquipment={() => setEquipOpen(true)}
        onOpenLocation={() => setLocOpen(true)}
        onOpenTerminal={() => setTermOpen(true)}
      />

      {/* ── Modals ── */}
      <DriverTrainingModal
        open={trainingModalOpen}
        onClose={() => setTrainingModalOpen(false)}
        companyId={shell.companyId}
        excludeUserId={effectiveUserId}
        onPick={(id, name) => { setTraineeId(id); setTraineeName(name); }}
      />
      <LoadingModal
        open={loadWorkflow.loadingOpen} onClose={() => setCancelLoadConfirmOpen(true)}
        styles={styles}
        planRows={effectivePlanRows as any[]}
        productNameById={productNameById}
        productHexCodeById={productHexCodeById}
        productInputs={productInputs}
        terminalTimeZone={selectedTerminalTimeZoneResolved}
        lastProductInfoById={lastProductInfoById}
        setProductApi={(productId, api) => setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }))}
        setProductTemp={(productId, tempF) => setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), tempF } }))}
        onSetCompartmentGallons={(comp, gallons) => setLoadingGallonsOverride((prev) => ({ ...prev, [comp]: gallons }))}
        persistedCapForComp={persistedCapForComp}
        livePreviewGrossLbs={livePreviewGrossLbs}
        livePreviewDiffLbs={livePreviewDiffLbs}
        targetWeight={targetWeight}
        onLoaded={() => setCancelLoadConfirmOpen(true)}
        onBackToPlanner={handleBackToPlannerNoUpdate}
        loadedDisabled={loadWorkflow.completeBusy}
        loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "Complete"}
      />

      <CancelLoadSheet
        open={cancelLoadConfirmOpen}
        onDismiss={() => setCancelLoadConfirmOpen(false)}
        onBackToPlanner={handleBackToPlannerNoUpdate}
        onLogTheLoad={() => { setCancelLoadConfirmOpen(false); loadWorkflow.onLoadedFromLoadingModal(); }}
        onUpdateCardOnly={() => { setCancelLoadConfirmOpen(false); loadWorkflow.cancelActiveLoad(); }}
        darkMode={shell.theme.darkMode}
        accentColor={shell.theme.accentColor}
        planRows={effectivePlanRows as any[]}
        productNameById={productNameById}
        onSubmitOutageReport={handleSubmitOutageReport}
      />

      <ProductTempModal
        open={tempDialOpen}
        onClose={() => setTempDialOpen(false)}
        styles={styles}
        selectedCity={location.selectedCity}
        selectedState={location.selectedState}
        selectedTerminalId={location.selectedTerminalId}
        ambientTempLoading={fuelTempLoading && fuelTempAmbientF == null}
        ambientTempF={fuelTempAmbientF}
        tempF={tempF}
        setTempF={setTempF}
        productGroups={tempModalProductGroups}
        onSetProductTemp={setSingleProductTempF}
        predictedFuelTempF={predictedFuelTempF}
        fuelTempConfidence={fuelTempConfidence}
        fuelTempLoading={fuelTempLoading}
        TempDial={TempDial}
      />

      {/* LocationModal/MyTerminalsModal now mount once in ShellChrome (see
          CalculatorLayoutClient.tsx) -- shared with the Terminal tab's own
          identity header, both reading/writing the one shell.location. */}

      <TerminalCatalogModal
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); setTermOpen(true); }}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        termError={terminals.termError}
        catalogError={terminals.catalogError}
        catalogTerminalsInCity={catalogTerminalsInCity}
        myTerminalIds={myTerminalIdSet}
        setMyTerminalIds={() => {}}
        catalogExpandedId={catalogExpandedId}
        setCatalogExpandedId={setCatalogExpandedId}
        catalogEditingDateId={catalogEditingDateId}
        setCatalogEditingDateId={setCatalogEditingDateId}
        accessDateByTerminalId={terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={terminals.setAccessDateForTerminal}
        isoToday_={(tz) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); return `${p.find(x=>x.type==="year")?.value}-${p.find(x=>x.type==="month")?.value}-${p.find(x=>x.type==="day")?.value}`; }}
        toggleTerminalStar={terminals.toggleTerminalStar}
        starBtnClass={starBtnClass}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        setCatalogOpen={setCatalogOpen}
        setTermOpen={setTermOpen}
      />
    </div>
  );
}
