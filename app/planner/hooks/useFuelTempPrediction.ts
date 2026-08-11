"use client";
// app/planner/hooks/useFuelTempPrediction.ts

import { useEffect, useMemo, useRef, useState } from "react";

export type FuelTempConfidence = "high" | "medium" | "low";

type Input = {
  city?: string | null;
  state?: string | null;
  terminalId?: string | null; // optional — used for the per-terminal bias lookup only
};

type Output = {
  predictedFuelTempF: number | null;
  confidence: FuelTempConfidence | null;
  loading: boolean;
  error: string | null;

  // Resolved from the API response, city-level.
  ambientNowF: number | null;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function useFuelTempPrediction(input: Input): Output {
  const { city, state, terminalId } = input;

  const [predictedFuelTempF, setPredictedFuelTempF] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<FuelTempConfidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambientResolvedF, setAmbientResolvedF] = useState<number | null>(null);

  const lastCallAtRef = useRef<number>(0);
  const lastSigRef = useRef<string>("");

  const normalized = useMemo(() => {
    const c = String(city ?? "").trim();
    const s = String(state ?? "").trim();
    return { c, s };
  }, [city, state]);

  useEffect(() => {
    const { c, s } = normalized;
    const ready = !!c && !!s;

    if (!ready) {
      setPredictedFuelTempF(null);
      setConfidence(null);
      setError(null);
      setAmbientResolvedF(null);
      return;
    }

    // Build a signature so we refetch when meaningful inputs change.
    const sig = [`city=${c.toLowerCase()}`, `state=${s.toLowerCase()}`, terminalId ? `terminal=${String(terminalId)}` : ""]
      .filter(Boolean)
      .join("&");

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
        const payload: any = { city: c, state: s };
        if (terminalId) payload.terminalId = terminalId;

        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp prediction failed.");

        if (cancelled) return;

        setPredictedFuelTempF(isFiniteNumber(json?.predictedFuelTempF) ? json.predictedFuelTempF : null);
        setConfidence((json?.confidence as FuelTempConfidence) ?? null);
        setAmbientResolvedF(isFiniteNumber(json?.ambientNowF) ? json.ambientNowF : null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error");
        setPredictedFuelTempF(null);
        setConfidence(null);
        setAmbientResolvedF(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [normalized, terminalId]);

  return {
    predictedFuelTempF,
    confidence,
    loading,
    error,
    ambientNowF: ambientResolvedF,
  };
}
