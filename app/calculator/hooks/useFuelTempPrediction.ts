"use client";
// app/calculator/hooks/useFuelTempPrediction.ts

import { useEffect, useRef, useState } from "react";

export type FuelTempConfidence = "high" | "medium" | "low";

export function useFuelTempPrediction(input: {
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lon?: number | null;
  ambientNowF?: number | null;
  terminalId?: string | null;  // optional — used to back-fill lat/lon on terminals
}) {
  const { city, state, lat, lon, ambientNowF, terminalId } = input;

  const [predictedFuelTempF, setPredictedFuelTempF] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<FuelTempConfidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastCallAtRef = useRef<number>(0);
  const lastCityKeyRef = useRef<string>("");

  useEffect(() => {
    const ready =
      city && state &&
      typeof lat === "number" && Number.isFinite(lat) &&
      typeof lon === "number" && Number.isFinite(lon) &&
      typeof ambientNowF === "number" && Number.isFinite(ambientNowF);

    if (!ready) {
      setPredictedFuelTempF(null);
      setConfidence(null);
      return;
    }

    const cityKey = `${city}|${state}`;
    const now = Date.now();

    // Re-fetch if: city changed, or ambient changed and it's been > 30s
    const cityChanged = cityKey !== lastCityKeyRef.current;
    const tooSoon = (now - lastCallAtRef.current) < 30_000;
    if (!cityChanged && tooSoon) return;

    lastCityKeyRef.current = cityKey;
    lastCallAtRef.current = now;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ city, state, lat, lon, ambientNowF, terminalId }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp prediction failed.");

        if (!cancelled) {
          setPredictedFuelTempF(
            typeof json.predictedFuelTempF === "number" ? json.predictedFuelTempF : null
          );
          setConfidence(json.confidence ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Error");
          setPredictedFuelTempF(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [city, state, lat, lon, ambientNowF, terminalId]);

  return { predictedFuelTempF, confidence, loading, error };
}
