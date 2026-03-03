"use client";
// app/calculator/hooks/useFuelTempPrediction.ts

import { useEffect, useMemo, useRef, useState } from "react";

export type FuelTempConfidence = "high" | "medium" | "low";

type Input = {
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lon?: number | null;
  ambientNowF?: number | null;
  terminalId?: string | null; // optional — used to back-fill lat/lon on terminals
};

type Output = {
  predictedFuelTempF: number | null;
  confidence: FuelTempConfidence | null;
  loading: boolean;
  error: string | null;

  // Resolved from the API response (so the UI can display ambient even if input ambientNowF was null)
  ambientNowF: number | null;
  lat: number | null;
  lon: number | null;

  usedCache: boolean | null;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function useFuelTempPrediction(input: Input): Output {
  const { city, state, lat, lon, ambientNowF, terminalId } = input;

  const [predictedFuelTempF, setPredictedFuelTempF] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<FuelTempConfidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // resolved values from the backend (One Call 3.0)
  const [ambientResolvedF, setAmbientResolvedF] = useState<number | null>(null);
  const [latResolved, setLatResolved] = useState<number | null>(null);
  const [lonResolved, setLonResolved] = useState<number | null>(null);
  const [usedCache, setUsedCache] = useState<boolean | null>(null);

  const lastCallAtRef = useRef<number>(0);
  const lastSigRef = useRef<string>("");

  const normalized = useMemo(() => {
    const c = String(city ?? "").trim();
    const s = String(state ?? "").trim();
    return { c, s };
  }, [city, state]);

  useEffect(() => {
    const { c, s } = normalized;

    // NEW: Only require city/state. lat/lon/ambient can be resolved server-side via /api/fuel-temp.
    const ready = !!c && !!s;

    if (!ready) {
      setPredictedFuelTempF(null);
      setConfidence(null);
      setError(null);
      setAmbientResolvedF(null);
      setLatResolved(null);
      setLonResolved(null);
      setUsedCache(null);
      return;
    }

    // Build a signature so we refetch when meaningful inputs change
    // (city/state always included; lat/lon/ambient included only if valid numbers)
    const sigParts = [
      `city=${c.toLowerCase()}`,
      `state=${s.toLowerCase()}`,
      isFiniteNumber(lat) ? `lat=${lat.toFixed(5)}` : "",
      isFiniteNumber(lon) ? `lon=${lon.toFixed(5)}` : "",
      isFiniteNumber(ambientNowF) ? `amb=${Math.round(ambientNowF)}` : "",
      terminalId ? `terminal=${String(terminalId)}` : "",
    ].filter(Boolean);

    const sig = sigParts.join("&");

    const now = Date.now();
    const minIntervalMs = 30_000;

    const sigChanged = sig !== lastSigRef.current;
    const tooSoon = now - lastCallAtRef.current < minIntervalMs;

    // If nothing changed and we're within the throttle window, skip.
    if (!sigChanged && tooSoon) return;

    lastSigRef.current = sig;
    lastCallAtRef.current = now;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        // Only send fields that we actually have.
        const payload: any = { city: c, state: s };
        if (isFiniteNumber(lat)) payload.lat = lat;
        if (isFiniteNumber(lon)) payload.lon = lon;
        if (isFiniteNumber(ambientNowF)) payload.ambientNowF = ambientNowF;
        if (terminalId) payload.terminalId = terminalId;

        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp prediction failed.");

        if (cancelled) return;

        setPredictedFuelTempF(isFiniteNumber(json?.predictedFuelTempF) ? json.predictedFuelTempF : null);
        setConfidence((json?.confidence as FuelTempConfidence) ?? null);

        // Capture resolved ambient + coords so other UI (location tile, modals) can use them.
        setAmbientResolvedF(isFiniteNumber(json?.ambientNowF) ? json.ambientNowF : null);
        setLatResolved(isFiniteNumber(json?.lat) ? json.lat : isFiniteNumber(lat) ? lat : null);
        setLonResolved(isFiniteNumber(json?.lon) ? json.lon : isFiniteNumber(lon) ? lon : null);

        setUsedCache(typeof json?.usedCache === "boolean" ? json.usedCache : null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error");
        setPredictedFuelTempF(null);
        setConfidence(null);
        setAmbientResolvedF(null);
        setUsedCache(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [normalized, lat, lon, ambientNowF, terminalId]);

  return {
    predictedFuelTempF,
    confidence,
    loading,
    error,
    ambientNowF: ambientResolvedF ?? (isFiniteNumber(ambientNowF) ? ambientNowF : null),
    lat: latResolved ?? (isFiniteNumber(lat) ? lat : null),
    lon: lonResolved ?? (isFiniteNumber(lon) ? lon : null),
    usedCache,
  };
}