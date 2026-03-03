// app/api/fuel-temp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { predictFuelTempNow } from "@/lib/fuelTempPredictor";

export const runtime = "nodejs";

function tryGetSupabaseAdmin() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

// Normalize city/state into a stable cache key
function makeCityKey(city: string, state: string): string {
  return `${city.trim().toLowerCase().replace(/\s+/g, "_")}|${state.trim().toLowerCase()}`;
}

type HourlyPoint = { ts: number; tempF: number; windMph: number; cloudPct: number };

async function geocodeCityState(args: { city: string; state: string; apiKey: string }) {
  const { city, state, apiKey } = args;
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
    const { city, state, lat, lon, ambientNowF, terminalId } = body as {
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

    // Supabase is optional — used only for caching and terminal lat/lon lookup
    const supabase = tryGetSupabaseAdmin();
    const cityKey = makeCityKey(city, state);
    const nowMs = Date.now();
    const nowTs = Math.floor(nowMs / 1000);

    // Resolve coordinates
    let resolvedLat: number | null = Number.isFinite(Number(lat)) ? Number(lat) : null;
    let resolvedLon: number | null = Number.isFinite(Number(lon)) ? Number(lon) : null;

    if ((resolvedLat == null || resolvedLon == null) && terminalId && supabase) {
      try {
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
      } catch { /* non-fatal */ }
    }

    if (resolvedLat == null || resolvedLon == null) {
      const geo = await geocodeCityState({ city, state, apiKey: owKey });
      if (!geo) {
        return NextResponse.json(
          { error: "Unable to resolve lat/lon for city/state." },
          { status: 400 }
        );
      }
      resolvedLat = geo.lat;
      resolvedLon = geo.lon;
    }

    // Check cache (optional — skip if supabase unavailable)
    let hourlies: HourlyPoint[] | null = null;
    let ambientFromWeather: number | null = null;
    let usedCache = false;

    if (supabase) {
      try {
        const { data: cached } = await supabase
          .from("fuel_temp_cache")
          .select("hourly, updated_at")
          .eq("city_key", cityKey)
          .maybeSingle();

        const cacheAgeMin = cached?.updated_at
          ? (nowMs - new Date(cached.updated_at).getTime()) / 60000
          : Infinity;

        if (cached?.hourly && cacheAgeMin < 25) {
          hourlies = cached.hourly as any;
          usedCache = true;
        }
      } catch { /* non-fatal — proceed without cache */ }
    }

    // Fetch fresh weather if needed
    const needsAmbient = typeof ambientNowF !== "number";
    const needsFreshHourlies = !hourlies;

    if (needsAmbient || needsFreshHourlies) {
      const onecall = await fetchOneCall3({ lat: resolvedLat, lon: resolvedLon, apiKey: owKey });

      const curTemp = Number(onecall?.current?.temp);
      ambientFromWeather = Number.isFinite(curTemp) ? curTemp : null;

      if (!hourlies) {
        hourlies = pickHourlies24h(onecall);
        // Try to cache — non-fatal if it fails
        if (supabase) {
          try {
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
          } catch { /* non-fatal */ }
          usedCache = false;
        }
      }
    }

    if (!hourlies || hourlies.length === 0) {
      return NextResponse.json({ error: "No hourly weather data available." }, { status: 502 });
    }

    const ambientUsed =
      typeof ambientNowF === "number" && Number.isFinite(ambientNowF)
        ? ambientNowF
        : ambientFromWeather;

    if (typeof ambientUsed !== "number" || !Number.isFinite(ambientUsed)) {
      return NextResponse.json(
        { error: "ambientNowF missing and unable to fetch from OneCall current.temp." },
        { status: 502 }
      );
    }

    const result = predictFuelTempNow(hourlies, resolvedLat, resolvedLon, ambientUsed, nowTs, {
      tankPreset: "large",
      betaSun: 2.0,
      cwWind: 0.04,
      maxWindMultiplier: 2.5,
    });

    // Back-fill terminal coords if missing (non-fatal)
    if (terminalId && supabase) {
      try {
        await supabase
          .from("terminals")
          .update({ lat: resolvedLat, lon: resolvedLon })
          .eq("terminal_id", terminalId)
          .is("lat", null);
      } catch { /* non-fatal */ }
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