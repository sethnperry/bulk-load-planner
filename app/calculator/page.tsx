"use client";
import NavMenu from "@/lib/ui/NavMenu";
import { getSetupSession, clearSetupSession } from "@/lib/setupSession";
import type { SetupSession } from "@/lib/setupSession";
import { useRouter } from "next/navigation";
import { useTour } from "./hooks/useTour";
import TourOverlay from "./components/TourOverlay";
import ExpirationAlertBar from "./components/ExpirationAlertBar";
import ExpirationModal from "./modals/ExpirationModal";
import { useExpirations } from "./hooks/useExpirations";

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

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useEquipment } from "./hooks/useEquipment";
import { useLocation } from "./hooks/useLocation";
import { useTerminals } from "./hooks/useTerminals";
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { usePlanRows } from "./hooks/usePlanRows";
import { useTerminalFilters } from "./hooks/useTerminalFilters";
import { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";
import { useLoadHistory } from "./hooks/useLoadHistory";

// ── Sections ───────────────────────────────────────────────────────────────────
import PlannerControls from "./sections/PlannerControls";

// ── Modals ─────────────────────────────────────────────────────────────────────
import EquipmentModal from "./modals/EquipmentModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import LoadingModal from "./modals/LoadingModal";
import MyLoadsModal from "./modals/MyLoadsModal";
import LoadReportModal from "./modals/LoadReportModal";
import ProductTempModal from "./modals/ProductTempModal";
import TempDialModal from "./modals/TempDialModal";
import CompartmentModal from "./modals/CompartmentModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import { cgSliderToBias, bestLbsPerGallon, planForGallons, CG_NEUTRAL } from "./utils/planMath";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow, TerminalProductMetaRow } from "./types";


// ─── Local UI helpers ─────────────────────────────────────────────────────────

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));



// SVG arc helpers
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// TempDial component (unchanged, kept local — can be moved to sections/ if it grows)
type TempDialProps = { value: number; min: number; max: number; step: number; onChange: (v: number) => void };

function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const sweepStart = -135;
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const valueToAngle = useCallback((v: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    return clampNum(anchorAngle + (clampNum(v, min, max) - 60) * degPerUnit, sweepStart, sweepEnd);
  }, [min, max, sweep, sweepStart, sweepEnd]);

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

  const angle = valueToAngle(value);
  const rad = (angle * Math.PI) / 180;
  const knobX = 120 + Math.cos(rad) * 92;
  const knobY = 120 + Math.sin(rad) * 92;

  return (
    <div ref={ref} style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: "1/1", borderRadius: 24, background: "transparent", position: "relative", touchAction: "none" }}
      onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); setDragging(true); setFromPointer(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (!dragging) return; setFromPointer(e.clientX, e.clientY); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%" }}>
        <circle cx="120" cy="120" r="106" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="rgb(0,194,216)" strokeWidth="2" />
        <path d={describeArc(120, 120, 92, sweepStart, sweepEnd)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" strokeLinecap="round" />
        <circle cx={knobX} cy={knobY} r="9" fill="rgba(255,255,255,0.88)" />
        <circle cx={knobX} cy={knobY} r="4" fill="rgb(0,194,216)" />
      </svg>
      <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontWeight: 900, fontSize: 14, color: "rgba(255,255,255,0.72)", pointerEvents: "none" }}>60°F</div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -0.6 }}>{value.toFixed(1)}°F</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────


export default function CalculatorPage() {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [setupSession, setSetupSession] = useState<SetupSession | null>(null);
  const router = useRouter();
  const effectiveUserId = setupSession?.targetUserId ?? authUserId ?? "";

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAuthEmail(data.user?.email ?? "");
      setAuthUserId(data.user?.id ?? "");
    })();
    const session = getSetupSession();
    if (session) setSetupSession(session);
  }, []);

  // ── Card data (card number + private note, per terminal, per user) ──────────
  const [cardDataByTerminalId, setCardDataByTerminalId] =
    useState<Record<string, { cardNumber: string; privateNote: string }>>({});

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      if (setupSession) {
        const { getCardData } = await import("@/lib/adminSetupClient");
        const r = await getCardData(effectiveUserId);
        setCardDataByTerminalId(r.cardDataByTerminalId);
      } else {
        const { data } = await supabase
          .from("user_terminal_cards")
          .select("terminal_id, card_number, private_note")
          .eq("user_id", effectiveUserId);
        if (data) {
          const map: Record<string, { cardNumber: string; privateNote: string }> = {};
          for (const row of data) {
            map[String(row.terminal_id)] = {
              cardNumber: row.card_number ?? "",
              privateNote: row.private_note ?? "",
            };
          }
          setCardDataByTerminalId(map);
        }
      }
    })();
  }, [effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCardDataForTerminal_ = async (
    terminalId: string,
    data: { cardNumber: string; privateNote: string }
  ) => {
    setCardDataByTerminalId(prev => ({ ...prev, [terminalId]: data }));
    if (!effectiveUserId) return;
    if (setupSession) {
      const { setCardData } = await import("@/lib/adminSetupClient");
      await setCardData(effectiveUserId, terminalId, data.cardNumber, data.privateNote);
    } else {
      await supabase.from("user_terminal_cards").upsert(
        {
          user_id: effectiveUserId,
          terminal_id: terminalId,
          card_number: data.cardNumber,
          private_note: data.privateNote,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,terminal_id" }
      );
    }
  };

  // ── Modal open/close flags ─────────────────────────────────────────────────
  const [equipOpen, setEquipOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
  const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  const [tempDial2Open, setTempDial2Open] = useState(false);
  const [tempDial2ProductId, setTempDial2ProductId] = useState<string | null>(null);

  // ── Feature hooks ──────────────────────────────────────────────────────────
  const equipment = useEquipment(authUserId, setupSession);
  const location = useLocation(effectiveUserId);

  // selectedTerminalTimeZone removed — use selectedTerminalTimeZoneResolved below

  const terminals = useTerminals(
    effectiveUserId,
    location.selectedTerminalId,
    location.setSelectedTerminalId,
    null, // timezone resolved below
    setupSession
  );

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
        .select("trailer_id, comp_number, max_gallons, position, active")
        .eq("trailer_id", selectedTrailerId)
        .order("comp_number", { ascending: true });
      if (error) { setCompError(error.message); setCompartments([]); }
      else { setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false)); }
      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

  // ── Terminal products ──────────────────────────────────────────────────────
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);
  const [terminalProductMetaRows, setTerminalProductMetaRows] = useState<TerminalProductMetaRow[]>([]);

  // Extract terminal products fetch as a named callback so it can be called post-load
  const fetchTerminalProducts = useCallback(async () => {
    if (!location.selectedTerminalId) { setTerminalProducts([]); return; }
    const { data, error } = await supabase
      .from("terminal_products")
      .select(`active, last_api, last_api_updated_at, last_temp_f, last_loaded_at,
        products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f, un_number)`)
      .eq("terminal_id", location.selectedTerminalId);
    if (error) { setTerminalProducts([]); return; }
    const products = (data ?? []).filter((row: any) => row.active !== false)
      .map((row: any) => row.products ? { ...row.products, last_api: row.last_api ?? null, last_api_updated_at: row.last_api_updated_at ?? null, last_temp_f: row.last_temp_f ?? null, last_loaded_at: row.last_loaded_at ?? null } : null)
      .filter(Boolean);
    setTerminalProducts(products as ProductRow[]);
  }, [location.selectedTerminalId]);

  useEffect(() => { fetchTerminalProducts(); }, [fetchTerminalProducts]);

  useEffect(() => {
    if (!location.selectedTerminalId) { setTerminalProductMetaRows([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("terminal_products")
        .select("terminal_id, product_id, last_api, last_api_updated_at, last_temp_f, last_loaded_at")
        .eq("terminal_id", location.selectedTerminalId);
      if (!error) setTerminalProductMetaRows((data ?? []) as any);
    })();
  }, [location.selectedTerminalId]);

  // ── Planning inputs ────────────────────────────────────────────────────────
  // ── Persisted plan state — survives page refresh ─────────────────────────
  // All initialized to defaults; hydrated from localStorage in useEffect after mount
  // (avoids SSR hydration mismatch — localStorage is client-only)
  const [tempF, setTempFRaw] = useState<number>(60);
  const setTempF = useCallback((v: number | ((prev: number) => number)) => {
    setTempFRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("protankr_tempF_v1", String(next)); } catch {}
      return next;
    });
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
  const [myLoadsOpen, setMyLoadsOpen]   = useState(false);
  const [loadReportOpen, setLoadReportOpen] = useState(false);

  const loadHistory = useLoadHistory(effectiveUserId);

  // ── Guided tour ───────────────────────────────────────────────────────────
  const tour = useTour({
    stateConditions: {
      "tour-fleet-instruction":    !!equipment.selectedComboId && !equipOpen,
      "tour-location-instruction": !!location.selectedCity && !locOpen,
      "tour-terminal-instruction": !!location.selectedTerminalId && !termOpen,
    },
  });

  // Close comp modal when tour advances past the comp-instruction step
  const prevTourStepRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevTourStepRef.current;
    const curr = tour.currentStep?.targetId ?? null;
    if (prev === "tour-comp-instruction" && curr !== "tour-comp-instruction") {
      setCompModalOpen(false);
      setCompModalComp(null);
    }
    prevTourStepRef.current = curr;
  }, [tour.currentStep?.targetId]);

  // When tour is active and user taps highlighted element, advance
  function tourAdvanceIfTarget(id: string) {
    if (tour.active && tour.currentStep?.targetId === id && tour.currentStep?.waitFor === "tap") {
      tour.advance();
    }
  }
  // ── Headspace caps — persisted per trailer ────────────────────────────────
  const HEADSPACE_KEY_PREFIX = "protankr_headspace_v1:";
  const headspaceStorageKey = selectedTrailerId
    ? `${HEADSPACE_KEY_PREFIX}${selectedTrailerId}`
    : null;

  const [compHeadspacePct, setCompHeadspacePctRaw] = useState<Record<number, number>>(() => {
    // Eagerly load from localStorage on first render
    if (typeof window === "undefined") return {};
    try {
      // We don't know selectedTrailerId yet at init time, so start empty
      // and hydrate in the effect below
      return {};
    } catch { return {}; }
  });

  // Hydrate when trailer changes
  useEffect(() => {
    if (!headspaceStorageKey) {
      setCompHeadspacePctRaw({});
      return;
    }
    try {
      const raw = localStorage.getItem(headspaceStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setCompHeadspacePctRaw(parsed);
          return;
        }
      }
    } catch {}
    setCompHeadspacePctRaw({});
  }, [headspaceStorageKey]);

  // Persist on every change
  const setCompHeadspacePct = useCallback((updater: any) => {
    setCompHeadspacePctRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (headspaceStorageKey) {
        try { localStorage.setItem(headspaceStorageKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [headspaceStorageKey]);
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});

  // Fuel temp prediction — drives temp button border color and pre-fills ProductTempModal
  const { predictedFuelTempF, confidence: fuelTempConfidence, loading: fuelTempLoading } = useFuelTempPrediction({
    city: location.selectedCity || null,
    state: location.selectedState || null,
    lat: location.locationLat ?? null,
    lon: location.locationLon ?? null,
    ambientNowF: location.ambientTempF ?? null,
    terminalId: location.selectedTerminalId || null,
  });

  // Auto-apply prediction to the slider when it first arrives.
  // userAdjustedTempRef = true means the driver has manually moved the slider.
  // Resets whenever city/state changes so a new terminal gets a fresh auto-apply.
  const predAppliedForRef = useRef<string>("");
  const userAdjustedTempRef = useRef<boolean>(false);

  // Mark as user-adjusted whenever tempF changes AFTER a prediction has been applied
  const prevTempFRef = useRef<number>(tempF);
  useEffect(() => {
    if (Math.abs(tempF - prevTempFRef.current) > 0.1) {
      // Only mark as user-adjusted if a prediction has already been applied
      if (predAppliedForRef.current !== "") {
        userAdjustedTempRef.current = true;
      }
    }
    prevTempFRef.current = tempF;
  }, [tempF]);

  // Reset on city/state change
  useEffect(() => {
    predAppliedForRef.current = "";
    userAdjustedTempRef.current = false;
    prevTempFRef.current = tempF;
  }, [location.selectedCity, location.selectedState]);

  // Apply prediction to slider when it arrives — skip if user already adjusted
  useEffect(() => {
    if (predictedFuelTempF == null) return;
    const key = `${location.selectedCity}|${location.selectedState}`;
    if (predAppliedForRef.current === key) return;
    if (userAdjustedTempRef.current) return;
    setTempF(predictedFuelTempF);
    predAppliedForRef.current = key;
  }, [predictedFuelTempF, location.selectedCity, location.selectedState]);

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

  // ── Headspace helpers ──────────────────────────────────────────────────────
  const headspacePctForComp = useCallback((compNumber: number) => {
    const raw = Number(compHeadspacePct[compNumber] ?? 0);
    return Number.isFinite(raw) ? Math.max(0, Math.min(0.3, raw)) : 0;
  }, [compHeadspacePct]);

  const effectiveMaxGallonsForComp = useCallback((compNumber: number, trueMaxGallons: number) => {
    return Math.max(0, Math.floor(trueMaxGallons * (1 - headspacePctForComp(compNumber))));
  }, [headspacePctForComp]);

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
    // Use driver-observed API (last_api @ last_temp_f) when available — more accurate
    // than the static api_60 reference. bestLbsPerGallon back-corrects to 60°F first.
    return bestLbsPerGallon(
      Number(p.api_60),
      Number(p.alpha_per_f),
      tempF,
      p.last_api     != null ? Number(p.last_api)     : null,
      p.last_temp_f  != null ? Number(p.last_temp_f)  : null,
    );
  }, [terminalProducts, tempF]);

  // ── Active compartments ────────────────────────────────────────────────────
  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId || compartments.length === 0 || terminalProducts.length === 0) return [];
    const out: ActiveComp[] = [];
    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const trueMaxGallons = Number(c.max_gallons ?? 0);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, trueMaxGallons);
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


  // ── Plan slots ─────────────────────────────────────────────────────────────
  // Must be declared BEFORE loadWorkflow so planSlots.refreshLastLoad is defined
  const planSlots = usePlanSlots({
    authUserId: effectiveUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, cgSlider, compPlan, setCgSlider, setCompPlan,
    compartmentsLoaded: compartments.length > 0,
  });

  // ── Load workflow ──────────────────────────────────────────────────────────
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of terminalProducts) { if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id); }
    return m;
  }, [terminalProducts]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: effectiveUserId || null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows, plannedGallonsTotal, plannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
    onPostLoadComplete: planSlots.refreshLastLoad,
    predictedTempF: predictedFuelTempF,
  });

  // ── Terminal filters ───────────────────────────────────────────────────────
  const myTerminalIdSet = useMemo(
    () => new Set((terminals.terminals ?? []).map((x) => String(x.terminal_id))),
    [terminals.terminals]
  );

  const { terminalsFiltered, catalogTerminalsInCity } = useTerminalFilters({
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    myTerminalIdSet,
  });

  // ── Expiration alerts ─────────────────────────────────────────────────────
  const expirations = useExpirations({
    truckId: equipment.selectedCombo?.truck_id ?? null,
    trailerId: equipment.selectedCombo?.trailer_id ?? null,
    truckName: equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? "",
    trailerName: equipment.trailerNameById[equipment.selectedCombo?.trailer_id ?? ""] ?? "",
    accessDateByTerminalId: terminals.accessDateByTerminalId,
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    addDaysISO_,
  });

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


  const productButtonCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.button_code) rec[p.product_id] = String(p.button_code); }
    return rec;
  }, [terminalProducts]);

  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // ── City starring ──────────────────────────────────────────────────────────
  const CITY_STARS_KEY_PREFIX = "protankr_city_stars_v1::";
  const [starredCitySet, setStarredCitySet] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setStarredCitySet(new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []));
    } catch { setStarredCitySet(new Set()); }
  }, [authUserId]);

  const cityKey = (state: string, city: string) => `${normState(state)}||${normCity(city)}`;
  const isCityStarred = (state: string, city: string) => starredCitySet.has(cityKey(state, city));
  const toggleCityStar = (state: string, city: string) => {
    const key = cityKey(state, city);
    setStarredCitySet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // ── Location option lists ──────────────────────────────────────────────────
  const stateOptions = useMemo(() => {
    if (location.statesCatalog.length > 0) {
      return location.statesCatalog.map((r) => ({ code: normState(r.state_code), name: String(r.state_name || "").trim() })).filter((r) => r.code);
    }
    const codes = Array.from(new Set(terminals.terminalCatalog.map((t) => normState(t.state ?? "")))).filter(Boolean);
    return codes.map((code) => ({ code, name: code }));
  }, [location.statesCatalog, terminals.terminalCatalog]);

  const stateNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    stateOptions.forEach((s) => m.set(s.code, s.name || s.code));
    return m;
  }, [stateOptions]);

  const selectedStateLabel = useMemo(() => {
    if (!location.selectedState) return "";
    const code = normState(location.selectedState);
    return `${code} — ${stateNameByCode.get(code) || code}`;
  }, [location.selectedState, stateNameByCode]);

  const cities = useMemo(() => {
    const st = normState(location.selectedState);
    return Array.from(new Set(
      location.citiesCatalog.filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
        .map((c) => normCity(c.city_name ?? ""))
    )).filter(Boolean).sort();
  }, [location.citiesCatalog, location.selectedState]);

  const topCities = useMemo(() => {
    if (!location.selectedState || cities.length === 0) return [];
    const st = normState(location.selectedState);
    return cities.filter((c) => starredCitySet.has(cityKey(st, c))).sort();
  }, [location.selectedState, cities, starredCitySet]);

  const allCities = useMemo(() => {
    if (!location.selectedState) return cities;
    const st = normState(location.selectedState);
    return cities.filter((c) => !starredCitySet.has(cityKey(st, c)));
  }, [location.selectedState, cities, starredCitySet]);

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

  // ── Snapshot slots JSX (injected into PlannerControls) ────────────────────
  const SnapshotSlots = (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {planSlots.PLAN_SLOTS.map((n) => {
          const has = !!planSlots.slotHas[n];
          const disabled = !location.selectedTerminalId;

          // Tap to load (if saved), long-press to save/clear, shift+click to clear on desktop
          let pressTimer: ReturnType<typeof setTimeout> | null = null;
          let didLongPress = false;

          const onPressStart = () => {
            if (disabled) return;
            didLongPress = false;
            pressTimer = setTimeout(() => {
              didLongPress = true;
              if (has) {
                planSlots.clearSlot(n);
              } else {
                planSlots.saveToSlot(n);
                tourAdvanceIfTarget("tour-plan-slots");
              }
            }, 600);
          };
          const onPressEnd = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          };
          const onTap = (e: React.MouseEvent) => {
            if (disabled || didLongPress) return;
            // Shift+click to clear on desktop
            if (e.shiftKey && has) { planSlots.clearSlot(n); return; }
            if (has) planSlots.loadFromSlot(n);
            else { planSlots.saveToSlot(n); tourAdvanceIfTarget("tour-plan-slots"); }
          };

          return (
            <button key={n} type="button" disabled={disabled}
              id={n === 1 ? "tour-plan-slot-A" : undefined}
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerLeave={onPressEnd}
              onClick={(e) => onTap(e)}
              style={{
                border: "none", background: "transparent", padding: "4px 10px",
                color: has ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.25)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1, fontSize: "clamp(18px, 4.5vw, 26px)", fontWeight: 800,
                letterSpacing: 0.2,
              }}
              title={!location.selectedTerminalId ? "Select a terminal first" : has ? "Tap to load · Hold to clear · Shift+click to clear" : "Tap to save · Hold to save"}
            >{String.fromCharCode(64 + n)}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 0.2 }}>
        TAP to load · HOLD to save/clear
      </div>
    </div>
  );

  // ── Derived load state ─────────────────────────────────────────────────────
  const loadDisabled =
    loadWorkflow.beginLoadBusy ||
    !equipment.selectedComboId ||
    !location.selectedTerminalId ||
    !location.selectedState ||
    !location.selectedCity ||
    !location.selectedCityId ||
    planRows.length === 0;

  const loadLabel = loadWorkflow.beginLoadBusy ? "Loading…"
    : loadWorkflow.loadReport ? "RELOAD"
    : loadWorkflow.activeLoadId ? "Load started"
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
            onClick={() => { clearSetupSession(); setSetupSession(null); router.push("/admin"); }}
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(251,146,60,0.40)", background: "rgba(251,146,60,0.15)", color: "#fb923c", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            ← Return to Admin
          </button>
        </div>
      )}

      {/* Equipment header + nav menu on same line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
        <button type="button" id="tour-equipment-btn" onClick={() => { setEquipOpen(true); tourAdvanceIfTarget("tour-equipment-btn"); }}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14, padding: "8px 16px",
            cursor: "pointer", textAlign: "left" as const,
            color: equipment.selectedCombo ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
            fontWeight: 900, fontSize: "clamp(16px, 2.6vw, 24px)", letterSpacing: 0.2,
          }}
          aria-label="Select equipment"
        >
          {equipment.equipmentLabel ?? "Select Equipment"}
        </button>
        {(expirations.expiredCount > 0 || expirations.warningCount > 0) ? (
          <ExpirationAlertBar
            items={expirations.items}
            activeItems={expirations.activeItems}
            expiredCount={expirations.expiredCount}
            warningCount={expirations.warningCount}
            mostUrgent={expirations.mostUrgent}
            allDeferred={expirations.allDeferred}
            onClick={() => setExpModalOpen(true)}
          />
        ) : (
          <button type="button" onClick={() => setExpModalOpen(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.28)", padding: "4px 8px", flexShrink: 0, whiteSpace: "nowrap" as const }}>
            Expirations
          </button>
        )}
        <NavMenu />
      </div>

<PlannerControls
        styles={styles}
        selectedTrailerId={selectedTrailerId}
        compLoading={compLoading}
        compartments={compartments}
        compError={compError}
        headspacePctForComp={headspacePctForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        plannedGallonsByComp={plannedGallonsByComp}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        setCompModalComp={setCompModalComp}
        setCompModalOpen={(open: boolean) => {
          // Don't open compartment modal if no terminal selected — products are terminal-specific
          if (open && !location.selectedTerminalId) return;
          setCompModalOpen(open);
          if (open) tourAdvanceIfTarget("tour-comp-area");
        }}
        snapshotSlots={SnapshotSlots}
        onTourAdvance={tourAdvanceIfTarget}
        selectedTerminalId={location.selectedTerminalId ?? ""}
      />

      <CompartmentModal
        open={compModalOpen}
        compNumber={compModalComp}
        compartments={compartments}
        headspacePctForComp={headspacePctForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        compPlan={compPlan}
        plannedGallonsByComp={plannedGallonsByComp}
        terminalProducts={terminalProducts}
        styles={styles}
        setCompHeadspacePct={setCompHeadspacePct}
        setCompPlan={setCompPlan}
        onClose={() => { setCompModalOpen(false); setCompModalComp(null); }}
      />

      {/* CG Slider — always visible */}
      <div id="tour-cg-slider" style={{ marginTop: 10 }}>
        {unstableLoad && (
          <div style={{ ...styles.error, marginTop: 0, marginBottom: 10, textAlign: "center" }}>
            ⚠️ Unstable load (rear of neutral)
          </div>
        )}
        <style jsx global>{`
          input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; height: 56px; }
          input.cgRange:focus { outline: none; }
          input.cgRange::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.07); border: none; }
          input.cgRange::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; margin-top: -10px; background: transparent; border: none; opacity: 0; }
          input.cgRange::-moz-range-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.07); border: none; }
          input.cgRange::-moz-range-thumb { width: 28px; height: 28px; background: transparent; border: none; opacity: 0; }
        `}</style>
        <div style={{ position: "relative", width: "100%" }}>
          <input type="range" className="cgRange" min={0} max={1} step={0.005} value={cgSlider}
            onChange={(e) => { setCgSlider(Number(e.target.value)); tourAdvanceIfTarget("tour-cg-slider"); }}
            style={{ width: "100%" }} disabled={!equipment.selectedCombo}
          />
          {/* CG label — centered vertically on the track (track is 8px tall, thumb area 56px, so track center is at 50%) */}
          <div aria-hidden style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 36, height: 36,
            display: "grid", placeItems: "center",
            pointerEvents: "none",
            fontWeight: 900, fontSize: 13,
            color: "rgba(255,255,255,0.65)",
            background: "rgba(255,255,255,0.10)",
            borderRadius: "50%",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }}>CG</div>
        </div>
      </div>

      {/* ── Action grid ── */}
      {(() => {
        const { loadReport } = loadWorkflow;
        const plannedGal = loadReport?.planned_total_gal ?? (planRows.length ? plannedGallonsTotal : null);
        const plannedGalText = plannedGal == null ? "—" : `${Math.round(plannedGal).toLocaleString()} gal`;
        const targetText = loadReport?.planned_gross_lbs == null ? "—" : `${Math.round(loadReport.planned_gross_lbs).toLocaleString()} lbs`;
        const actualText = loadReport?.actual_gross_lbs == null ? "—" : `${Math.round(loadReport.actual_gross_lbs).toLocaleString()} lbs`;
        const diff = loadReport?.diff_lbs ?? null;
        const diffText = diff == null ? "—" : `${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()} lbs`;
        const diffColor = diff == null ? "rgba(255,255,255,0.90)" : diff > 0 ? "#ef4444" : "#4ade80";

        // Temp button confidence colors
        // isOverride = user manually moved temp away from prediction after it auto-applied
        const isOverride = userAdjustedTempRef.current && predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) > 0.5;
        const tempBorderColor = isOverride              ? "#fb923c"
          : fuelTempConfidence === "high"               ? "#4ade80"
          : fuelTempConfidence === "medium"             ? "#fbbf24"
          : fuelTempConfidence === "low"                ? "#f87171"
          : "rgba(255,255,255,0.35)";
        const tempGlowColor = isOverride                ? "rgba(251,146,60,0.28)"
          : fuelTempConfidence === "high"               ? "rgba(74,222,128,0.28)"
          : fuelTempConfidence === "medium"             ? "rgba(251,191,36,0.28)"
          : fuelTempConfidence === "low"                ? "rgba(248,113,113,0.28)"
          : "rgba(255,255,255,0.08)";

        // Load button colors
        const loadBg = loadReport ? "rgba(103,232,249,0.12)" : "rgba(30,60,80,0.60)";
        const loadBorderColor = loadReport ? "#67e8f9" : "rgba(40,120,180,0.55)";
        const loadTextColor = loadReport ? "#67e8f9" : "rgba(255,255,255,0.92)";

        // Terminal duration only — strip date, keep "(N days)" or "Expired"
        const termDuration = (() => {
          if (!terminalCardedText) return undefined;
          if (isPastISO_(terminalDisplayISO!)) return "Expired";
          const m = terminalCardedText.match(/\(([^)]+)\)/);
          return m ? m[1] : terminalCardedText;
        })();
        const termDurationColor = (() => {
          if (!termDuration) return "rgba(255,255,255,0.45)";
          if (termDuration === "Expired") return "#ef4444";
          const d = parseInt(termDuration);
          if (!isNaN(d) && d <= 7) return "#f97316";
          return "rgba(255,255,255,0.45)";
        })();

        const subBtnStyle: React.CSSProperties = {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "5px 12px",
          background: "rgba(255,255,255,0.04)", border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          cursor: "pointer", flexShrink: 0,
        };
        const subBtnLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" };
        const subBtnChevron: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.22)" };

        const cardBase: React.CSSProperties = {
          borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          boxShadow: "0 14px 34px rgba(0,0,0,0.40)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        };

        const locationLabel = location.locationLabel ?? null;
        const locationSelected = Boolean(location.selectedCity && location.selectedState);
        const terminalSelected = Boolean(location.selectedTerminalId);

        return (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Row 1: Location+Terminal card | Report card */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

              {/* Combined Location / Terminal card */}
              <div style={{ ...cardBase }}>
                {/* Location sub-button at top */}
                <button type="button" id="tour-location-btn" onClick={() => { setLocOpen(true); tourAdvanceIfTarget("tour-location-btn"); }} style={subBtnStyle}>
                  <span style={{ ...subBtnLabel, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {locationSelected ? locationLabel! : "Location"}
                  </span>
                  <span style={subBtnChevron}>›</span>
                </button>
                {/* Terminal main area */}
                <button type="button" id="tour-terminal-btn"
                  onClick={() => { setTermOpen(true); tourAdvanceIfTarget("tour-terminal-btn"); }}
                  disabled={!locationSelected}
                  style={{ flex: 1, background: "transparent", border: "none", cursor: locationSelected ? "pointer" : "default", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "10px 12px", minHeight: 54 }}
                >
                  <div style={{ fontWeight: 700, fontSize: "clamp(12px, 3.2vw, 15px)", color: terminalSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.40)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, width: "100%", textAlign: "center" as const }}>
                    {terminalSelected ? (terminalLabel ?? "Terminal") : (locationSelected ? "Tap to select" : "Select location first")}
                  </div>
                  {terminalSelected && termDuration && (
                    <div style={{ marginTop: 4, fontSize: "clamp(10px, 2.5vw, 12px)", fontWeight: 600, color: termDurationColor, lineHeight: 1.2, textAlign: "center" as const, width: "100%" }}>
                      {termDuration === "Expired" ? "Expired" : `Expires in ${termDuration}`}
                    </div>
                  )}
                </button>
                {/* Card number strip — matches Over/Under strip on report card */}
                {(() => {
                  const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
                  const cardNum = tid ? (cardDataByTerminalId[tid]?.cardNumber ?? "") : "";
                  return (
                    <div style={{ ...subBtnStyle, borderBottom: "none", borderTop: "1px solid rgba(255,255,255,0.07)", cursor: "default" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>Card #</span>
                      <span style={{ fontSize: "clamp(11px, 3vw, 16px)", fontWeight: 900, color: cardNum ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)" }}>
                        {cardNum || "—"}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Report card — history sub-button at top, over/under at bottom */}
              <div style={{ ...cardBase, justifyContent: "space-between" }}>
                {/* History sub-button */}
                <button type="button" onClick={() => { setMyLoadsOpen(true); loadHistory.fetch(); }} style={subBtnStyle}>
                  {(() => {
                    const last = loadHistory.rows[0];
                    if (!last) return <><span style={subBtnLabel}>My Loads</span><span style={subBtnChevron}>›</span></>;
                    const mins = Math.floor((Date.now() - new Date(last.started_at).getTime()) / 60000);
                    const ago = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins/60)}h ago` : "yesterday";
                    const gal = last.planned_total_gal != null ? `${Math.round(last.planned_total_gal).toLocaleString()} gal` : "—";
                    return <><span style={{ ...subBtnLabel, flex: 1, textAlign: "left" as const }}>{ago} · {gal}</span><span style={subBtnChevron}>›</span></>;
                  })()}
                </button>
                {/* Planned / Target / Actual */}
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                  {[
                    { label: "Gallons", text: plannedGalText, big: true },
                    { label: "Target",  text: targetText },
                    { label: "Actual",  text: actualText },
                  ].map(({ label, text, big }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: "clamp(9px, 2.2vw, 11px)", whiteSpace: "nowrap" as const }}>{label}</div>
                      <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: big ? "clamp(13px, 3.5vw, 20px)" : "clamp(11px, 2.8vw, 16px)", lineHeight: 1.1, textAlign: "right" as const, whiteSpace: "nowrap" as const }}>{text}</div>
                    </div>
                  ))}
                  {planUsesReferenceApi && planRows.length > 0 && (
                    <div style={{ fontSize: "clamp(8px, 2vw, 10px)", fontWeight: 700, color: "#fb923c", textAlign: "right" as const, marginTop: 2 }}>
                      ⚠ using ref API
                    </div>
                  )}
                </div>
                {/* Over/Under strip at bottom — tap to open load report */}
                <button type="button"
                  onClick={() => {
                    if (loadWorkflow.loadReport && loadHistory.rows[0]) {
                      loadHistory.fetchLines(loadHistory.rows[0].load_id, loadHistory.rows[0].planned_snapshot, loadHistory.rows[0].product_temp_f);
                      setLoadReportOpen(true);
                    }
                  }}
                  style={{ ...subBtnStyle, borderBottom: "none", borderTop: "1px solid rgba(255,255,255,0.07)", cursor: loadWorkflow.loadReport ? "pointer" : "default" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>Over/Under</span>
                  <span style={{ fontSize: "clamp(11px, 3vw, 16px)", fontWeight: 900, color: diffColor }}>{diffText}</span>
                </button>
              </div>
            </div>

            {/* Row 2: Temp | Load — no sub-buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* Temp button — glow style */}
              <button type="button" onClick={() => setTempDialOpen(true)}
                style={{
                  ...cardBase,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: `radial-gradient(ellipse at 50% 120%, ${tempGlowColor} 0%, rgba(0,0,0,0) 70%), rgba(18,18,18,0.95)`,
                  alignItems: "center", justifyContent: "center", padding: "20px 10px",
                  cursor: "pointer",
                  boxShadow: `0 4px 24px ${tempGlowColor}, inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)`,
                }}
              >
                <div style={{ fontSize: "clamp(20px, 5.5vw, 34px)", fontWeight: 900, color: tempBorderColor, lineHeight: 1 }}>
                  {Math.round(tempF)}°F
                </div>
              </button>

              {/* Load button — glow style */}
              <button type="button" onClick={loadWorkflow.beginLoadToSupabase} disabled={loadDisabled}
                style={{
                  ...cardBase,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: `radial-gradient(ellipse at 50% 120%, ${loadDisabled ? "rgba(20,50,70,0.4)" : "rgba(30,100,140,0.35)"} 0%, rgba(0,0,0,0) 70%), rgba(18,18,18,0.95)`,
                  alignItems: "center", justifyContent: "center", padding: "20px 10px",
                  cursor: loadDisabled ? "not-allowed" : "pointer",
                  boxShadow: loadDisabled ? "none" : `0 4px 24px ${loadBorderColor}30, inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)`,
                  opacity: loadDisabled ? 0.55 : 1,
                }}
              >
                <div style={{ fontWeight: 1000, letterSpacing: 0.6, fontSize: "clamp(22px, 6vw, 42px)", lineHeight: 1, color: loadTextColor }}>
                  {loadLabel}
                </div>
              </button>
            </div>

          </div>
        );
      })()}

            
      {/* ── Guided tour overlay ── */}
      <TourOverlay tour={tour} />
      {/* Tour anchor elements for state-wait steps */}
      <div id="tour-location-instruction" style={{ display: "none" }} />
      <div id="tour-terminal-instruction" style={{ display: "none" }} />
      <div id="tour-comp-instruction" style={{ display: "none" }} />
      <div id="tour-fleet-instruction" style={{ display: "none" }} />

      {/* ── Modals ── */}
      <EquipmentModal
        open={equipOpen} onClose={() => setEquipOpen(false)}
        authUserId={effectiveUserId}
        setupSession={setupSession}
        combos={equipment.combos} combosLoading={equipment.combosLoading} combosError={equipment.combosError}
        selectedComboId={equipment.selectedComboId ?? ""}
        onSelectComboId={(id) => equipment.setSelectedComboId(id)}
        onRefreshCombos={equipment.fetchCombos}
        onTourAdvance={tourAdvanceIfTarget}
      />

      <LoadReportModal
        open={loadReportOpen}
        onClose={() => setLoadReportOpen(false)}
        row={loadHistory.rows[0] ?? null}
        lines={loadHistory.rows[0] ? loadHistory.linesCache[loadHistory.rows[0].load_id] : undefined}
      />

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
      />

      <LoadingModal
        open={loadWorkflow.loadingOpen} onClose={() => loadWorkflow.setLoadingOpen(false)}
        styles={styles}
        planRows={planRows as any[]}
        productNameById={productNameById}
        productButtonCodeById={productButtonCodeById}
        productHexCodeById={productHexCodeById}
        productInputs={productInputs}
        terminalTimeZone={selectedTerminalTimeZoneResolved}
        lastProductInfoById={lastProductInfoById}
        setProductApi={(productId, api) => setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }))}
        setProductTemp={(productId, tempF) => setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), tempF } }))}
        onLoaded={loadWorkflow.onLoadedFromLoadingModal}
        loadedDisabled={loadWorkflow.completeBusy}
        loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "LOADED"}
      />

      <TempDialModal
        open={tempDial2Open} onClose={() => setTempDial2Open(false)} title="Temp"
        value={tempDial2ProductId ? Number(productInputs[tempDial2ProductId]?.tempF ?? 60) : 60}
        onChange={(v) => { const pid = tempDial2ProductId; if (!pid) return; setProductInputs((prev) => ({ ...prev, [pid]: { ...(prev[pid] ?? {}), tempF: v } })); }}
        TempDial={TempDial}
      />

      <ProductTempModal
        open={tempDialOpen}
        onClose={() => setTempDialOpen(false)}
        styles={styles}
        selectedCity={location.selectedCity}
        selectedState={location.selectedState}
        selectedTerminalId={location.selectedTerminalId}
        locationLat={location.locationLat}
        locationLon={location.locationLon}
        ambientTempLoading={location.ambientTempLoading}
        ambientTempF={location.ambientTempF}
        tempF={tempF}
        setTempF={setTempF}
        predictedFuelTempF={predictedFuelTempF}
        fuelTempConfidence={fuelTempConfidence}
        fuelTempLoading={fuelTempLoading}
        TempDial={TempDial}
      />

      <LocationModal
        open={locOpen} onClose={() => setLocOpen(false)}
        selectedState={location.selectedState}
        selectedStateLabel={selectedStateLabel}
        statesError={location.statesError}
        statesLoading={location.statesLoading}
        statePickerOpen={statePickerOpen}
        setStatePickerOpen={setStatePickerOpen}
        stateOptions={stateOptions}
        setSelectedState={location.setSelectedState}
        selectedCity={location.selectedCity}
        citiesLoading={location.citiesLoading}
        citiesError={location.citiesError}
        cities={cities}
        topCities={topCities}
        allCities={allCities}
        setSelectedCity={location.setSelectedCity}
        normState={normState}
        toggleCityStar={toggleCityStar}
        isCityStarred={isCityStarred}
        starBtnClass={starBtnClass}
        setLocOpen={setLocOpen}
      />

      <MyTerminalsModal
        open={termOpen} onClose={() => setTermOpen(false)}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        termError={terminals.termError}
        terminalsFiltered={terminalsFiltered}
        selectedTerminalId={location.selectedTerminalId}
        expandedTerminalId={expandedTerminalId}
        setExpandedTerminalId={setExpandedTerminalId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        accessDateByTerminalId={terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={terminals.setAccessDateForTerminal}
        cardDataByTerminalId={cardDataByTerminalId}
        setCardDataForTerminal_={setCardDataForTerminal_}
        myTerminalIds={myTerminalIdSet}
        setMyTerminalIds={() => {}}
        setTerminals={terminals.setTerminals}
        setSelectedTerminalId={location.setSelectedTerminalId}
        setTermOpen={setTermOpen}
      />

      <ExpirationModal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        items={expirations.items}
        activeItems={expirations.activeItems}
        deferredItems={expirations.deferredItems}
        toggleDefer={expirations.toggleDefer}
        onOpenEquipment={() => setEquipOpen(true)}
        onOpenTerminals={() => setTermOpen(true)}
        selectedCity={location.selectedCity}
        selectedState={location.selectedState}
        allTerminalsInCity={catalogTerminalsInCity}
        accessDateByTerminalId={terminals.accessDateByTerminalId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
      />

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
