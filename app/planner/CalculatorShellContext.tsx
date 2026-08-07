"use client";
// CalculatorShellContext.tsx
//
// Redesign shell (equipment-settings-spec.md ~= "ProTankr mobile app design"
// handoff, Phase 1): the new header (hamburger/bell/gear + alerts cluster)
// and the Planner/Cards/Vault tab bar live in a shared layout
// (`app/planner/layout.tsx`) above all three tab routes, but the
// gear icon opens the SAME Equipment sheet the Planner tab's own info card
// opens, and the bell icon needs the SAME expirations data Planner already
// computes -- both need one shared instance of `useEquipment`/`useLocation`/
// `useTerminals`/`useExpirations`, not a second independent copy.
//
// Why this matters: useEquipment's selectedComboId is plain
// mount-time-hydrated localStorage state with no cross-instance sync (no
// storage-event listener, no realtime subscription) -- two separate calls
// to useEquipment() in the same page view (one in the layout, one in
// page.tsx) would NOT reflect each other's changes without a reload. This
// context hoists exactly the hooks the header needs to one instance,
// shared via context; everything else (compartments, plan math, presets,
// load workflow, temp prediction) stays local to page.tsx as before.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getSetupSession } from "@/lib/setupSession";
import type { SetupSession } from "@/lib/setupSession";
import { useEquipment } from "./hooks/useEquipment";
import { useLocation } from "./hooks/useLocation";
import { useTerminals } from "./hooks/useTerminals";
import { useExpirations } from "./hooks/useExpirations";
import { useTerminalFilters } from "./hooks/useTerminalFilters";
import { useDemoWatchdog } from "./hooks/useDemoWatchdog";
import { useTheme } from "./hooks/useTheme";
import { addDaysISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import type { TerminalRow, TerminalCatalogRow } from "./types";
import { isRole, type Role } from "@/lib/ui/driver/role";

export type CardData = { cardNumber: string; privateNote: string; pin: string };

type ShellValue = {
  authEmail: string;
  authUserId: string;
  setupSession: SetupSession | null;
  effectiveUserId: string;
  equipment: ReturnType<typeof useEquipment>;
  location: ReturnType<typeof useLocation>;
  terminals: ReturnType<typeof useTerminals>;
  expirations: ReturnType<typeof useExpirations>;
  myTerminalIdSet: Set<string>;
  terminalFilters: ReturnType<typeof useTerminalFilters<TerminalRow, TerminalCatalogRow>>;
  equipOpen: boolean;
  setEquipOpen: (v: boolean) => void;
  expModalOpen: boolean;
  setExpModalOpen: (v: boolean) => void;
  termOpen: boolean;
  setTermOpen: (v: boolean) => void;
  // Location picker (state -> city) -- termOpen (above) already covers "pick
  // a terminal within the current city"; this is the step before it. Shared
  // (not local to page.tsx) so any tab can open the SAME LocationModal/
  // MyTerminalsModal instances (mounted once in ShellChrome, see that file)
  // and have the change reflect everywhere else that reads shell.location --
  // e.g. the Terminal tab's clickable terminal/city header.
  locOpen: boolean;
  setLocOpen: (v: boolean) => void;
  statePickerOpen: boolean;
  setStatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedTerminalId: string | null;
  setExpandedTerminalId: (id: string | null) => void;
  isCityStarred: (state: string, city: string) => boolean;
  toggleCityStar: (state: string, city: string) => void;
  stateOptions: { code: string; name?: string | null }[];
  selectedStateLabel: string;
  selectedStateName: string;
  cities: string[];
  topCities: string[];
  allCities: string[];
  cardDataByTerminalId: Record<string, CardData>;
  setCardDataForTerminal_: (terminalId: string, data: CardData) => Promise<void>;
  theme: ReturnType<typeof useTheme>;
  // Role of effectiveUserId in their active company -- null until resolved.
  // Drives which tabs CalculatorLayoutClient's tabsFor() shows (Dispatch/
  // Planner for admin, Dispatch only for dispatch, Planner only otherwise).
  role: Role | null;
  companyId: string | null;
  // Super admins (is_super_admin() RPC, same one NavMenu.tsx already uses)
  // get the same Dispatch+Planner tab set as admin, regardless of their own
  // company role -- lets one account verify both without reassigning roles.
  isSuperAdmin: boolean;
  // Which driver a dispatch/admin user currently has selected -- shared so
  // the Dispatch tab, the contextual Cards tab, and the Terminal tab's
  // auto-open-to-their-terminal behavior all agree on the same driver
  // without re-picking on every tab switch. Meaningless (and unused) for
  // driver/lead roles.
  selectedDriverId: string;
  setSelectedDriverId: (id: string) => void;
};

const ShellContext = createContext<ShellValue | null>(null);

export function useCalculatorShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useCalculatorShell must be used within CalculatorShellProvider");
  return ctx;
}

export function CalculatorShellProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [setupSession, setSetupSession] = useState<SetupSession | null>(null);
  const effectiveUserId = setupSession?.targetUserId ?? authUserId ?? "";

  // Per the website rework spec: /planner redirects unauthenticated
  // visitors to /login. Client-side, not a server-side gate in layout.tsx
  // -- see that file's own comment for why (this app's browser Supabase
  // client persists sessions to localStorage only, which a server
  // component can't read via cookies).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAuthEmail(data.user?.email ?? "");
      setAuthUserId(data.user?.id ?? "");
      if (!data.user) router.replace("/login");
    })();
    const session = getSetupSession();
    if (session) setSetupSession(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useDemoWatchdog(authUserId);

  const theme = useTheme(authUserId);

  const equipment = useEquipment(authUserId, setupSession);
  const location = useLocation(effectiveUserId);
  const terminals = useTerminals(
    effectiveUserId,
    location.selectedTerminalId,
    location.setSelectedTerminalId,
    null,
    setupSession
  );

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

  const myTerminalIdSet = useMemo(
    () => new Set((terminals.terminals ?? []).map((x: any) => String(x.terminal_id))),
    [terminals.terminals]
  );

  const terminalFilters = useTerminalFilters({
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    myTerminalIdSet,
  });

  const [equipOpen, setEquipOpen] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);

  // ── City starring (favorites shown at the top of LocationModal's city
  // list) -- moved here from page.tsx so the Terminal tab's own header can
  // open the SAME picker without a second, independently-drifting copy of
  // this logic (see this file's own header comment on why hoisting hooks
  // one level, not duplicating them, is the rule here).
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

  const stateOptions = useMemo(() => {
    if (location.statesCatalog.length > 0) {
      return location.statesCatalog.map((r) => ({ code: normState(r.state_code), name: String(r.state_name || "").trim() })).filter((r) => r.code);
    }
    const codes = Array.from(new Set(terminals.terminalCatalog.map((t: any) => normState(t.state ?? "")))).filter(Boolean);
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

  const selectedStateName = useMemo(() => {
    if (!location.selectedState) return "";
    const code = normState(location.selectedState);
    return stateNameByCode.get(code) || code;
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

  // ── Role (drives the Lead/Dispatch/Admin tab shown left of Planner) ──────
  // Same query shape as NavMenu.tsx's own role fetch, but scoped to
  // effectiveUserId (not authUserId) so admin impersonation ("Set up
  // planner for driver X") reflects the impersonated user's role, matching
  // every other piece of shared shell state.
  const [role, setRole] = useState<Role | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: mRows }, { data: sRow }] = await Promise.all([
        supabase.from("user_companies").select("company_id, role").eq("user_id", effectiveUserId),
        supabase.from("user_settings").select("active_company_id").eq("user_id", effectiveUserId).maybeSingle(),
      ]);
      if (cancelled) return;
      const ms = (mRows ?? []) as { company_id: string; role: string }[];
      const activeId = (sRow?.active_company_id as string | null) ?? ms[0]?.company_id ?? null;
      const rawRole = ms.find((m) => m.company_id === activeId)?.role ?? null;
      setCompanyId(activeId);
      setRole(isRole(rawRole) ? rawRole : null);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  // Super-admin status is about the REAL signed-in account, not whoever
  // they're impersonating -- keyed on authUserId, not effectiveUserId.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_super_admin");
      if (!cancelled) setIsSuperAdmin(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [authUserId]);

  // ── Card data (card number + PIN + private note, per terminal, per user) ──
  // Shared here (not local to the Planner page) because the new Cards tab
  // route needs the same data -- two independent fetches would risk the same
  // desync class of bug the equipment/location/terminals hooks were already
  // hoisted here to avoid.
  const [cardDataByTerminalId, setCardDataByTerminalId] = useState<Record<string, CardData>>({});

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
          .select("terminal_id, card_number, private_note, pin")
          .eq("user_id", effectiveUserId);
        if (data) {
          const map: Record<string, CardData> = {};
          for (const row of data as any[]) {
            map[String(row.terminal_id)] = {
              cardNumber: row.card_number ?? "",
              privateNote: row.private_note ?? "",
              pin: row.pin ?? "",
            };
          }
          setCardDataByTerminalId(map);
        }
      }
    })();
  }, [effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCardDataForTerminal_ = async (terminalId: string, data: CardData) => {
    setCardDataByTerminalId(prev => ({ ...prev, [terminalId]: data }));
    if (!effectiveUserId) return;
    if (setupSession) {
      const { setCardData } = await import("@/lib/adminSetupClient");
      await setCardData(effectiveUserId, terminalId, data.cardNumber, data.privateNote, data.pin);
    } else {
      await supabase.from("user_terminal_cards").upsert(
        {
          user_id: effectiveUserId,
          terminal_id: terminalId,
          card_number: data.cardNumber,
          private_note: data.privateNote,
          pin: data.pin || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,terminal_id" }
      );
    }
  };

  const [selectedDriverId, setSelectedDriverId] = useState("");

  const value: ShellValue = {
    authEmail, authUserId, setupSession, effectiveUserId,
    equipment, location, terminals, expirations,
    myTerminalIdSet, terminalFilters,
    equipOpen, setEquipOpen, expModalOpen, setExpModalOpen,
    termOpen, setTermOpen,
    locOpen, setLocOpen, statePickerOpen, setStatePickerOpen,
    expandedTerminalId, setExpandedTerminalId,
    isCityStarred, toggleCityStar,
    stateOptions, selectedStateLabel, selectedStateName, cities, topCities, allCities,
    cardDataByTerminalId, setCardDataForTerminal_,
    theme,
    role, companyId, isSuperAdmin,
    selectedDriverId, setSelectedDriverId,
  };

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
