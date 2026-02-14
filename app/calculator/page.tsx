"use client";

import { QuickPanel } from "./QuickPanel";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { beginLoad, completeLoad } from "@/lib/supabase/load";
import PlanSection from "./sections/PlanSection";
import PlannerControls from "./sections/PlannerControls";
import LocationBar from "./sections/LocationBar";
import EquipmentBar from "./sections/EquipmentBar";
import ProductTempModal from "./modals/ProductTempModal";
import EquipmentModal from "./modals/EquipmentModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import { styles } from "./ui/styles";
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import CompleteLoadModal from "./modals/CompleteLoadModal";
import { useTerminalFilters } from "./hooks/useTerminalFilters";
import { usePlanRows } from "./hooks/usePlanRows";
import LoadingModal from "./modals/LoadingModal";
import TempDialModal from "./modals/TempDialModal";


// UI theme constants (keep local + simple)
const TEMP_TRACK_BLUE = "rgba(0,194,216,0.26)";
const TEMP_TRACK_RED  = "rgba(231,70,70,0.24)";
import { supabase } from "@/lib/supabase/client";

import { TopTiles } from "./TopTiles";

// --- UI helpers (localized; keep calculator logic intact) ---
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function svgToDataUri(svg: string) {
  // Inline SVG for range thumb. Keep tiny + dependency-free.
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

const THERMOMETER_THUMB_URI = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00c2d8"/>
      <stop offset="1" stop-color="#e74646"/>
    </linearGradient>
  </defs>
  <!-- outer -->
  <path d="M28 10a10 10 0 0 1 20 0v24.5a16 16 0 1 1-20 0V10z" fill="#0b1b22" opacity="0.85"/>
  <!-- inner tube -->
  <path d="M31.5 12a6.5 6.5 0 0 1 13 0v25.7a12 12 0 1 1-13 0V12z" fill="url(#g)"/>
  <!-- bulb highlight -->
  <circle cx="38" cy="46" r="6.5" fill="#fff" opacity="0.18"/>
</svg>
`);

type TempDialProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

/**
 * Big, touch-friendly dial for precise temperature adjustment.
 * - No dependencies
 * - Pointer-event driven (mouse + touch)
 * - 270° sweep (-135°..+135°)
 */
function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const sweepStart = -135; // degrees
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const valueToAngle = useCallback(
    (v: number) => {
      // Anchor 60°F at the top of the dial so the knob aligns with the label.
      const anchorValue = 60;
      const anchorAngle = -90; // top
      const degPerUnit = sweep / (max - min || 1);
      const a = anchorAngle + (clampNum(v, min, max) - anchorValue) * degPerUnit;
      return clampNum(a, sweepStart, sweepEnd);
    },
    [min, max]
  );

  const angleToValue = useCallback(
    (deg: number) => {
      const anchorValue = 60;
      const anchorAngle = -90; // top
      const degPerUnit = sweep / (max - min || 1);
      const raw = anchorValue + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
      // snap to step
      const snapped = Math.round(raw / step) * step;
      // avoid float jitter
      const clean = Math.round(snapped * 10) / 10;
      return clampNum(clean, min, max);
    },
    [min, max, step]
  );

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // angle: 0deg at +x, increasing clockwise (we want that feel)
      const rad = Math.atan2(dy, dx);
      let deg = (rad * 180) / Math.PI;
      // clamp to sweep arc
      deg = clampNum(deg, sweepStart, sweepEnd);
      onChange(angleToValue(deg));
    },
    [angleToValue, onChange]
  );

  const angle = valueToAngle(value);
  const rad = (angle * Math.PI) / 180;
  const knobR = 92;
  const knobX = 120 + Math.cos(rad) * knobR;
  const knobY = 120 + Math.sin(rad) * knobR;

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        aspectRatio: "1 / 1",
        borderRadius: 24,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        position: "relative",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      aria-label="Temperature dial"
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%" }}>
        {/* clean ring */}
        <circle cx="120" cy="120" r="106" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="rgb(0,194,216)" strokeWidth="2" />

        {/* subtle sweep track */}
        <path
          d={describeArc(120, 120, 92, sweepStart, sweepEnd)}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* ticks */}

        {/* knob */}
        <circle cx={knobX} cy={knobY} r="9" fill="rgba(255,255,255,0.88)" />
        <circle cx={knobX} cy={knobY} r="4" fill="rgb(0,194,216)" />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 14,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 900,
          fontSize: 14,
          color: "rgba(255,255,255,0.72)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        60°F
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -0.6 }}>
            {value.toFixed(1)}°F
          </div>
</div>
      </div>
    </div>
  );
}

function isoTodayInTimeZone_(timeZone?: string | null) {
  const tz = timeZone || "America/New_York";

  // en-CA gives YYYY-MM-DD ordering
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}


// SVG arc helpers (small + dependency-free)
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

type CompPlanInput = {
  empty: boolean;
  productId: string; // "" means none selected
};



type PlanRow = {
  comp_number: number;
  max_gallons: number;
  planned_gallons: number;

  // extra fields for mixed-product math + display
  productId?: string;
  lbsPerGal?: number;
  position?: number;
};


type ComboRow = {
  combo_id: string;
  combo_name: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  gross_limit_lbs: number | null;
  buffer_lbs: number | null;
  active: boolean | null;
};

type TerminalRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  carded_on: string | null; // "YYYY-MM-DD" (null if not carded)
  // Optional: view may expose an expiration date; if present we use it for display
  expires_on?: string | null;
  status: "valid" | "expired" | "not_carded";
  starred: boolean | null;
};

type TerminalCatalogRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  timezone?: string | null;
  active: boolean | null;
};

type StateRow = {
  state_code: string;
  state_name: string | null;
  active: boolean | null;
};




type CityRow = {
  city_id: string;
  state_code: string | null;
  city_name: string | null;
  active: boolean | null;
};

type CompRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number | null;
  position: number | null;
  active: boolean | null;
};

type ProductRow = {
  product_id: string;
  product_name: string | null;
  display_name?: string | null;
  description?: string | null;
  product_code?: string | null;
  button_code?: string | null;
  hex_code?: string | null;
  api_60: number | null;
  alpha_per_f: number | null;
  last_api?: number | null;
last_api_updated_at?: string | null;

};



const PLAN_SNAPSHOT_VERSION = 1;


export default function CalculatorPage() {
  const [authEmail, setAuthEmail] = useState<string>("");
const [authUserId, setAuthUserId] = useState<string>("");

const [equipOpen, setEquipOpen] = useState(false);
const [locOpen, setLocOpen] = useState(false);
const [termOpen, setTermOpen] = useState(false);
const [catalogOpen, setCatalogOpen] = useState(false);

const [cardingBusyId, setCardingBusyId] = useState<string | null>(null);
const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
const [myTerminalIds, setMyTerminalIds] = useState<Set<string>>(new Set());



  const starBtnClass = (active: boolean) =>
    [
      "h-8 w-8 flex items-center justify-center rounded-lg border transition",
      active
        ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80",
    ].join(" ");




const CITY_STARS_KEY_PREFIX = "protankr_city_stars_v1::";

function getCityStarsKey() {
  // per-user if logged in, otherwise anon
  return `${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`;
}

function cityKey(state: string, city: string) {
  return `${normState(state)}||${normCity(city)}`;
}

// Keep starred cities in React state so the UI updates immediately.
// Persist to localStorage so it survives refresh.
const [starredCitySet, setStarredCitySet] = useState<Set<string>>(new Set());

useEffect(() => {
  try {
    const raw = localStorage.getItem(getCityStarsKey());
    const parsed = raw ? JSON.parse(raw) : [];
    const keys = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    setStarredCitySet(new Set(keys));
  } catch {
    setStarredCitySet(new Set());
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [authUserId]); // reload if user changes

function persistStarredCitySet(next: Set<string>) {
  try {
    localStorage.setItem(getCityStarsKey(), JSON.stringify(Array.from(next)));
  } catch {
    // ignore
  }
}

function isCityStarred(state: string, city: string) {
  return starredCitySet.has(cityKey(state, city));
}

function toggleCityStar(state: string, city: string) {
  const key = cityKey(state, city);
  setStarredCitySet((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistStarredCitySet(next);
    return next;
  });
}

  
  // -----------------------
  // Data (from Supabase)
  // -----------------------

  // Equipment combos
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState<string | null>(null);
  const [selectedComboId, setSelectedComboId] = useState("");

  // Compartments
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  // Terminals + selectors
  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");

  // Ambient temp reference (cached)
  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);


  // States catalog (source of truth for showing all 50 states)
  const [statesCatalog, setStatesCatalog] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);


  const [citiesCatalog, setCitiesCatalog] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  // Location modal UX
  const [statePickerOpen, setStatePickerOpen] = useState(false);

// =======================
// Load (begin_load RPC)
// =======================
const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
const [beginLoadBusy, setBeginLoadBusy] = useState(false);

const [completeOpen, setCompleteOpen] = useState(false);
const [completeBusy, setCompleteBusy] = useState(false);
const [completeError, setCompleteError] = useState<string | null>(null);

const [actualByComp, setActualByComp] = useState<
  Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>
>({});



// Derive city_id from citiesCatalog using selectedState + selectedCity
const selectedCityId = useMemo<string | null>(() => {
  if (!selectedState || !selectedCity) return null;
  const st = normState(selectedState);
  const ct = normCity(selectedCity);
  const row = (citiesCatalog as any[]).find(
    (c) => normState(String(c?.state_code ?? "")) === st && normCity(String(c?.city_name ?? "")) === ct
  );
  return row?.city_id ? String(row.city_id) : null;
}, [citiesCatalog, selectedState, selectedCity]);


// Persistence (localStorage; per-user when logged in, anon fallback if not)
const skipResetRef = useRef(false);
const locationHydratingRef = useRef(false);
const locationHydratedOnceRef = useRef(false);
const locationUserTouchedRef = useRef(false);


  // =======================
  // Step 5: Equipment persistence (selectedComboId)
  // =======================
  const equipHydratingRef = useRef(false);
  const equipHydratedForKeyRef = useRef<string>("");

  function getEquipStorageKey(userId: string) {
    return `protankr_equip_v1:${userId || "anon"}`;
  }

  function readPersistedEquip(key: string): { comboId: string } | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const comboId = String((parsed as any)?.comboId || "");
      return comboId ? { comboId } : null;
    } catch {
      return null;
    }
  }

  function writePersistedEquip(key: string, comboId: string) {
    try {
      localStorage.setItem(key, JSON.stringify({ comboId }));
    } catch {
      // ignore
    }
  }


function getLocationStorageKey(userId: string) {
  return `protankr_location_v2:${userId || "anon"}`;
}

const locationStorageKey = useMemo(() => getLocationStorageKey(authUserId), [authUserId]);

  const anonEquipKey = useMemo(() => getEquipStorageKey("anon"), []);
  const userEquipKey = useMemo(() => getEquipStorageKey(authUserId), [authUserId]);
  const effectiveEquipKey = authUserId ? userEquipKey : anonEquipKey;


const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);

useEffect(() => {
  // terminals = rows from my_terminals_with_status
  setMyTerminalIds(new Set(terminals.map((t: any) => String(t.terminal_id))));
}, [terminals]);


  async function toggleTerminalStar(terminalId: string, currentlyStarred: boolean) {
  // Ensure we have the current user id (needed for INSERT policies)
  let uid = authUserId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? "";
    if (uid) setAuthUserId(uid);
  }

  if (!uid) {
    setTermError("Not logged in.");
    return;
  }

  // Optimistic UI update (unstar removes row from My Terminals list)
  setTerminals((prev) =>
    prev.filter((t) => String(t.terminal_id) !== String(terminalId) || currentlyStarred)
  );

  if (currentlyStarred) {
    const { error } = await supabase
      .from("my_terminals")
      .delete()
      .eq("user_id", uid)
      .eq("terminal_id", terminalId);

    if (error) {
      setTermError(error.message);
      await loadMyTerminals();
    }
    return;
  }

  const { error } = await supabase
    .from("my_terminals")
    .upsert({ user_id: uid, terminal_id: terminalId, is_starred: true }, { onConflict: "user_id,terminal_id" });

  if (error) {
    setTermError(error.message);
    await loadMyTerminals();
    return;
  }

  await loadMyTerminals();
}


async function refreshTerminalAccessForUser() {
  try {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("terminal_access")
      .select("terminal_id, carded_on")
      .eq("user_id", user.id);

    if (error) throw error;

    // Assuming you already maintain this map in state:
    // const [accessDateByTerminalId, setAccessDateByTerminalId] = useState<Record<string,string|undefined>>({})
    const next: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row?.terminal_id && row?.carded_on) next[String(row.terminal_id)] = String(row.carded_on);
    }
    setAccessDateByTerminalId(next);
  } catch (e) {
    console.error("refreshTerminalAccessForUser failed:", e);
  }
}


async function setAccessDateForTerminal_(terminalId: string, isoDate: string) {
  if (!authUserId) return;
  const tid = String(terminalId);
  // optimistic
  setAccessDateByTerminalId((prev) => ({ ...prev, [tid]: isoDate }));

  // guard: must be YYYY-MM-DD
if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;

const uid = authUserId; // local alias for clarity

const res = await supabase
  .from("terminal_access")
  .upsert(
    { user_id: uid, terminal_id: tid, carded_on: isoDate },
    { onConflict: "user_id,terminal_id" }
  )
  .select();


if (res.error) {
  console.error("setAccessDateForTerminal_ error:", res.error);
  console.error("setAccessDateForTerminal_ debug:", { isoDate, uid, tid });
  return;
}

await loadMyTerminals();


    // leave optimistic state; next refresh will correct
  }
async function loadMyTerminalsMembership() {
  setTermError(null);
  setTermLoading(true);

  const uid = authUserId;
  if (!uid) {
    setTermLoading(false);
    return;
  }

  const { data, error } = await supabase
    .from("my_terminals")
    .select(`
      terminal_id,
      is_starred,
      terminals:terminals (
        terminal_id,
        terminal_name,
        city,
        state,
        renewal_days
      )
    `)
    .eq("user_id", uid);

  if (error) {
    setTermError(error.message);
    setTermLoading(false);
    return;
  }

  // Flatten into the same shape your UI expects
  const rows =
    (data ?? []).map((r: any) => ({
      terminal_id: r.terminal_id,
      terminal_name: r.terminals?.terminal_name,
      city: r.terminals?.city,
      state: r.terminals?.state,
      renewal_days: r.terminals?.renewal_days,
      // these will be filled by access map / status logic below
      carded_on: null,
      status: "not_carded",
      expires_on: null,
    })) ?? [];

  setTerminals(rows as any);
  setTermLoading(false);
}

async function doGetCardedForTerminal(terminalId: string) {
  try {
    setTermError(null);
    setCardingBusyId(String(terminalId));

    const tzForCarded =
  (terminals as any[]).find((t) => String(t.terminal_id) === String(terminalId))?.timezone ??
  (terminalCatalog as any[]).find((t) => String(t.terminal_id) === String(terminalId))?.timezone ??
  selectedTerminalTimeZone ??
  null;



    const cardedOnISO = isoTodayInTimeZone_(tzForCarded);

    const { error: rpcError } = await supabase.rpc("get_carded", {
      p_terminal_id: terminalId,
      p_carded_on: cardedOnISO,
    });

    if (rpcError) {
      setTermError(rpcError.message);
      return;
    }

    await loadMyTerminals();
    await refreshTerminalAccessForUser();
    setSelectedTerminalId(String(terminalId));
    setTermOpen(false);
  } finally {
    setCardingBusyId(null);
  }
}

// Terminal catalog (for Location picker only)
const [terminalCatalog, setTerminalCatalog] = useState<TerminalCatalogRow[]>([]);
const [catalogLoading, setCatalogLoading] = useState(false);
const [catalogError, setCatalogError] = useState<string | null>(null);
const [accessDateByTerminalId, setAccessDateByTerminalId] = useState<Record<string, string>>({});
const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);



  // Terminal products
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);

  // Map terminal_products -> { [productId]: { last_api, last_api_updated_at } }
const lastProductInfoById = useMemo(() => {
  const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
  for (const tp of terminalProducts ?? []) {
    const pid = String((tp as any).product_id ?? "");
    if (!pid) continue;
    out[pid] = {
      last_api: (tp as any).last_api ?? null,
      last_api_updated_at: (tp as any).last_api_updated_at ?? null,
    };
  }
  return out;
}, [terminalProducts]);

const productButtonCodeById = useMemo(() => {
  const rec: Record<string, string> = {};
  for (const p of terminalProducts) {
    if (p.product_id && p.button_code) rec[p.product_id] = String(p.button_code);
  }
  return rec;
}, [terminalProducts]);

const productHexCodeById = useMemo(() => {
  const rec: Record<string, string> = {};
  for (const p of terminalProducts) {
    if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code);
  }
  return rec;
}, [terminalProducts]);

  // Selected terminal timezone (derived from terminals + selectedTerminalId)
const selectedTerminalTimeZone = useMemo(() => {
  const tid = String(selectedTerminalId ?? "");
  if (!tid) return null;

  const t = (terminals as any[])?.find(
    (x) => String(x.terminal_id) === tid
  );

  return (t?.timezone ?? null) as string | null;
}, [selectedTerminalId, terminals]);

useEffect(() => {
  if (!selectedTerminalId) return;

  async function loadTerminalProducts() {
    const { data, error } = await supabase
      .from("terminal_products")
      .select("terminal_id, product_id, last_api, last_api_updated_at, last_temp_f, last_loaded_at")
      .eq("terminal_id", selectedTerminalId);

    if (!error) {
  const rows = (data ?? []) as any[];
  setTerminalProducts(rows as any);

  const m = new Map<string, { last_api: number | null; last_api_updated_at: string | null }>();

  for (const tp of rows) {
    const pid = String(tp?.product_id ?? "");
    if (!pid) continue;

    m.set(pid, {
      last_api: tp?.last_api ?? null,
      last_api_updated_at: tp?.last_api_updated_at ?? null,
    });
  }

  setLastProductInfoMapById(m);
}

  }

  loadTerminalProducts();
}, [selectedTerminalId]);


  // -----------------------
  // Planning inputs
  // -----------------------

  // Temperature (applies to all compartments for now)
  const [tempF, setTempF] = useState<number>(60);
const [tempDialOpen, setTempDialOpen] = useState(false);

// ===== New Phase 4 loading workflow state =====
const [loadingOpen, setLoadingOpen] = useState(false);
const [loadingModalError, setLoadingModalError] = useState<string | null>(null);

// Per-product inputs keyed by product_id: { api, tempF }
const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});
const [lastProductInfoMapById, setLastProductInfoMapById] = useState<
  Map<
    string,
    {
      last_api: number | null;
      last_api_updated_at: string | null;
    }
  >
>(new Map());


// Temp dial context (which product are we editing?)
const [tempDial2Open, setTempDial2Open] = useState(false);
const [tempDial2ProductId, setTempDial2ProductId] = useState<string | null>(null);

// Report shown after LOADED
const [loadReport, setLoadReport] = useState<null | {
  planned_total_gal: number;
  planned_gross_lbs: number | null;
  actual_gross_lbs: number | null;
  diff_lbs: number | null;
}>(null);


 
  // Per-compartment planning inputs
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});


  // Per-compartment headspace override (0..0.30). Does NOT change true max_gallons; used for planning.
  const [compHeadspacePct, setCompHeadspacePct] = useState<Record<number, number>>({});

  // Compartment modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);

  // Volume-bias "CG" slider
  const [cgSlider, setCgSlider] = useState<number>(0.5); // 0..1 ; 0.5 is neutral (center)
  
  // SNAPSHOT SYSTEM (DO NOT REFACTOR CASUALLY)
// - localStorage = hot cache
// - Supabase = background sync
// - payload versioned
// - scoped by user + terminal + combo

  
  /************************************************************
   * Step 6a — Local Snapshot Slots (foundation)
   * - Autosave "last" plan per terminal (slot 0) to localStorage
   * - 1..5 quick slots: tap loads if exists; if empty, tap saves current plan
   * - Right-click / long-press behavior can be added later (for now: Shift+Click overwrites)
   ************************************************************/
  type PlanSnapshot = {
    v: 1;
    savedAt: number;
    terminalId: string;
    tempF: number;
    cgSlider: number;
    compPlan: Record<number, CompPlanInput>;
  };

  const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

  const planScopeKey = useMemo(() => {
    // per user if logged in, else anon
    const who = authUserId ? `u:${authUserId}` : "anon";
    const term = selectedTerminalId ? `t:${selectedTerminalId}` : "t:none";
    return `proTankr:${who}:${term}`;
  
    const cid = String(selectedComboId || "");
}, [authUserId, selectedTerminalId, selectedComboId]);

  const [slotBump, setSlotBump] = useState(0);


  const planStoreKey = useCallback(
    (slot: number) => `${planScopeKey}:plan:slot:${slot}`,
    [planScopeKey]
  );

  

function parsePlanPayload(raw: string | null) {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    // Back-compat: older payloads were just { tempF, cgSlider, compPlan }
    if (obj && typeof obj === "object" && obj.version == null) {
      return {
        version: 0,
        savedAtISO: "",
        terminalId: String(selectedTerminalId || ""),
        comboId: String(selectedComboId || ""),
        tempF: typeof obj.tempF === "number" ? obj.tempF : undefined,
        cgSlider: typeof obj.cgSlider === "number" ? obj.cgSlider : undefined,
        compPlan: obj.compPlan ?? undefined,
      };
    }


// =======================
// Step 7: Supabase sync for plan slots (cross-device), while keeping localStorage as hot cache
// =======================
const serverSyncEnabled = Boolean(authUserId); // only when logged in

const serverSyncInFlightRef = useRef(false);
const serverLastPulledScopeRef = useRef<string>(""); // to avoid repeated pulls
const serverWriteDebounceRef = useRef<any>(null);

async function serverFetchSlots_(): Promise<Record<number, any>> {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return {};
  const { data, error } = await supabase
    .from("user_plan_slots")
    .select("slot,payload,updated_at")
    .eq("user_id", authUserId)
    .eq("terminal_id", String(selectedTerminalId))
    .eq("combo_id", String(selectedComboId))
    .in("slot", [0, 1, 2, 3, 4, 5]);

  if (error) {
    console.warn("serverFetchSlots error:", error.message);
    return {};
  }
  const out: Record<number, any> = {};
  (data || []).forEach((r: any) => {
    out[Number(r.slot)] = r.payload ?? null;
  });
  return out;
}

async function serverUpsertSlot_(slot: number, payload: any) {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return;
  const row = {
    user_id: authUserId,
    terminal_id: String(selectedTerminalId),
    combo_id: String(selectedComboId),
    slot,
    payload,
  };
  const { error } = await supabase.from("user_plan_slots").upsert(row, {
    onConflict: "user_id,terminal_id,combo_id,slot",
  });
  if (error) console.warn("serverUpsertSlot error:", error.message);
}

async function serverDeleteSlot_(slot: number) {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return;
  const { error } = await supabase
    .from("user_plan_slots")
    .delete()
    .eq("user_id", authUserId)
    .eq("terminal_id", String(selectedTerminalId))
    .eq("combo_id", String(selectedComboId))
    .eq("slot", slot);
  if (error) console.warn("serverDeleteSlot error:", error.message);
}

function compareSavedAt_(a: any, b: any) {
  const aISO = String(a?.savedAtISO || "");
  const bISO = String(b?.savedAtISO || "");
  const at = aISO ? Date.parse(aISO) : 0;
  const bt = bISO ? Date.parse(bISO) : 0;
  return at - bt; // >0 means a newer
}

// Pull server slots once per scope; merge into localStorage (server wins if newer)
useEffect(() => {
  if (!serverSyncEnabled) return;
  if (!planScopeKey) return;
  if (!selectedTerminalId || !selectedComboId) return;
  if (serverSyncInFlightRef.current) return;
  if (serverLastPulledScopeRef.current === planScopeKey) return;

  serverSyncInFlightRef.current = true;

  (async () => {
    try {
      const server = await serverFetchSlots_();

      for (const s of [0, 1, 2, 3, 4, 5]) {
        const sp = server[s];
        if (!sp) continue;

        const localRaw = typeof window !== "undefined" ? localStorage.getItem(planStoreKey(s)) : null;
        const lp = parsePlanPayload(localRaw);

        if (!lp || compareSavedAt_(sp, lp) > 0) {
          try {
            localStorage.setItem(planStoreKey(s), JSON.stringify(sp));
            setSlotBump((v) => v + 1);
          } catch {}
        }
      }

      // After merging slot0, apply it if it's safe
      const local0 = parsePlanPayload(typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null);
      if (local0 && compartments?.length) {
        const safeToApply =
          !planDirtyRef.current ||
          Object.keys(compPlan || {}).length === 0 ||
          (lastAppliedScopeRef.current !== planScopeKey);

        if (safeToApply) {
          if (typeof local0.tempF === "number") setTempF(local0.tempF);
          if (typeof local0.cgSlider === "number") setCgSlider(local0.cgSlider);
          if (local0.compPlan && typeof local0.compPlan === "object") setCompPlan(local0.compPlan);
          planDirtyRef.current = false;
          lastAppliedScopeRef.current = planScopeKey;
        }
      }

      serverLastPulledScopeRef.current = planScopeKey;
    } finally {
      serverSyncInFlightRef.current = false;
    }
  })();
}, [serverSyncEnabled, planScopeKey, selectedTerminalId, selectedComboId, compartments, slotBump]);

async function syncSlotToServer_(slot: number) {
  if (!serverSyncEnabled) return;
  const payload = parsePlanPayload(typeof window !== "undefined" ? localStorage.getItem(planStoreKey(slot)) : null);
  if (!payload) return;
  await serverUpsertSlot_(slot, payload);
}

async function afterLocalSlotWrite_(slot: number) {
  if (!serverSyncEnabled) return;
  if (slot === 0) {
    if (serverWriteDebounceRef.current) clearTimeout(serverWriteDebounceRef.current);
    serverWriteDebounceRef.current = setTimeout(() => {
      syncSlotToServer_(0);
    }, 1200);
    return;
  }
  await syncSlotToServer_(slot);
}

async function afterLocalSlotDelete_(slot: number) {
  if (!serverSyncEnabled) return;
  await serverDeleteSlot_(slot);
}
    return obj;
  } catch {
    return null;
  }
}
const safeReadJSON_ = useCallback((key: string) => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const safeWriteJSON_ = useCallback((key: string, value: any) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, []);

  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});

  const refreshSlotHas_ = useCallback(() => {
    if (!selectedTerminalId) {
      setSlotHas({});
      return;
    }
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = !!safeReadJSON_(planStoreKey(s));
    setSlotHas(next);
  }, [PLAN_SLOTS, planStoreKey, safeReadJSON_, selectedTerminalId]);

  const planRestoreReadyRef = useRef<string | null>(null);
  const planDirtyRef = useRef<boolean>(false);
  const autosaveTimerRef = useRef<any>(null);
const lastAppliedScopeRef = useRef<string>("");

  const buildSnapshot_ = useCallback(
    (terminalId: string): PlanSnapshot => ({
      v: 1,
      savedAt: Date.now(),
      terminalId,
      tempF: Number(tempF) || 60,
      cgSlider: Number(cgSlider) || 0.25,
      compPlan,
    }),
    [tempF, cgSlider, compPlan]
  );

  const applySnapshot_ = useCallback(
    (snap: PlanSnapshot) => {
      setTempF(Number(snap.tempF) || 60);
      setCgSlider(Number(snap.cgSlider) || 0.25);
      setCompPlan(snap.compPlan || {});
    },
    [setTempF, setCgSlider, setCompPlan]
  );

  // Restore slot 0 ("last") whenever terminal changes.
  useEffect(() => {
    if (!selectedTerminalId) return;

    const key = planStoreKey(0);
    const raw = safeReadJSON_(key) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;

    if (raw && raw.v === 1 && String(raw.terminalId) === String(selectedTerminalId)) {
      applySnapshot_(raw);
    }

    // allow autosave after initial restore
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });

    refreshSlotHas_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, planScopeKey]);

  // Mark dirty when plan inputs change (after restore is complete)
  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return; // still restoring
    planDirtyRef.current = true;
  }, [selectedTerminalId, tempF, cgSlider, compPlan]);

  // Debounced autosave of slot 0 ("last")
  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!selectedTerminalId) return;
      if (!planDirtyRef.current) return;
      const snap = buildSnapshot_(String(selectedTerminalId));
      safeWriteJSON_(planStoreKey(0), snap);
      planDirtyRef.current = false;
      refreshSlotHas_();
    }, 350);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [selectedTerminalId, tempF, cgSlider, compPlan, buildSnapshot_, planStoreKey, safeWriteJSON_, refreshSlotHas_]);

  const saveToSlot_ = useCallback(
    (slot: number) => {
      if (!selectedTerminalId) return;
      const snap = buildSnapshot_(String(selectedTerminalId));
      safeWriteJSON_(planStoreKey(slot), snap);
      refreshSlotHas_();
    },
    [selectedTerminalId, buildSnapshot_, safeWriteJSON_, planStoreKey, refreshSlotHas_]
  );

  const loadFromSlot_ = useCallback(
    (slot: number) => {
      if (!selectedTerminalId) return;
      const raw = safeReadJSON_(planStoreKey(slot)) as PlanSnapshot | null;
      if (!raw || raw.v !== 1) return;
      if (String(raw.terminalId) !== String(selectedTerminalId)) return;
      planRestoreReadyRef.current = planScopeKey;
      applySnapshot_(raw);
      queueMicrotask(() => {
        if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
      });
    },
    [selectedTerminalId, planStoreKey, safeReadJSON_, applySnapshot_, planScopeKey]
  );

  const SnapshotSlots = (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Plan slots</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PLAN_SLOTS.map((n) => {
          const has = !!slotHas[n];
          const disabled = !selectedTerminalId;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                // If empty -> save. If exists -> load.
                // Hold Shift to overwrite/save even if it exists.
                if (e.shiftKey || !has) saveToSlot_(n);
                else loadFromSlot_(n);
              }}
              style={{
                borderRadius: 12,
                padding: "8px 12px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: has ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                color: "white",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                minWidth: 44,
              }}
              title={
                !selectedTerminalId
                  ? "Select a terminal first"
                  : has
                  ? "Tap to load. Shift+Tap to overwrite."
                  : "Tap to save current plan"
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
        Tip: Tap an empty number to save. Tap a filled number to load. Hold <strong>Shift</strong> to overwrite.
      </div>
    </div>
  );
  

  // -----------------------
  // Derived selections
  // -----------------------
const myTerminalIdSet = useMemo(
  () => new Set((terminals ?? []).map((x) => String(x.terminal_id))),
  [terminals]
);


  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  const selectedTrailerId = selectedCombo?.trailer_id ?? null;

  const selectedTerminal = useMemo(
    () => terminals.find((t) => String(t.terminal_id) === String(selectedTerminalId)) ?? null,
    [terminals, selectedTerminalId]
  );

  const terminalTimeZone =
  (selectedTerminal as any)?.timezone ??
  (selectedTerminal as any)?.terminal_timezone ??
  (selectedTerminal as any)?.tz ??
  null;

const equipmentLabel =
  selectedCombo?.combo_name ??
  (selectedCombo
    ? `Truck ${selectedCombo.truck_id ?? "?"} + Trailer ${selectedCombo.trailer_id ?? "?"}`
    : undefined);

const locationLabel =
  selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : undefined;

const terminalLabel =
  selectedTerminal?.terminal_name
    ? String(selectedTerminal.terminal_name)
    : selectedTerminalId
? "Terminal"
: undefined;


const terminalEnabled = Boolean(locationLabel);

const terminalDisplayISO = (() => {
  if (!selectedTerminal) return null;

  const tid = String(selectedTerminalId);

  const cat =
    terminalCatalog.find((x) => String(x.terminal_id) === tid) ?? null;

  const activationISO =
    accessDateByTerminalId[tid] ||
    (selectedTerminal as any)?.carded_on ||
    (selectedTerminal as any)?.added_on ||
    "";

  const expiresISO =
    (selectedTerminal as any)?.expires_on ||
    (selectedTerminal as any)?.expires ||
    (selectedTerminal as any)?.expires_at ||
    "";

  const renewalDays = Number(
    (selectedTerminal as any)?.renewal_days ??
      (selectedTerminal as any)?.renewalDays ??
      (cat as any)?.renewal_days ??
      90
  ) || 90;

  const computedExpiresISO =
    activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
      ? addDaysISO_(activationISO, renewalDays)
      : "";

  return expiresISO || computedExpiresISO || terminalDisplayDate_(selectedTerminal);
})();

const terminalCardedText = terminalDisplayISO ? formatMDYWithCountdown_(terminalDisplayISO) : undefined;
const terminalCardedClass = terminalCardedText
  ? (isPastISO_(terminalDisplayISO) ? "text-red-500" : "text-white/50")
  : undefined;




  
function sortMyTerminals(rows: TerminalRow[]) {
  const statusRank = (s: TerminalRow["status"]) => {
    if (s === "valid") return 0;
    if (s === "expired") return 1;
    return 2; // not_carded
  };

  return [...rows].sort((a, b) => {
    const aStar = Boolean(a.starred);
    const bStar = Boolean(b.starred);
    if (aStar !== bStar) return aStar ? -1 : 1;

    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;

    const an = String(a.terminal_name ?? "");
    const bn = String(b.terminal_name ?? "");
    return an.localeCompare(bn);
  });
}


function normalizeStatus_(raw: any): "valid" | "expired" | "not_carded" {
  const s =
    raw?.status ??
    raw?.card_status ??
    raw?.access_status ??
    raw?.carded_status ??
    raw?.terminal_status ??
    raw?.my_terminal_status;

  if (s === "valid" || s === "expired" || s === "not_carded") return s;

  // Fallback: if we have any date, assume valid (we'll still color red if date is past)
  return raw?.carded_on ? "valid" : "not_carded";
}

function normalizeTerminalRow_(raw: any): TerminalRow {
  const expires =
    raw?.expires_on ?? raw?.expires_at ?? raw?.expiration_on ?? raw?.expiration_date ?? raw?.expiry_on ?? null;

  return {
    terminal_id: String(raw?.terminal_id ?? ""),
    state: raw?.state ?? null,
    city: raw?.city ?? null,
    terminal_name: raw?.terminal_name ?? raw?.name ?? null,
    carded_on: raw?.carded_on ?? null,
    expires_on: expires,
    status: normalizeStatus_(raw),
    starred: raw?.starred ?? raw?.is_starred ?? null,
  };
}

function terminalDisplayDate_(t: TerminalRow) {
  // Prefer expires_on if present, else fall back to carded_on
  return (t.expires_on ?? t.carded_on) || null;
}




const productNameById = useMemo(() => {
  const m = new Map<string, string>();
  for (const p of terminalProducts) {
    if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id);
  }
  return m;
}, [terminalProducts]);




  function lbsPerGallonAtTemp(api60: number, alphaPerF: number, tempF: number) {
    const sg60 = 141.5 / (api60 + 131.5);
    const rho60 = sg60 * 8.345404;
    const rhoT = rho60 / (1 + alphaPerF * (tempF - 60));
    return rhoT;
  }

  function lbsPerGalForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    return lbsPerGallonAtTemp(Number(p.api_60), Number(p.alpha_per_f), Number(tempF));
  }

  // -----------------------
  // Phase 5.2: allowed lbs
  // (We keep allowed lbs now; max gallons from weight will be handled once distribution is in place.)
  // -----------------------

  const gross = Number(selectedCombo?.gross_limit_lbs ?? 0);
  const tare = Number(selectedCombo?.tare_lbs ?? 0);
  const buffer = Number(selectedCombo?.buffer_lbs ?? 0);

  const allowedLbs = Math.max(0, gross - tare - buffer);
  const allowedLbsText = allowedLbs.toLocaleString();

  // -----------------------
  // Phase 5.3: trailer capacity
  // -----------------------

  const trailerCapacityGallons = useMemo(() => {
    return compartments.reduce((sum, c) => sum + Number(c.max_gallons ?? 0), 0);
  }, [compartments]);

  const trailerCapacityGallonsText = trailerCapacityGallons.toLocaleString();

 
  // -----------------------
  // Active compartments (non-empty with a chosen product and valid lbs/gal)
  // -----------------------

  
  const headspacePctForComp = useCallback(
    (compNumber: number) => {
      const raw = Number(compHeadspacePct[compNumber] ?? 0);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(0.3, raw));
    },
    [compHeadspacePct]
  );

  const effectiveMaxGallonsForComp = useCallback(
    (compNumber: number, trueMaxGallons: number) => {
      const pct = headspacePctForComp(compNumber);
      const eff = trueMaxGallons * (1 - pct);
      // Keep it stable & display-friendly
      return Math.max(0, Math.floor(eff));
    },
    [headspacePctForComp]
  );

type ActiveComp = {
    compNumber: number;
    maxGallons: number;
    position: number;
    productId: string;
    lbsPerGal: number;
  };

  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId) return [];
    if (compartments.length === 0) return [];
    if (terminalProducts.length === 0) return [];

    const out: ActiveComp[] = [];

    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const trueMaxGallons = Number(c.max_gallons ?? 0);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, trueMaxGallons);
      // We want +position = FRONT, -position = REAR.
// If your DB currently has +position = REAR, flip it here.
const positionRaw = Number(c.position ?? 0);
const position = -positionRaw;


      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;

      const sel = compPlan[compNumber];
      if (!sel) continue;
      if (sel.empty) continue;
      if (!sel.productId) continue;

      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;

      out.push({
        compNumber,
        maxGallons,
        position: Number.isFinite(position) ? position : 0,
        productId: sel.productId,
        lbsPerGal,
      });
    }

    // Rear -> front by position (stable, not allocating yet)
    out.sort((a, b) => a.position - b.position);

    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF]);
// -----------------------
// Slider -> bias + unstable warning
// -----------------------
// Goal: zero bias at center, and gentler sensitivity so the slider travel is actually usable.
const CG_NEUTRAL = 0.5;      // 50% = 0 bias (center)
const CG_FRONT_MAX = 0.9;    // stage 1 ends at 90% (bias +1)
const CG_REAR_MAX = 0.0;     // 0%  = -1 bias
const PLOW_BIAS_MAX = 2.5;   // 100% = +2.5 bias (stronger than +1)
const CG_CURVE = 1.8;        // >1 = less sensitive near center

const cgBias = useMemo(() => {
  const s = Math.max(0, Math.min(1, Number(cgSlider) || 0));

  // Rear side: [0.00 .. 0.50] -> [-1 .. 0] with curve
  if (s < CG_NEUTRAL) {
    const t = (CG_NEUTRAL - s) / (CG_NEUTRAL - CG_REAR_MAX); // 0..1
    const curved = Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
    return -curved;
  }

  // Front side stage 1: [0.50 .. 0.90] -> [0 .. +1] with curve
  if (s <= CG_FRONT_MAX) {
    const t = (s - CG_NEUTRAL) / (CG_FRONT_MAX - CG_NEUTRAL); // 0..1
    const curved = Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
    return curved;
  }

  // Front side stage 2 ("plow"): [0.90 .. 1.00] -> [+1 .. +PLOW_BIAS_MAX] with curve
  const t2 = (s - CG_FRONT_MAX) / (1 - CG_FRONT_MAX); // 0..1
  const curved2 = Math.pow(Math.max(0, Math.min(1, t2)), CG_CURVE);
  return 1 + curved2 * (PLOW_BIAS_MAX - 1);
}, [cgSlider]);

const unstableLoad = cgSlider < CG_NEUTRAL;

 // -----------------------
// Phase 5.6: slider-based plan that respects:
// - per-compartment max gallons
// - equal "height" at neutral (same fill %)
// - CG slider shifts volume by position
// - total weight <= allowedLbs
// -----------------------

const TILT_GAIN = 0.85;

type PlanCalcRow = PlanRow & { lbsPerGal: number; position: number };

function allocateWithCaps(
  totalGallons: number,
  comps: {
    compNumber: number;
    maxGallons: number;
    position: number;
    lbsPerGal: number;
    productId: string;   // ✅ ADD THIS
    weight: number;
  }[]
) {
  // Water-fill style allocation:
  // target is g_i proportional to weight_i, capped at maxGallons.
  let remaining = Math.max(0, totalGallons);

  const rows = comps.map((c) => ({
  comp_number: c.compNumber,
  max_gallons: c.maxGallons,
  planned_gallons: 0,
  lbsPerGal: c.lbsPerGal,
  position: c.position,
  productId: c.productId,   // ✅ add this
  weight: c.weight,
}));


  let active = rows.filter((r) => r.max_gallons > 0);

  // safety
  for (let guard = 0; guard < 20; guard++) {
    if (remaining <= 1e-6) break;
    if (active.length === 0) break;

    const denom = active.reduce((s, r) => s + r.weight, 0);
    if (!(denom > 0)) break;

    const k = remaining / denom;

    let anyCapped = false;

    for (const r of active) {
      const want = k * r.weight;
      const room = r.max_gallons - r.planned_gallons;
      const add = Math.max(0, Math.min(room, want));
      r.planned_gallons += add;
    }

    const plannedNow = rows.reduce((s, r) => s + r.planned_gallons, 0);
    remaining = Math.max(0, totalGallons - plannedNow);

    // Remove any rows that are fully capped
    const nextActive = active.filter((r) => r.planned_gallons < r.max_gallons - 1e-6);
    anyCapped = nextActive.length !== active.length;
    active = nextActive;

    if (!anyCapped) break;
  }

  return rows;
}

function planForGallons(
  totalGallons: number,
  comps: { compNumber: number; maxGallons: number; position: number; lbsPerGal: number; productId: string }[], // ✅ ADD productId
  bias: number
): PlanCalcRow[] {
  const PLOW_BIAS_MAX = 2.5; // must match your slider mapping
  const b = Math.max(-1, Math.min(PLOW_BIAS_MAX, Number(bias) || 0));

  const withWeights = comps.map((c) => {
    const raw = 1 + b * c.position * TILT_GAIN;
    const shape = Math.max(0.05, raw);
    return { ...c, weight: shape * c.maxGallons };
  });

  const rows = allocateWithCaps(totalGallons, withWeights);
  rows.sort((a, b) => a.comp_number - b.comp_number);
  return rows;
}


const capacityGallonsActive = useMemo(() => {
  return activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0);
}, [activeComps]);

const plannedResult = usePlanRows({
  selectedTrailerId,
  activeComps,
  allowedLbs,
  cgBias,
  capacityGallonsActive,
  planForGallons,
});


const planRows = plannedResult.planRows;

const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
  const m: Record<number, number> = {};
  for (const r of planRows as any[]) {
    const n = Number((r as any).comp_number ?? (r as any).compNumber ?? 0);
    const g = Number((r as any).planned_gallons ?? (r as any).plannedGallons ?? 0);
    if (Number.isFinite(n)) m[n] = g;
  }
  return m;
}, [planRows]);


const plannedWeightLbs = useMemo(() => {
  return planRows.reduce((sum, r: any) => {
    const g = Number(r.planned_gallons ?? 0);
    const lpg = Number(r.lbsPerGal ?? 0);
    return sum + g * lpg;
  }, 0);
}, [planRows]);

const plannedWeightText = plannedWeightLbs.toFixed(0);
const weightMarginText = (allowedLbs - plannedWeightLbs).toFixed(0);


const effectiveMaxGallons = plannedResult.effectiveMaxGallons;
const effectiveMaxGallonsText = effectiveMaxGallons > 0 ? effectiveMaxGallons.toFixed(0) : "";

const targetGallons = planRows.reduce((s, r) => s + r.planned_gallons, 0);
const targetGallonsText = targetGallons > 0 ? targetGallons.toFixed(0) : "";
const targetGallonsRoundedText = targetGallonsText;

const plannedGallonsTotal = targetGallons;
const remainingGallons = 0;

const plannedGallonsTotalText = plannedGallonsTotal.toFixed(0);
const remainingGallonsText = remainingGallons.toFixed(0);

  
useEffect(() => {
  (async () => {
    const { data } = await supabase.auth.getUser();
    setAuthEmail(data.user?.email ?? "");
    setAuthUserId(data.user?.id ?? "");
  })();
}, []);


  // --- Fetch combos once ---
  useEffect(() => {
    (async () => {
      setCombosLoading(true);
      setCombosError(null);

      const { data, error } = await supabase
        .from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, gross_limit_lbs, buffer_lbs, active")
        .order("combo_name", { ascending: true })
        .order("combo_id", { ascending: true })
        .limit(200);

      if (error) {
        setCombosError(error.message);
        setCombos([]);
      } else {
        setCombos((data ?? []).filter((r: any) => r.active !== false) as ComboRow[]);
      }

      setCombosLoading(false);
    })();
  }, []);

  // --- Fetch terminals once ---
  async function loadMyTerminals() {
    setTermError(null);
    setTermLoading(true);

    const { data, error } = await supabase
      .from("my_terminals_with_status")
      .select("*")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true });

    if (error) {
      setTermError(error.message);
      setTerminals([]);
    } else {
      setTerminals(sortMyTerminals((data ?? []).map(normalizeTerminalRow_)));
}

    setTermLoading(false);
  }






  useEffect(() => {
    (async () => {
      await loadMyTerminals();
      await refreshTerminalAccessForUser();
    })();
  }, []);


  // --- Fetch states catalog (for Location modal + dropdown) ---
  useEffect(() => {
    (async () => {
      setStatesError(null);
      setStatesLoading(true);

      const { data, error } = await supabase
        .from("states")
        .select("state_code, state_name, active")
        .order("state_code", { ascending: true })
        .returns<StateRow[]>();

      if (error) {
        setStatesError(error.message);
        setStatesCatalog([]);
      } else {
        setStatesCatalog((data ?? []).filter((r) => r.active !== false));
      }

      setStatesLoading(false);
    })();
  }, []);




  // --- Fetch cities for selected state from public.cities (source of truth for city list) ---
  useEffect(() => {
    (async () => {
      setCitiesError(null);
      if (!selectedState) {
        setCitiesCatalog([]);
        return;
      }
      setCitiesLoading(true);

      const { data, error } = await supabase
        .from("cities")
        .select("city_id, state_code, city_name, active")
        .eq("state_code", normState(selectedState))
        .neq("active", false)
        .order("city_name", { ascending: true })
        .returns<CityRow[]>();

      if (error) {
        setCitiesError(error.message);
        setCitiesCatalog([]);
      } else {
        setCitiesCatalog((data ?? []).filter((r) => r.city_name));
      }
      setCitiesLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

// --- Fetch terminal catalog once (for Location modal state/city pickers) ---
useEffect(() => {
  (async () => {
    setCatalogError(null);
    setCatalogLoading(true);

    const { data, error } = await supabase
      .from("terminals")
      .select("terminal_id, state, city, terminal_name, timezone, active")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true })
      .returns<TerminalCatalogRow[]>();

    if (error) {
      setCatalogError(error.message);
      setTerminalCatalog([]);
    } else {
      setTerminalCatalog((data ?? []).filter((t) => t.active !== false));
    }

    setCatalogLoading(false);
  })();
}, []);

  // Reset city/terminal when state changes; reset terminal when city changes
  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedCity("");
    setSelectedTerminalId("");
  }, [selectedState]);

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedTerminalId("");
  }, [selectedCity]);

function readPersistedLocation(key: string): { state: string; city: string; terminalId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const st = normState((parsed as any).state || "");
    const ct = normCity((parsed as any).city || "");
    const tid = String((parsed as any).terminalId || "");

    if (!st) return null;
    return { state: st, city: ct, terminalId: tid };
  } catch {
    return null;
  }
}

function writePersistedLocation(key: string, state: string, city: string, terminalId: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        state: normState(state),
        city: normCity(city),
        terminalId: String(terminalId || ""),
      })
    );
  } catch {
    // ignore
  }
}

// =======================
// Ambient temp (OpenWeather) — light in-memory cache w/ TTL
// =======================

// Module-scope cache (per dev-server session / tab session)
const AMBIENT_MEM_CACHE = new Map<string, { ts: number; tempF: number }>();

function ambientMemKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

function readAmbientMem(state: string, city: string) {
  const k = ambientMemKey(state, city);
  const v = AMBIENT_MEM_CACHE.get(k);
  return v ?? null;
}

function writeAmbientMem(state: string, city: string, tempF: number) {
  const k = ambientMemKey(state, city);
  AMBIENT_MEM_CACHE.set(k, { ts: Date.now(), tempF });
}

async function fetchAmbientTempF(args: {
  state: string;
  city: string;
  key: string;
  signal: AbortSignal;
}): Promise<number | null> {
  const { state, city, key, signal } = args;
  const qCity = String(city || "").trim();
  const qState = String(state || "").trim();
  if (!qCity || !qState) return null;

  // 1) Best-effort: direct city/state query
  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(qCity)},${encodeURIComponent(
        qState
      )},US&units=imperial&appid=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal, cache: "no-store" });
    if (res.ok) {
      const json: any = await res.json();
      const temp = Number(json?.main?.temp);
      if (Number.isFinite(temp)) return temp;
    }
  } catch {
    // fall through
  }

  // 2) Fallback: geocode then weather by lat/lon
  try {
    const geoUrl =
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(qCity)},${encodeURIComponent(
        qState
      )},US&limit=1&appid=${encodeURIComponent(key)}`;
    const geoRes = await fetch(geoUrl, { signal, cache: "no-store" });
    if (!geoRes.ok) return null;
    const geoJson: any = await geoRes.json();
    const item = Array.isArray(geoJson) ? geoJson[0] : null;
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const wUrl =
      `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
        String(lon)
      )}&units=imperial&appid=${encodeURIComponent(key)}`;
    const wRes = await fetch(wUrl, { signal, cache: "no-store" });
    if (!wRes.ok) return null;
    const wJson: any = await wRes.json();
    const temp2 = Number(wJson?.main?.temp);
    return Number.isFinite(temp2) ? temp2 : null;
  } catch {
    return null;
  }
}
// --- Persistence helpers (per-user when logged in; anon fallback) ---
const ANON_LOCATION_KEY = "protankr_location_v2:anon";
const LEGACY_LOCATION_KEY = "protankr_location_v1";
const userLocationKey = authUserId ? getLocationStorageKey(authUserId) : "";
const effectiveLocationKey = authUserId ? userLocationKey : ANON_LOCATION_KEY;

// Prevent clobber during boot/auth flip:
// - we only persist AFTER we've hydrated for the current effective key
const hydratedForKeyRef = useRef<string>("");
const citiesLoadedForStateRef = useRef<string>("");
const terminalCatalogLoadedRef = useRef<boolean>(false);

// Mark terminal catalog loaded once
useEffect(() => {
  if (!catalogLoading && terminalCatalog.length > 0) {
    terminalCatalogLoadedRef.current = true;
  }
}, [catalogLoading, terminalCatalog]);

// Track that cities were loaded for the currently selected state
useEffect(() => {
  if (!selectedState) return;
  if (citiesLoading) return;
  // even if there are 0 cities returned, we consider it "loaded" for validation
  citiesLoadedForStateRef.current = normState(selectedState);
}, [selectedState, citiesLoading, citiesCatalog]);

// --- Restore persisted location (runs on mount and when auth resolves) ---
useEffect(() => {
  // If the user already interacted with location in this tab/session, do not override.
  if (locationUserTouchedRef.current) return;

  // If we're already hydrated for this key, don't re-run.
  if (hydratedForKeyRef.current === effectiveLocationKey) return;

  const fromUser = authUserId ? readPersistedLocation(userLocationKey) : null;
  const fromAnon = readPersistedLocation(ANON_LOCATION_KEY);
  const fromLegacy = readPersistedLocation(LEGACY_LOCATION_KEY);

  const loc = fromUser || (authUserId ? fromAnon : null) || fromAnon || fromLegacy;

  locationHydratingRef.current = true;
  skipResetRef.current = true;

  if (loc?.state) {
    setSelectedState(loc.state);
    setSelectedCity(loc.city || "");
    setSelectedTerminalId(loc.terminalId || "");
  }

  // If logged in and user key is missing but anon exists, migrate anon -> user
  if (authUserId && !fromUser && fromAnon) {
    writePersistedLocation(userLocationKey, fromAnon.state, fromAnon.city, fromAnon.terminalId);
  }

  // Mark hydration complete for this key AFTER React applies the queued state updates
  // (Do not release skipResetRef too early or the [selectedState] effect will clear city/terminal)
  setTimeout(() => {
    skipResetRef.current = false;
    locationHydratingRef.current = false;
    locationHydratedOnceRef.current = true;
    hydratedForKeyRef.current = effectiveLocationKey;
  }, 50);
}, [authUserId, effectiveLocationKey, userLocationKey]);

// Mark that the user has manually changed location so we stop auto-restoring over them.
useEffect(() => {
  if (!locationHydratedOnceRef.current) return;
  if (locationHydratingRef.current) return;
  if (skipResetRef.current) return;
  locationUserTouchedRef.current = true;
}, [selectedState, selectedCity, selectedTerminalId]);

// Validate saved selections:
// - If saved city no longer valid for the state => clear city + terminal
// - If saved terminal no longer valid for the city => clear terminal only
useEffect(() => {
  if (!locationHydratedOnceRef.current) return;
  if (locationHydratingRef.current) return;

  const st = normState(selectedState);
  const ct = normCity(selectedCity);
  const tid = String(selectedTerminalId || "");

  if (!st) {
    if (ct || tid) {
      skipResetRef.current = true;
      setSelectedCity("");
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
    }
    return;
  }

  // City validation ONLY after we've loaded cities for this state at least once
  if (ct && !citiesLoading && citiesLoadedForStateRef.current === st) {
    const validCities = new Set(
      citiesCatalog
        .filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
        .map((c) => normCity(c.city_name ?? ""))
        .filter(Boolean)
    );

    if (!validCities.has(ct)) {
      skipResetRef.current = true;
      setSelectedCity("");
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
      return;
    }
  }

  // Terminal validation ONLY after terminal catalog has loaded at least once
  if (tid && ct && !catalogLoading && terminalCatalogLoadedRef.current) {
    const t = terminalCatalog.find((x) => String(x.terminal_id) === tid);
    const ok = !!t && normState(t.state ?? "") === st && normCity(t.city ?? "") === ct && t.active !== false;

    if (!ok) {
      skipResetRef.current = true;
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
    }
  }
}, [selectedState, selectedCity, selectedTerminalId, citiesCatalog, citiesLoading, catalogLoading, terminalCatalog]);

// --- Persist location whenever it changes ---
useEffect(() => {
  // Do not persist until we have hydrated for the current effective key
  if (hydratedForKeyRef.current !== effectiveLocationKey) return;
  if (locationHydratingRef.current) return;

  // Always persist to anon (so auth flip never loses city/terminal)
  writePersistedLocation(ANON_LOCATION_KEY, selectedState, selectedCity, selectedTerminalId);

  // Persist to user key when logged in
  if (authUserId && userLocationKey) {
    writePersistedLocation(userLocationKey, selectedState, selectedCity, selectedTerminalId);
  }
}, [authUserId, effectiveLocationKey, userLocationKey, selectedState, selectedCity, selectedTerminalId]);


// Fetch/cached ambient temp when location changes.
// - Uses NEXT_PUBLIC_OPENWEATHER_KEY
// - Light in-memory cache per city/state (15 min TTL)
useEffect(() => {
  if (!selectedState || !selectedCity) {
    setAmbientTempF(null);
    setAmbientTempLoading(false);
    return;
  }

  const key = (process.env.NEXT_PUBLIC_OPENWEATHER_KEY || "").trim();
  if (!key) {
    setAmbientTempF(null);
    setAmbientTempLoading(false);
    return;
  }

  const TTL_MS = 15 * 60 * 1000;

  const cached = readAmbientMem(selectedState, selectedCity);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    setAmbientTempF(cached.tempF);
    setAmbientTempLoading(false);
    return;
  }

  const ac = new AbortController();
  setAmbientTempLoading(true);

  (async () => {
    try {
      const temp = await fetchAmbientTempF({
        state: selectedState,
        city: selectedCity,
        key,
        signal: ac.signal,
      });

      if (typeof temp === "number" && Number.isFinite(temp)) {
        setAmbientTempF(temp);
        writeAmbientMem(selectedState, selectedCity, temp);
      } else {
        setAmbientTempF(null);
      }
    } catch {
      setAmbientTempF(null);
    } finally {
      setAmbientTempLoading(false);
    }
  })();

  return () => ac.abort();
}, [selectedState, selectedCity]);



// --- Step 5: Restore equipment combo (after combos load) ---
useEffect(() => {
  if (combosLoading) return;

  // Run once per effective key
  if (equipHydratedForKeyRef.current === effectiveEquipKey) return;

  equipHydratingRef.current = true;

  const fromUser = authUserId ? readPersistedEquip(userEquipKey) : null;
  const fromAnon = readPersistedEquip(anonEquipKey);
  const saved = fromUser ?? fromAnon;

  if (saved?.comboId) {
    const exists = combos.some(
      (c) => String(c.combo_id) === String(saved.comboId) && c.active !== false
    );
    setSelectedComboId(exists ? String(saved.comboId) : "");

    // Migrate anon -> user if needed
    if (authUserId && !fromUser && fromAnon) {
      writePersistedEquip(userEquipKey, fromAnon.comboId);
    }
  }

  equipHydratedForKeyRef.current = effectiveEquipKey;
  equipHydratingRef.current = false;
}, [authUserId, effectiveEquipKey, userEquipKey, anonEquipKey, combosLoading, combos]);

// --- Step 5: Persist equipment combo whenever it changes ---
useEffect(() => {
  if (equipHydratedForKeyRef.current !== effectiveEquipKey) return;
  if (equipHydratingRef.current) return;

  // Always write anon to survive auth timing
  writePersistedEquip(anonEquipKey, selectedComboId);
  if (authUserId) writePersistedEquip(userEquipKey, selectedComboId);
}, [authUserId, effectiveEquipKey, userEquipKey, anonEquipKey, selectedComboId]);


// --- Fetch compartments when trailer changes --- when trailer changes ---
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

      if (error) {
        setCompError(error.message);
        setCompartments([]);
      } else {
        setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false));
      }

      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

useEffect(() => {
  // Initialize entries for current compartments, but don't wipe user choices if already set
  setCompPlan((prev) => {
    const next: Record<number, CompPlanInput> = { ...prev };

    for (const c of compartments) {
      const n = Number(c.comp_number);
      if (!Number.isFinite(n)) continue;

      if (!next[n]) {
        next[n] = { empty: false, productId: "" };
      }
    }

    // Optional: remove entries for compartments no longer present
    for (const key of Object.keys(next)) {
      const n = Number(key);
      if (!compartments.some((c) => Number(c.comp_number) === n)) {
        delete next[n];
      }
    }

    return next;
  });
}, [compartments]);



  // --- Fetch terminal products when terminal changes ---
  useEffect(() => {
    (async () => {
      setTpError(null);
      setTerminalProducts([]);

      if (!selectedTerminalId) return;

      setTpLoading(true);

      const { data, error } = await supabase
        .from("terminal_products")
        .select(
          `
          active,
          products (
            product_id,
            product_name,
            display_name,
            description,
            product_code,
            button_code,
            hex_code,
            api_60,
            alpha_per_f
          )
        `
        )
        .eq("terminal_id", selectedTerminalId);

      if (error) {
        setTpError(error.message);
        setTerminalProducts([]);
      } else {
        const products = (data ?? [])
          .filter((row: any) => row.active !== false)
          .map((row: any) => row.products)
          .filter(Boolean);

        setTerminalProducts(products as ProductRow[]);
      }

      setTpLoading(false);
    })();
  }, [selectedTerminalId]);

  // --- Option lists for state/city/terminal ---
  const stateOptions = useMemo(() => {
    // Preferred: states table (shows all 50)
    if (statesCatalog.length > 0) {
      return statesCatalog
        .map((r) => ({
          code: normState(r.state_code),
          name: String(r.state_name || "").trim(),
        }))
        .filter((r) => r.code);
    }

    // Fallback: derive from terminals table (won't show missing states)
    const codes = Array.from(new Set(terminalCatalog.map((t) => normState(t.state ?? "")))).filter(
      Boolean
    );
    return codes.map((code) => ({ code, name: code }));
  }, [statesCatalog, terminalCatalog]);

  const stateNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    stateOptions.forEach((s) => m.set(s.code, s.name || s.code));
    return m;
  }, [stateOptions]);

  const states = useMemo(() => stateOptions.map((s) => s.code), [stateOptions]);

  const selectedStateLabel = useMemo(() => {
    if (!selectedState) return "";
    const code = normState(selectedState);
    const name = stateNameByCode.get(code) || code;
    return `${code} — ${name}`;
  }, [selectedState, stateNameByCode]);

  const cities = useMemo(() => {
    const st = normState(selectedState);
    return Array.from(
      new Set(
        citiesCatalog
          .filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
          .map((c) => normCity(c.city_name ?? ""))
      )
    )
      .filter(Boolean)
      .sort();
  }, [citiesCatalog, selectedState]);


const topCities = useMemo(() => {
  if (!selectedState || cities.length === 0) return [];
  const st = normState(selectedState);

  // Manual: starred cities are "Top Cities"
  const out = cities.filter((c) => starredCitySet.has(cityKey(st, c)));
  out.sort();
  return out;
}, [selectedState, cities, starredCitySet]);

const allCities = useMemo(() => {
  if (!selectedState) return cities;
  const st = normState(selectedState);
  return cities.filter((c) => !starredCitySet.has(cityKey(st, c)));
}, [selectedState, cities, starredCitySet]);


const { terminalsFiltered, catalogTerminalsInCity } = useTerminalFilters({
  terminals,
  terminalCatalog,
  selectedState,
  selectedCity,
  myTerminalIdSet,
});


useEffect(() => {
  (async () => {
    if (!authUserId) return;
    if (!selectedState || !selectedCity) return;
    const ids = catalogTerminalsInCity.map((t) => String(t.terminal_id));
    if (ids.length === 0) {
      setAccessDateByTerminalId({});
      return;
    }
    const { data, error } = await supabase
      .from("terminal_access")
      .select("terminal_id, carded_on")
      .eq("user_id", authUserId)
      .in("terminal_id", ids);
    if (error) {
      console.error(error);
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => {
      if (r?.terminal_id && r?.carded_on) map[String(r.terminal_id)] = String(r.carded_on);
    });
    setAccessDateByTerminalId(map);
  })();
}, [authUserId, selectedState, selectedCity, catalogTerminalsInCity]);

function alphaPerFForProductId(productId: string): number | null {
  const p = terminalProducts.find((x: any) => x.product_id === productId);
  if (!p || p.alpha_per_f == null) return null;
  const v = Number(p.alpha_per_f);
  return Number.isFinite(v) ? v : null;
}

function computePlannedGrossLbs_(): number | null {
  const t = Number(tare);
  const b = Number(buffer);
  const payload = Number(plannedWeightLbs);
  if (![t, b, payload].every((x) => Number.isFinite(x))) return null;
  return t + b + payload;
}

async function onLoadedFromLoadingModal() {
  if (!activeLoadId) return;

  // Validate: require API + Temp per product group that appears in plan
  const requiredProductIds = Array.from(
    new Set(
      (planRows as any[])
        .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
        .map((r) => String(r.productId))
    )
  );

  for (const pid of requiredProductIds) {
    const apiStr = String(productInputs[pid]?.api ?? "").trim();
    const tempVal = productInputs[pid]?.tempF;

    const apiNum = Number(apiStr);
    if (!apiStr || !Number.isFinite(apiNum)) {
      alert(`Enter API for ${productNameById.get(pid) ?? pid}`);
      return;
    }
    if (tempVal == null || !Number.isFinite(Number(tempVal))) {
      alert(`Enter Temp for ${productNameById.get(pid) ?? pid}`);
      return;
    }
  }

  // Build actualByComp from planned gallons (gallons unchanged)
  const nextActualByComp: Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }> =
    {};

  let actualPayloadLbs = 0;

  for (const r of planRows as any[]) {
    const comp = Number(r?.comp_number ?? 0);
    const gallons = Number(r?.planned_gallons ?? 0);
    const pid = r?.productId ? String(r.productId) : null;

    if (!Number.isFinite(comp) || comp <= 0) continue;
    if (!pid || !Number.isFinite(gallons) || gallons <= 0) continue;

    const apiNum = Number(String(productInputs[pid]?.api ?? "").trim());
    const tempVal = Number(productInputs[pid]?.tempF);

    const alpha = alphaPerFForProductId(pid);
    if (!Number.isFinite(apiNum) || !Number.isFinite(tempVal) || alpha == null) {
      // If something’s missing, fall back to planned values already in the row
      const lpgPlanned = Number(r?.lbsPerGal ?? 0);
      const lbsPlanned = gallons * (Number.isFinite(lpgPlanned) ? lpgPlanned : 0);
      nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbsPlanned) ? lbsPlanned : null, temp_f: tempVal };
      actualPayloadLbs += Number.isFinite(lbsPlanned) ? lbsPlanned : 0;
      continue;
    }

    // Use your existing density function (API@60 + alpha + temp)
    const lpg = lbsPerGallonAtTemp(apiNum, alpha, tempVal);
    const lbs = gallons * lpg;

    nextActualByComp[comp] = {
      actual_gallons: gallons,
      actual_lbs: Number.isFinite(lbs) ? lbs : null,
      temp_f: tempVal,
    };

    if (Number.isFinite(lbs)) actualPayloadLbs += lbs;
  }

  setActualByComp(nextActualByComp);

  // Call existing complete_load RPC (UI is stable; backend shape can evolve later)
  try {
    setCompleteBusy(true);
    setCompleteError(null);

    const lines = Object.entries(nextActualByComp).map(([compStr, a]) => ({
      comp_number: Number(compStr),
      actual_gallons: a.actual_gallons ?? null,
      actual_lbs: a.actual_lbs ?? null,
      temp_f: a.temp_f ?? null,
    }));

    const product_updates = requiredProductIds.map((pid) => ({
      product_id: pid,
      api: Number(String(productInputs[pid]?.api ?? "").trim()),
      temp_f: (productInputs[pid]?.tempF ?? null) as number | null,
    }));


        const res = await completeLoad({
      load_id: activeLoadId,
      lines,
      completed_at: new Date().toISOString(),
      product_updates,
    });
console.log("complete_load result:", res);

    // Compute report numbers
    const plannedGross = computePlannedGrossLbs_();
    const actualGross =
      Number.isFinite(Number(tare)) && Number.isFinite(Number(buffer)) && Number.isFinite(Number(actualPayloadLbs))
        ? Number(tare) + Number(buffer) + Number(actualPayloadLbs)
        : null;

        const diff = Number.isFinite(Number(res?.diff_lbs))
      ? Number(res.diff_lbs)
      : plannedGross != null && actualGross != null
      ? actualGross - plannedGross
      : null;

    await refreshTerminalAccessForUser();

    setLoadReport({
      planned_total_gal: Number(plannedGallonsTotal),
      planned_gross_lbs: plannedGross,
      actual_gross_lbs: actualGross,
      diff_lbs: diff,
    });

    // Close the loading workflow
    setLoadingOpen(false);
  } catch (e: any) {
  console.error("complete_load failed:", e);
  alert(e?.message ?? String(e));
  setCompleteError(e?.message ?? String(e));
} finally {
  setCompleteBusy(false);
}

}


// =======================
// begin_load → Supabase
// =======================
async function beginLoadToSupabase() {
  if (beginLoadBusy) return;

  try {
    setBeginLoadBusy(true);

    if (!selectedComboId) throw new Error("Select equipment first.");
    if (!selectedTerminalId) throw new Error("Select terminal first.");
    if (!selectedState || !selectedCity) throw new Error("Select location first.");
    if (!selectedCityId) throw new Error("City ID not found.");
    if (!planRows || planRows.length === 0) throw new Error("No plan to load.");

    const lines = (planRows as any[])
      .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
      .map((r) => {
        const gallons = Number(r.planned_gallons ?? 0);
        const lpg = Number(r.lbsPerGal ?? 0);
        const lbs = gallons * lpg;

        return {
          comp_number: Number(r.comp_number),
          product_id: String(r.productId),
          planned_gallons: Number.isFinite(gallons) ? gallons : null,
          planned_lbs: Number.isFinite(lbs) ? lbs : null,
          temp_f: tempF ?? null,
        };
      });

    if (lines.length === 0) throw new Error("No filled compartments.");

    const planned_total_gal = Number.isFinite(Number(plannedGallonsTotal)) ? Number(plannedGallonsTotal) : null;
    const planned_total_lbs = Number.isFinite(Number(plannedWeightLbs)) ? Number(plannedWeightLbs) : null;

    const planned_gross_lbs =
      Number.isFinite(Number(tare)) &&
      Number.isFinite(Number(buffer)) &&
      Number.isFinite(Number(plannedWeightLbs))
        ? Number(tare) + Number(buffer) + Number(plannedWeightLbs)
        : null;

    const payload = {
      combo_id: selectedComboId,
      terminal_id: selectedTerminalId,
      state_code: selectedState,
      city_id: selectedCityId,

      cg_bias: Number.isFinite(Number(cgBias)) ? Number(cgBias) : null,
      ambient_temp_f: ambientTempF ?? null,
      product_temp_f: tempF ?? null,

      planned_totals: {
        planned_total_gal,
        planned_total_lbs,
        planned_gross_lbs,
      },

      planned_snapshot: {
        v: PLAN_SNAPSHOT_VERSION,
        created_at: new Date().toISOString(),
        totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
        lines,
      },

      lines,
    };

    const result = await beginLoad(payload);

setActiveLoadId(result.load_id);

// Initialize per-product inputs for products present in the plan
const nextInputs: Record<string, { api?: string; tempF?: number }> = {};
for (const r of planRows as any[]) {
  const pid = r?.productId ? String(r.productId) : null;
  const g = Number(r?.planned_gallons ?? 0);
  if (!pid || !Number.isFinite(g) || g <= 0) continue;

  if (!nextInputs[pid]) {
    // Default temp to current global tempF so behavior stays familiar
    nextInputs[pid] = { api: "", tempF: Number(tempF) };
  }
}
setProductInputs(nextInputs);

// Open the new Loading modal (Phase 4)
setLoadingOpen(true);
setLoadingModalError(null);

// No alert (modal is the new workflow surface)

  } catch (err: any) {
    console.error(err);
    alert(err?.message ?? "Failed to begin load.");
  } finally {
    setBeginLoadBusy(false);
  }
}

async function completeLoadToSupabase() {
  if (!activeLoadId) return;

  try {
    setCompleteBusy(true);
    setCompleteError(null);

    const lines = (planRows as any[])
      .map((r) => {
        const comp = Number((r as any).comp_number ?? (r as any).compNumber ?? 0);
        if (!Number.isFinite(comp) || comp <= 0) return null;

        const a = actualByComp[comp] ?? { actual_gallons: null, actual_lbs: null, temp_f: null };

        return {
          comp_number: comp,
          actual_gallons: a.actual_gallons ?? null,
          actual_lbs: a.actual_lbs ?? null,
          temp_f: a.temp_f ?? null,
        };
      })
      .filter(Boolean) as Array<{ comp_number: number; actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>;

    const res = await completeLoad({
      load_id: activeLoadId,
      lines,
      completed_at: new Date().toISOString(),
    });

    await refreshTerminalAccessForUser();

    // Keep behavior minimal: close modal. (We can also surface res.diff_lbs in UI later.)
    setCompleteOpen(false);
    // Optional: you might choose to clear activeLoadId here later, but NOT doing it now to avoid behavior drift.
    // setActiveLoadId(null);

    console.log("complete_load result:", res);
  } catch (e: any) {
    setCompleteError(e?.message ?? String(e));
  } finally {
    setCompleteBusy(false);
  }
}



  return (
    <div style={styles.page}>
      <h1 style={{ marginBottom: 6 }}>Calculator</h1>
<LocationBar
  styles={styles}
  locationTitle={locationLabel ?? "City, State"}
  ambientSubtitle={
    locationLabel
      ? `${ambientTempLoading ? "…" : ambientTempF == null ? "—" : Math.round(ambientTempF)}° ambient`
      : undefined
  }
  terminalTitle={terminalLabel ?? "Terminal"}
  terminalSubtitle={terminalCardedText}
  terminalSubtitleClassName={terminalCardedClass}
  onOpenLocation={() => setLocOpen(true)}
  onOpenTerminal={() => setTermOpen(true)}
  terminalEnabled={terminalEnabled}
  locationSelected={Boolean(selectedCity && selectedState)}
  terminalSelected={Boolean(selectedTerminalId)}
  snapshotSlots={SnapshotSlots}
  authEmail={authEmail}
/>


            {/* Equipment */}
      <EquipmentBar
        styles={styles}
        combosLoading={combosLoading}
        combosError={combosError}
        combos={combos}
        selectedComboId={selectedComboId}
        onChangeSelectedComboId={setSelectedComboId}
        selectedCombo={selectedCombo ?? null}
      />


      {/* Terminal */}
      {false && (
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Terminal</h2>
          <span style={styles.badge}>
            {termLoading ? "Loading…" : `${terminals.length} terminals`}
          </span>
        </div>

        {termError && <div style={styles.error}>Error loading terminals: {termError}</div>}

        <div style={{ ...styles.row, marginTop: 10 }}>
          <div>
            <label style={styles.label}>State</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ ...styles.select, width: 140 }}
              disabled={termLoading || states.length === 0}
            >
              <option value="">Select…</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>City</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{ ...styles.select, width: 220 }}
              disabled={!selectedState}
            >
              <option value="">Select…</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>Terminal</label>
            <select
              value={selectedTerminalId}
              onChange={(e) => setSelectedTerminalId(e.target.value)}
              style={{ ...styles.select, width: 420, maxWidth: "100%" }}
              disabled={!selectedState || !selectedCity}
            >
              <option value="">Select…</option>
              {terminalsFiltered.map((t, idx) => {
  const k = t.terminal_id ? String(t.terminal_id) : `term-${idx}`;
  return (
    <option key={k} value={t.terminal_id ?? ""}>
      {t.terminal_name ?? "(unnamed terminal)"}
    </option>
  );
})}

            </select>
          </div>
        </div>

        
          {selectedTerminal && (
  <div style={styles.help}>
    {(() => {
      const cat =
        terminalCatalog.find((x) => String(x.terminal_id) === String(selectedTerminalId)) ?? null;

      const activationISO =
        (selectedTerminal as any)?.carded_on ||
        (selectedTerminal as any)?.added_on ||
        "";

      const expiresISO =
        (selectedTerminal as any)?.expires_on ||
        (selectedTerminal as any)?.expires ||
        (selectedTerminal as any)?.expires_at ||
        "";

      const renewalDays = Number(
        (selectedTerminal as any)?.renewal_days ??
          (selectedTerminal as any)?.renewalDays ??
          (cat as any)?.renewal_days ??
          90
      ) || 90;

      const computedExpiresISO =
        activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
          ? addDaysISO_(activationISO, renewalDays)
          : "";

      const displayISO = expiresISO || computedExpiresISO;

console.log("MAIN selectedTerminal", {
  id: selectedTerminalId,
  name: selectedTerminal?.terminal_name ?? "",
  activationISO,
  expiresISO,
  computedExpiresISO,
  displayISO,
  renewalDays,
  rawSelectedTerminal: selectedTerminal,
});

      const tz = (cat as any)?.timezone ?? "";

      return (
        <>
          Selected: <strong>{selectedTerminal?.terminal_name ?? ""}</strong>

          {tz ? ` • ${tz}` : ""}
          {displayISO ? (
            <span>
              {" "}
              •{" "}
              <span style={{ color: isPastISO_(displayISO) ? "#f87171" : "rgba(255,255,255,0.75)" }}>

                {formatMDYWithCountdown_(displayISO)}
              </span>
            </span>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.5)" }}> • Set Activation Date</span>
          )}
        </>
      );
    })()}
  </div>
)}

  


      </section>
      )}

      {/* Products */}
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Products</h2>
          <span style={styles.badge}>
            {!selectedTerminalId
              ? "Select terminal"
              : tpLoading
              ? "Loading…"
              : `${terminalProducts.length} products`}
          </span>
        </div>

        {!selectedTerminalId && <div style={styles.help}>Select a terminal to load products.</div>}
        {tpError && <div style={styles.error}>Error loading products: {tpError}</div>}

        {selectedTerminalId && !tpLoading && !tpError && terminalProducts.length === 0 && (
          <div style={styles.help}>No products found for this terminal.</div>
        )}

{/* Temp (°F) input removed; use the Product Temp slider below. */}



{selectedTerminalId && (
  <div
    style={{
      marginTop: 10,
      padding: 12,
      border: "1px solid #333",
      borderRadius: 10,
      background: "#0f0f0f",
    }}
  >
    <div style={{ marginBottom: 6 }}>
      <strong>Planning conditions</strong>     
    </div>


<div>
  <strong>Planned weight (lbs):</strong> {planRows.length ? plannedWeightText : ""}
</div>
<div>
  <strong>Margin (allowed - planned):</strong> {planRows.length ? weightMarginText : ""}
</div>


    <div style={{ ...styles.help, marginTop: 8 }}>
      Active comps: <strong>{activeComps.length}</strong>
    </div>

    <div style={{ marginTop: 8, fontSize: 14, opacity: 0.95 }}>
      <div>
        <strong>Temp (°F):</strong> {tempF}
      </div>

      <div>
        <strong>Allowed lbs:</strong> {selectedCombo ? allowedLbsText : "Select equipment"}
      </div>

      <div>
        <strong>Trailer capacity (gal):</strong>{" "}
        {selectedTrailerId ? trailerCapacityGallonsText : "Select equipment"}
      </div>

      <div>
        <strong>Effective max gallons:</strong>{" "}
        {selectedTrailerId ? effectiveMaxGallonsText : ""}
      </div>
    </div>

    <div
      style={{
        marginTop: 10,
        display: "flex",
        gap: 12,
        alignItems: "end",
        flexWrap: "wrap",
      }}
    >
    </div>

    <div style={{ marginTop: 10, fontSize: 16 }}>
      <strong>Maximum legal gallons:</strong> {targetGallonsText}
    </div>

    
<div style={{ marginTop: 12 }}>
  {unstableLoad && (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 10, textAlign: "center" }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  )}

  
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <div style={{ position: "relative", width: "100%", flex: 1 }}>
      <input
        type="range"
        className="cgRange"
        min={0}
        max={1}
        step={0.005}
        value={cgSlider}
        onChange={(e) => setCgSlider(Number(e.target.value))}
        style={{ width: "100%" }}
        disabled={!selectedCombo}
      />

      {/* CG thumb overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 48,
          height: 48,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          userSelect: "none",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: 0.3,
          color: "rgba(255,255,255,0.88)",
          textShadow: "0 2px 10px rgba(0,0,0,0.55)",
        }}
      >
        CG
      </div>
    </div>

    <button
      type="button"
      onClick={() => setCgSlider(CG_NEUTRAL)}
      style={styles.smallBtn}
      title="Tap to snap CG back to neutral"
      disabled={!selectedCombo}
    >
      {cgBias >= 0 ? "+" : ""}
      {cgBias.toFixed(2)}
    </button>
  </div>
  {/* Product temperature */}
  <div style={{ marginTop: 14 }}>
    <label style={styles.label}>Product Temp (°F)</label>
    <style jsx global>{`
      /* Shared */
      input.tempRange{
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        height: 40px;
      }
      input.cgRange{
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        height: 72px;
      }
      input.cgRange:focus,
      input.tempRange:focus{ outline: none; }

      /* ---------- Product Temp ---------- */
      input.tempRange::-webkit-slider-runnable-track{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
        border: 1px solid rgba(255,255,255,0.10);
      }
      input.tempRange::-webkit-slider-thumb{
        -webkit-appearance: none;
        appearance: none;
        width: 68px;
        height: 68px;
        margin-top: -29px; /* center on 10px track */
        background: transparent;
        border: none;
        box-shadow: none;
      }

      /* Firefox temp */
      input.tempRange::-moz-range-track{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
        border: 1px solid rgba(255,255,255,0.10);
      }
      input.tempRange::-moz-range-progress{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
      }
      input.tempRange::-moz-range-thumb{
        width: 34px;
        height: 34px;
        background: transparent;
        border: none;
        box-shadow: none;
      }

      /* ---------- CG slider (uniform track, no trail) ---------- */
      input.cgRange::-webkit-slider-runnable-track{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.12);
      }
      input.cgRange::-webkit-slider-thumb{
        -webkit-appearance: none;
        appearance: none;
        width: 32px;
        height: 32px;
        margin-top: -11px; /* center on 10px track */
        background: transparent;
        border: none;
        box-shadow: none;
        opacity: 0; /* hide circle; use text overlay only */
      }

      /* Firefox cg */
      input.cgRange::-moz-range-track{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.12);
      }
      input.cgRange::-moz-range-progress{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
      }
      input.cgRange::-moz-range-thumb{
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        box-shadow: none;
        opacity: 0; /* hide circle; use text overlay only */
      }
    `}</style>


        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ position: "relative", width: "100%", flex: 1 }}>
        <input
          type="range"
          className="tempRange"
          min={-20}
          max={140}
          step={1}
          value={tempF}
          onChange={(e) => setTempF(Number(e.target.value))}
          style={{
            width: "100%",
            flex: 1,
          }}
        />

        {/* Thermometer overlay (no box) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, (tempF + 20) / 160)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 28,
            height: 28,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <svg viewBox="0 0 64 64" width="28" height="28">
            <defs>
              <linearGradient id="tAqua" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#00c2d8" stopOpacity="0.95" />
                <stop offset="1" stopColor="#00a9bd" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <path
              d="M28 8a10 10 0 0 1 20 0v24.7a18 18 0 1 1-20 0V8z"
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2.5"
            />
            <path
              d="M31 10.5a7 7 0 0 1 14 0v25.9l1.1.8a13.7 13.7 0 1 1-16.2 0l1.1-.8V10.5z"
              fill="url(#tAqua)"
              opacity="0.98"
            />
            <circle cx="38" cy="48" r="9.5" fill="rgba(231,70,70,0.92)" />
            <rect x="36.2" y="16" width="3.6" height="30" rx="1.8" fill="rgba(231,70,70,0.92)" />
          </svg>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTempDialOpen(true)}
        style={styles.smallBtn}
        title="Tap for fine tuning"
      >
        {Math.round(tempF)}°F
      </button>
    </div>
    <ProductTempModal
  open={tempDialOpen}
  onClose={() => setTempDialOpen(false)}
  styles={styles}
  selectedCity={selectedCity}
  selectedState={selectedState}
  ambientTempLoading={ambientTempLoading}
  ambientTempF={ambientTempF}
  tempF={tempF}
  setTempF={setTempF}
  TempDial={TempDial}
/>

  </div>
</div>

  </div>
)}


        {false && terminalProducts.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>API @ 60</th>
                <th style={styles.th}>Alpha / °F</th>
              </tr>
            </thead>
            <tbody>
              {terminalProducts.map((p) => (
                <tr key={p.product_id}>
                  <td style={styles.td}>{p.product_name}</td>
                  <td style={styles.td}>{p.api_60}</td>
                  <td style={styles.td}>{p.alpha_per_f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
  setCompModalOpen={setCompModalOpen}
  setCompPlan={setCompPlan}
  setCompHeadspacePct={setCompHeadspacePct}
  compModalOpen={compModalOpen}
  compModalComp={compModalComp}
/>


<PlanSection
  styles={styles}
  planRows={planRows}
  targetGallonsRoundedText={targetGallonsRoundedText}
  targetGallonsText={targetGallonsText}
  plannedGallonsTotalText={plannedGallonsTotalText}
  remainingGallonsText={remainingGallonsText}
  productNameById={productNameById}
  onLoad={beginLoadToSupabase}
  loadDisabled={
    beginLoadBusy ||
    !selectedComboId ||
    !selectedTerminalId ||
    !selectedState ||
    !selectedCity ||
    !selectedCityId ||
    planRows.length === 0
  }
 loadLabel={beginLoadBusy ? "Loading…" : loadReport ? "LOADED" : activeLoadId ? "Load started" : "Load"}

/>

{loadReport ? (
  <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        minWidth: 320,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Load report</div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800 }}>
        {Math.round(loadReport.planned_total_gal).toLocaleString()} gal planned
      </div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800 }}>
        Planned gross:{" "}
        {loadReport.planned_gross_lbs == null ? "—" : Math.round(loadReport.planned_gross_lbs).toLocaleString()} lbs
      </div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800 }}>
        Actual gross:{" "}
        {loadReport.actual_gross_lbs == null ? "—" : Math.round(loadReport.actual_gross_lbs).toLocaleString()} lbs
      </div>
      <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 900 }}>
        Over/Under:{" "}
        {loadReport.diff_lbs == null
          ? "—"
          : `${loadReport.diff_lbs >= 0 ? "+" : ""}${Math.round(loadReport.diff_lbs).toLocaleString()} lbs`}
      </div>
    </div>
  </div>
) : null}


<EquipmentModal open={equipOpen} onClose={() => setEquipOpen(false)} />

<LoadingModal
  open={loadingOpen}
  onClose={() => setLoadingOpen(false)}
  styles={styles}
  planRows={planRows as any[]}
  productNameById={productNameById}
  productButtonCodeById={productButtonCodeById}
  productHexCodeById={productHexCodeById}
  productInputs={productInputs}
  terminalTimeZone={selectedTerminalTimeZone}
  lastProductInfoById={lastProductInfoById}
  setProductApi={(productId, api) => {
    setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }));
  }}
  onOpenTempDial={(productId) => {
    setTempDial2ProductId(productId);
    setTempDial2Open(true);
  }}
  onLoaded={onLoadedFromLoadingModal}
  loadedDisabled={completeBusy}
  loadedLabel={completeBusy ? "Saving…" : "LOADED"}
/>


<TempDialModal
  open={tempDial2Open}
  onClose={() => setTempDial2Open(false)}
  title="Temp"
  value={
    tempDial2ProductId
      ? Number(productInputs[tempDial2ProductId]?.tempF ?? 60)
      : 60
  }
  onChange={(v) => {
    const pid = tempDial2ProductId;
    if (!pid) return;
    setProductInputs((prev) => ({ ...prev, [pid]: { ...(prev[pid] ?? {}), tempF: v } }));
  }}
  TempDial={TempDial}
/>



<LocationModal
  open={locOpen}
  onClose={() => setLocOpen(false)}
  selectedState={selectedState}
  selectedStateLabel={selectedStateLabel}
  statesError={statesError}
  statesLoading={statesLoading}
  statePickerOpen={statePickerOpen}
  setStatePickerOpen={setStatePickerOpen}
  stateOptions={stateOptions}
  setSelectedState={setSelectedState}
  selectedCity={selectedCity}
  citiesLoading={citiesLoading}
  citiesError={citiesError}
  cities={cities}
  topCities={topCities}
  allCities={allCities}
  setSelectedCity={setSelectedCity}
  normState={normState}
  toggleCityStar={toggleCityStar}
  isCityStarred={isCityStarred}
  starBtnClass={starBtnClass}
  setLocOpen={setLocOpen}
/>

<MyTerminalsModal
  open={termOpen}
  onClose={() => setTermOpen(false)}
  selectedState={selectedState}
  selectedCity={selectedCity}
  termError={termError}
  terminalsFiltered={terminalsFiltered}
  selectedTerminalId={selectedTerminalId}
  expandedTerminalId={expandedTerminalId}
  setExpandedTerminalId={setExpandedTerminalId}
  cardingBusyId={cardingBusyId}
  addDaysISO_={addDaysISO_}
  isPastISO_={isPastISO_}
  formatMDYWithCountdown_={formatMDYWithCountdown_}
  starBtnClass={starBtnClass}
  myTerminalIds={myTerminalIds}
  setMyTerminalIds={setMyTerminalIds}
  setTerminals={setTerminals}
  toggleTerminalStar={toggleTerminalStar}
  doGetCardedForTerminal={doGetCardedForTerminal}
  setSelectedTerminalId={setSelectedTerminalId}
  setTermOpen={setTermOpen}
  setCatalogExpandedId={setCatalogExpandedId}
  setCatalogOpen={setCatalogOpen}
/>


<TerminalCatalogModal
  open={catalogOpen}
  onClose={() => {
    setCatalogOpen(false);
    setTermOpen(true);
  }}
  selectedState={selectedState}
  selectedCity={selectedCity}
  termError={termError}
  catalogError={catalogError}
  catalogTerminalsInCity={catalogTerminalsInCity}
  myTerminalIds={myTerminalIds}
  setMyTerminalIds={setMyTerminalIds}
  catalogExpandedId={catalogExpandedId}
  setCatalogExpandedId={setCatalogExpandedId}
  catalogEditingDateId={catalogEditingDateId}
  setCatalogEditingDateId={setCatalogEditingDateId}
  accessDateByTerminalId={accessDateByTerminalId}
  setAccessDateForTerminal_={setAccessDateForTerminal_}
  isoToday_={isoTodayInTimeZone_}
  toggleTerminalStar={toggleTerminalStar}
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
