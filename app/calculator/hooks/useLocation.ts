"use client";
// app/calculator/hooks/useLocation.ts
// Owns: states/cities catalogs, selected state/city, ambient temp, persistence.
// Ambient is sourced from existing /api/fuel-temp (OpenWeather One Call 3.0 server-side).

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { normCity, normState } from "../utils/normalize";
import type { CityRow, StateRow } from "../types";

// ─── Ambient cache (per tab) ────────────────────────────────────────────────

type AmbientCacheEntry = { ts: number; tempF: number; lat?: number | null; lon?: number | null };
const AMBIENT_CACHE = new Map<string, AmbientCacheEntry>();
const AMBIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function ambientKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

const ANON_LOC_KEY = "protankr_location_v2:anon";
const LEGACY_LOC_KEY = "protankr_location_v1";

function locKey(userId: string) {
  return `protankr_location_v2:${userId || "anon"}`;
}

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
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocation(authUserId: string) {
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");

  const [statesCatalog, setStatesCatalog] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);

  const [citiesCatalog, setCitiesCatalog] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);
  const [ambientHeartbeat, setAmbientHeartbeat] = useState(0);

  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLon, setLocationLon] = useState<number | null>(null);

  // Hydration refs — prevent clobber during boot/auth flip
  const skipResetRef = useRef(false);
  const hydratingRef = useRef(false);
  const hydratedOnceRef = useRef(false);
  const hydratedForKeyRef = useRef("");
  const userTouchedRef = useRef(false);

  const userLocKey = useMemo(() => locKey(authUserId), [authUserId]);
  const effectiveLocKey = authUserId ? userLocKey : ANON_LOC_KEY;

  // ── Fetch states ──────────────────────────────────────────────────────────
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

  // ── Fetch cities when state changes ───────────────────────────────────────
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
  }, [selectedState]);

  // ── Reset city/terminal on state change ───────────────────────────────────
  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedCity("");
    setSelectedTerminalId("");
  }, [selectedState]);

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedTerminalId("");
  }, [selectedCity]);

  // ── Restore persisted location ───────────────────────────────────────────
  useEffect(() => {
    if (userTouchedRef.current) return;
    if (hydratedForKeyRef.current === effectiveLocKey) return;

    const fromUser = authUserId ? readPersistedLocation(userLocKey) : null;
    const fromAnon = readPersistedLocation(ANON_LOC_KEY);
    const fromLegacy = readPersistedLocation(LEGACY_LOC_KEY);
    const loc = fromUser || (authUserId ? fromAnon : null) || fromAnon || fromLegacy;

    hydratingRef.current = true;
    skipResetRef.current = true;

    if (loc?.state) {
      setSelectedState(loc.state);
      setSelectedCity(loc.city || "");
      setSelectedTerminalId(loc.terminalId || "");
    }

    if (authUserId && !fromUser && fromAnon) {
      writePersistedLocation(userLocKey, fromAnon.state, fromAnon.city, fromAnon.terminalId);
    }

    setTimeout(() => {
      skipResetRef.current = false;
      hydratingRef.current = false;
      hydratedOnceRef.current = true;
      hydratedForKeyRef.current = effectiveLocKey;
    }, 50);
  }, [authUserId, effectiveLocKey, userLocKey]);

  // Mark user-touched after hydration
  useEffect(() => {
    if (!hydratedOnceRef.current) return;
    if (hydratingRef.current) return;
    if (skipResetRef.current) return;
    userTouchedRef.current = true;
  }, [selectedState, selectedCity, selectedTerminalId]);

  // ── Persist on change ─────────────────────────────────────────────────────
  useEffect(() => {
    if (hydratedForKeyRef.current !== effectiveLocKey) return;
    if (hydratingRef.current) return;

    writePersistedLocation(ANON_LOC_KEY, selectedState, selectedCity, selectedTerminalId);
    if (authUserId && userLocKey) {
      writePersistedLocation(userLocKey, selectedState, selectedCity, selectedTerminalId);
    }
  }, [authUserId, effectiveLocKey, userLocKey, selectedState, selectedCity, selectedTerminalId]);

  // ── Ambient temp via existing /api/fuel-temp (OpenWeather 3.0) ────────────
  useEffect(() => {
    const city = String(selectedCity ?? "").trim();
    const state = String(selectedState ?? "").trim();

    if (!city || !state) {
      setAmbientTempF(null);
      setAmbientTempLoading(false);
      setLocationLat(null);
      setLocationLon(null);
      return;
    }

    const k = ambientKey(state, city);
    const cached = AMBIENT_CACHE.get(k);
    if (cached && Date.now() - cached.ts < AMBIENT_TTL_MS) {
      setAmbientTempF(cached.tempF);
      setLocationLat(cached.lat ?? null);
      setLocationLon(cached.lon ?? null);
      setAmbientTempLoading(false);
      return;
    }

    const ac = new AbortController();
    setAmbientTempLoading(true);

    (async () => {
      try {
        // IMPORTANT: Do NOT send ambientNowF here.
        // We want the server to fetch ambient from One Call 3.0 and return ambientNowF.
        const payload: any = { city, state };
        if (selectedTerminalId) payload.terminalId = String(selectedTerminalId);

        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: ac.signal,
          cache: "no-store",
        });

        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp route failed.");

        const amb = Number(json?.ambientNowF);
        const lat = json?.lat != null ? Number(json.lat) : null;
        const lon = json?.lon != null ? Number(json.lon) : null;

        if (Number.isFinite(amb)) {
          setAmbientTempF(amb);
          setLocationLat(Number.isFinite(lat) ? lat : null);
          setLocationLon(Number.isFinite(lon) ? lon : null);

          AMBIENT_CACHE.set(k, {
            ts: Date.now(),
            tempF: amb,
            lat: Number.isFinite(lat) ? lat : null,
            lon: Number.isFinite(lon) ? lon : null,
          });
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
  }, [selectedState, selectedCity, selectedTerminalId, ambientHeartbeat]);

  // ── Heartbeat to refresh ambient periodically ─────────────────────────────
  useEffect(() => {
    if (!selectedState || !selectedCity) return;
    const HEARTBEAT_MS = 5 * 60 * 1000; // 5 min

    const id = setInterval(() => {
      const k = ambientKey(selectedState, selectedCity);
      AMBIENT_CACHE.delete(k);
      setAmbientHeartbeat((v) => v + 1);
    }, HEARTBEAT_MS);

    return () => clearInterval(id);
  }, [selectedState, selectedCity]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedCityId = useMemo<string | null>(() => {
    if (!selectedState || !selectedCity) return null;
    const st = normState(selectedState);
    const ct = normCity(selectedCity);
    const row = citiesCatalog.find(
      (c) => normState(String(c.state_code ?? "")) === st && normCity(String(c.city_name ?? "")) === ct
    );
    return row?.city_id ? String(row.city_id) : null;
  }, [citiesCatalog, selectedState, selectedCity]);

  const locationLabel = useMemo(
    () => (selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : undefined),
    [selectedCity, selectedState]
  );

  return {
    selectedState,
    setSelectedState,
    selectedCity,
    setSelectedCity,
    selectedTerminalId,
    setSelectedTerminalId,
    selectedCityId,
    locationLabel,
    locationLat,
    locationLon,
    statesCatalog,
    statesLoading,
    statesError,
    citiesCatalog,
    citiesLoading,
    citiesError,
    ambientTempF,
    ambientTempLoading,
    skipResetRef,
  };
}