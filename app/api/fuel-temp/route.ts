// app/api/fuel-temp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

type HourlyPoint = { ts: number; tempF: number; windMph: number; cloudPct: number };

async function geocodeCityState(args: { city: string; state: string; apiKey: string }) {
  const { city, state, apiKey } = args;
  // OpenWeather Geocoding API (1.0) — used only server-side
  const q = encodeURIComponent(`${city},${state},US`);
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json: any = await res.json();
  const item = Array.isArray(json) ? json[0] : null;
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function fetchOneCall3(args: { lat: number; lon: number; apiKey: string }) {
  const { lat, lon, apiKey } = args;

  // One Call API 3.0
  // Docs: https://openweathermap.org/api/one-call-3
  const url =
    `https://api.openweathermap.org/data/3.0/onecall` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&units=imperial` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeather OneCall 3.0 error (${res.status}) ${text ? "- " + text.slice(0, 140) : ""}`.trim());
  }
  return (await res.json()) as any;
}

function pickHourlies24h(onecall: any): HourlyPoint[] {
  const arr = Array.isArray(onecall?.hourly) ? onecall.hourly : [];
  const sliced = arr.slice(0, 24);

  return sliced
    .map((h: any) => {
      const ts = Number(h?.dt);
      const tempF = Number(h?.temp);
      const windMph = Number(h?.wind_speed);
      const cloudPct = Number(h?.clouds);

      if (!Number.isFinite(ts) || !Number.isFinite(tempF)) return null;

      return {
        ts,
        tempF,
        windMph: Number.isFinite(windMph) ? windMph : 0,
        cloudPct: Number.isFinite(cloudPct) ? cloudPct : 0,
      } satisfies HourlyPoint;
    })
    .filter(Boolean) as HourlyPoint[];
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
      terminalId, // optional — used to back-fill lat/lon on terminals table
    } = body as {
      city: string;
      state: string;
      lat?: number;
      lon?: number;
      ambientNowF?: number;
      terminalId?: string;
    };

    if (!city || !state) {
      return NextResponse.json({ error: "city and state are required." }, { status: 400 });
    }

    const owKey = process.env.OPENWEATHER_API_KEY;
    if (!owKey) return NextResponse.json({ error: "OPENWEATHER_API_KEY not set." }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const cityKey = makeCityKey(city, state);
    const nowMs = Date.now();
    const nowTs = Math.floor(nowMs / 1000);

    // Resolve coordinates:
    // 1) body lat/lon
    // 2) terminals table (if terminalId provided)
    // 3) OpenWeather geocode city/state
    let resolvedLat: number | null = Number.isFinite(Number(lat)) ? Number(lat) : null;
    let resolvedLon: number | null = Number.isFinite(Number(lon)) ? Number(lon) : null;

    if ((resolvedLat == null || resolvedLon == null) && terminalId) {
      const { data: trow } = await supabase
        .from("terminals")
        .select("lat, lon")
        .eq("terminal_id", terminalId)
        .maybeSingle();

      const tLat = Number((trow as any)?.lat);
      const tLon = Number((trow as any)?.lon);
      if (Number.isFinite(tLat) && Number.isFinite(tLon)) {
        resolvedLat = tLat;
        resolvedLon = tLon;
      }
    }

    if (resolvedLat == null || resolvedLon == null) {
      const geo = await geocodeCityState({ city, state, apiKey: owKey });
      if (!geo) {
        return NextResponse.json(
          { error: "Unable to resolve lat/lon for city/state. Provide lat/lon or terminalId with coords." },
          { status: 400 }
        );
      }
      resolvedLat = geo.lat;
      resolvedLon = geo.lon;
    }

    // ── Check city-level cache for hourlies ────────────────────────────────
    const { data: cached } = await supabase
      .from("fuel_temp_cache")
      .select("hourly, updated_at")
      .eq("city_key", cityKey)
      .maybeSingle();

    const cacheAgeMin = cached?.updated_at
      ? (nowMs - new Date(cached.updated_at).getTime()) / 60000
      : Infinity;

    let hourlies: HourlyPoint[] | null = null;
    let ambientFromWeather: number | null = null;
    let usedCache = false;

    // If cache is fresh, reuse hourlies; but we may still need ambient if not provided.
    if (cached?.hourly && cacheAgeMin < 25) {
      hourlies = cached.hourly as any;
      usedCache = true;
    }

    // If we need fresh hourlies OR we need ambient but don't have it, call OneCall 3.0
    const needsAmbient = typeof ambientNowF !== "number";
    const needsFreshHourlies = !hourlies;

    if (needsAmbient || needsFreshHourlies) {
      const onecall = await fetchOneCall3({ lat: resolvedLat, lon: resolvedLon, apiKey: owKey });

      // ambient from OneCall current.temp
      const curTemp = Number(onecall?.current?.temp);
      ambientFromWeather = Number.isFinite(curTemp) ? curTemp : null;

      if (!hourlies) {
        hourlies = pickHourlies24h(onecall);
        // Upsert cache
        await supabase.from("fuel_temp_cache").upsert(
          {
            city_key: cityKey,
            lat: resolvedLat,
            lon: resolvedLon,
            hourly: hourlies,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "city_key" }
        );
        usedCache = false;
      }
    }

    if (!hourlies || hourlies.length === 0) {
      return NextResponse.json({ error: "No hourly weather data available." }, { status: 502 });
    }

    // Choose ambient to use:
    // 1) client-supplied ambientNowF (e.g., manual override)
    // 2) OneCall ambientFromWeather
    const ambientUsed =
      typeof ambientNowF === "number" && Number.isFinite(ambientNowF)
        ? ambientNowF
        : ambientFromWeather;

    if (typeof ambientUsed !== "number" || !Number.isFinite(ambientUsed)) {
      return NextResponse.json({ error: "ambientNowF missing and unable to fetch ambient from OneCall current.temp." }, { status: 502 });
    }

    // ── Run predictor ──────────────────────────────────────────────────────
    const result = predictFuelTempNow(hourlies, resolvedLat, resolvedLon, ambientUsed, nowTs, {
      tankPreset: "large",
      betaSun: 2.0,
      cwWind: 0.04,
      maxWindMultiplier: 2.5,
    });

    // ── Back-fill lat/lon on terminals table if provided ───────────────────
    // Only writes if the terminal doesn't have coordinates yet.
    if (terminalId) {
      await supabase
        .from("terminals")
        .update({ lat: resolvedLat, lon: resolvedLon })
        .eq("terminal_id", terminalId)
        .is("lat", null);
    }

    return NextResponse.json({
      city,
      state,
      cityKey,
      lat: resolvedLat,
      lon: resolvedLon,
      ambientNowF: ambientUsed,
      predictedFuelTempF: result.predictedFuelTempF,
      confidence: result.confidence,
      usedCache,
    });
  } catch (e: any) {
    console.error("[fuel-temp]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}