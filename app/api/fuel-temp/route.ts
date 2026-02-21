// app/api/fuel-temp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchHourlyWeather24h } from "@/lib/weather/openWeather";
import { predictFuelTempNow } from "@/lib/fuelTempPredictor";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Normalize city/state into a stable cache key
function makeCityKey(city: string, state: string): string {
  return `${city.trim().toLowerCase().replace(/\s+/g, "_")}|${state.trim().toLowerCase()}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      city,
      state,
      lat,
      lon,
      ambientNowF,
      terminalId,   // optional — used to back-fill lat/lon on terminals table
    } = body as {
      city: string;
      state: string;
      lat: number;
      lon: number;
      ambientNowF: number;
      terminalId?: string;
    };

    if (!city || !state) {
      return NextResponse.json({ error: "city and state are required." }, { status: 400 });
    }
    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json({ error: "lat/lon are required numbers." }, { status: 400 });
    }
    if (typeof ambientNowF !== "number") {
      return NextResponse.json({ error: "ambientNowF is required number." }, { status: 400 });
    }

    const owKey = process.env.OPENWEATHER_API_KEY!;
    if (!owKey) return NextResponse.json({ error: "OPENWEATHER_API_KEY not set." }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const cityKey = makeCityKey(city, state);
    const nowMs = Date.now();
    const nowTs = Math.floor(nowMs / 1000);

    // ── Check city-level cache ─────────────────────────────────────────────
    const { data: cached } = await supabase
      .from("fuel_temp_cache")
      .select("hourly, updated_at")
      .eq("city_key", cityKey)
      .maybeSingle();

    const cacheAgeMin = cached?.updated_at
      ? (nowMs - new Date(cached.updated_at).getTime()) / 60000
      : Infinity;

    let hourlies: { ts: number; tempF: number; windMph: number; cloudPct: number }[];

    if (cached?.hourly && cacheAgeMin < 25) {
      // Cache is fresh — reuse hourly data, just recompute with latest ambient
      hourlies = cached.hourly as any;
    } else {
      // Fetch fresh hourly forecast from OpenWeather One Call 3.0
      hourlies = await fetchHourlyWeather24h({ lat, lon, apiKey: owKey });

      // Upsert into city-keyed cache
      await supabase
        .from("fuel_temp_cache")
        .upsert(
          {
            city_key: cityKey,
            lat,
            lon,
            hourly: hourlies,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "city_key" }
        );
    }

    // ── Run the predictor ──────────────────────────────────────────────────
    // "large" tank = k0=0.03 = slowest thermal response = coldest prediction
    // This is intentionally conservative to avoid overweight loads.
    const result = predictFuelTempNow(hourlies, lat, lon, ambientNowF, nowTs, {
      tankPreset: "large",
      betaSun: 2.0,
      cwWind: 0.04,
      maxWindMultiplier: 2.5,
    });

    // ── Back-fill lat/lon on terminals table if provided ──────────────────
    // Only writes if the terminal doesn't have coordinates yet.
    // This way terminals self-populate on first use, no manual data entry.
    if (terminalId) {
      await supabase
        .from("terminals")
        .update({ lat, lon })
        .eq("terminal_id", terminalId)
        .is("lat", null); // only write if not already set
    }

    return NextResponse.json({
      city,
      state,
      cityKey,
      predictedFuelTempF: result.predictedFuelTempF,
      confidence: result.confidence,
    });
  } catch (e: any) {
    console.error("[fuel-temp]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
