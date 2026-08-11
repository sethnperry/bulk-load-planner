// app/api/fuel-temp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { predictFuelTempNow, type AmbientPoint } from "@/lib/fuelTempPredictor";

export const runtime = "nodejs";
// Explicit, not just implied by the fetch(...,{cache:"no-store"}) calls
// inside this route -- eliminates any possibility of Vercel's own route
// response caching serving a stale prediction for this POST endpoint,
// which otherwise would have been silently indistinguishable from a
// client-side staleness bug (both look like "the number never updates").
export const dynamic = "force-dynamic";

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

// Only `current` conditions are needed now -- the model walks real past
// readings from ambient_temp_history, not a forecast, so there's no reason
// to pull (or cache) OneCall's hourly/daily forecast data anymore.
async function fetchCurrentConditions(args: { lat: number; lon: number; apiKey: string }) {
  const { lat, lon, apiKey } = args;
  const url =
    `https://api.openweathermap.org/data/3.0/onecall` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&exclude=minutely,hourly,daily,alerts` +
    `&units=imperial` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeather OneCall 3.0 error (${res.status}) ${text ? "- " + text.slice(0, 140) : ""}`.trim());
  }
  const json: any = await res.json();
  const tempF = Number(json?.current?.temp);
  const cloudPct = Number(json?.current?.clouds);
  return {
    tempF: Number.isFinite(tempF) ? tempF : null,
    cloudPct: Number.isFinite(cloudPct) ? cloudPct : null,
  };
}

// Insert "now" into this city's rolling history, throttled so a busy
// terminal (many drivers polling the same city) doesn't spam near-duplicate
// rows -- only writes when the most recent stored point is stale enough to
// be worth a new sample. Also prunes anything older than the model needs.
const MIN_SAMPLE_INTERVAL_MIN = 20;
const HISTORY_LOOKBACK_HOURS = 30;

async function collectAmbientHistory(
  // Typed loosely to match how the rest of this file already treats the
  // service-role client -- ambient_temp_history isn't in the generated
  // Database types, and Supabase's default generic makes .insert() with a
  // literal object a hard type error otherwise (unlike .select(), which
  // resolves loosely enough not to complain).
  supabase: any,
  cityKey: string,
  nowTs: number,
  ambientNowF: number
): Promise<AmbientPoint[]> {
  const lookbackTs = nowTs - HISTORY_LOOKBACK_HOURS * 3600;

  const { data: rows } = await supabase
    .from("ambient_temp_history")
    .select("ts, temp_f")
    .eq("city_key", cityKey)
    .gte("ts", new Date(lookbackTs * 1000).toISOString())
    .order("ts", { ascending: true });

  const history: AmbientPoint[] = (rows ?? []).map((r: any) => ({
    ts: Math.floor(new Date(r.ts).getTime() / 1000),
    tempF: Number(r.temp_f),
  }));

  const lastPoint = history[history.length - 1];
  const staleEnough = !lastPoint || nowTs - lastPoint.ts >= MIN_SAMPLE_INTERVAL_MIN * 60;

  if (staleEnough) {
    try {
      await supabase.from("ambient_temp_history").insert({
        city_key: cityKey,
        ts: new Date(nowTs * 1000).toISOString(),
        temp_f: ambientNowF,
      });
      history.push({ ts: nowTs, tempF: ambientNowF });
    } catch {
      // Non-fatal (e.g. a near-simultaneous insert from another request
      // racing on the same primary key) -- the prediction still works fine
      // off whatever history was already read.
    }

    // Housekeeping, non-fatal -- keep the table from growing unbounded.
    try {
      await supabase
        .from("ambient_temp_history")
        .delete()
        .eq("city_key", cityKey)
        .lt("ts", new Date(lookbackTs * 1000).toISOString());
    } catch { /* non-fatal */ }
  }

  return history;
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

    // Supabase is optional — used for ambient history, bias lookup, and terminal lat/lon
    const supabase = tryGetSupabaseAdmin();
    const cityKey = makeCityKey(city, state);
    const nowTs = Math.floor(Date.now() / 1000);

    // Resolve coordinates. (0, 0) -- "Null Island", a point in the Gulf of
    // Guinea -- is never a legitimate terminal or city location; it only
    // ever shows up here as bad seed data (confirmed live: 3 real terminals
    // had lat/lon literally stored as 0/0). Number.isFinite(0) is true, so
    // without this explicit check that bad data reads as "resolved" and
    // silently skips both the terminal-lookup and city-geocode fallbacks
    // below, fetching real (but totally wrong) weather for the equator
    // instead of ever raising an error or falling through to a better
    // source.
    const isRealCoord = (a: number | null, b: number | null): a is number =>
      Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);

    let resolvedLat: number | null = Number(lat);
    let resolvedLon: number | null = Number(lon);
    if (!isRealCoord(resolvedLat, resolvedLon)) {
      resolvedLat = null;
      resolvedLon = null;
    }

    if ((resolvedLat == null || resolvedLon == null) && terminalId && supabase) {
      try {
        const { data: trow } = await supabase
          .from("terminals")
          .select("lat, lon")
          .eq("terminal_id", terminalId)
          .maybeSingle();
        const tLat = Number((trow as any)?.lat);
        const tLon = Number((trow as any)?.lon);
        if (isRealCoord(tLat, tLon)) {
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

    // Current conditions -- always fetched fresh (a single lightweight
    // `current`-only call, no forecast payload to cache anymore). Needed
    // even when the caller supplied ambientNowF directly, since the solar
    // term still needs cloud cover.
    const current = await fetchCurrentConditions({ lat: resolvedLat, lon: resolvedLon, apiKey: owKey });
    const cloudPct = current.cloudPct;
    const ambientUsed: number | null =
      typeof ambientNowF === "number" && Number.isFinite(ambientNowF) ? ambientNowF : current.tempF;

    if (typeof ambientUsed !== "number" || !Number.isFinite(ambientUsed)) {
      return NextResponse.json(
        { error: "ambientNowF missing and unable to fetch from OneCall current.temp." },
        { status: 502 }
      );
    }

    // Real ambient history for this city -- the actual fix (see
    // lib/fuelTempPredictor.ts header). Falls back to an empty array (and
    // the predictor's own "no history yet" branch) if Supabase is unavailable.
    const history = supabase
      ? await collectAmbientHistory(supabase, cityKey, nowTs, ambientUsed)
      : [];

    // Look up historical bias correction for this terminal + hour + month
    let biasCorrectionF = 0;
    let biasSampleCount = 0;
    if (supabase && terminalId) {
      try {
        const nowDate = new Date(nowTs * 1000);
        // Bucketed to a 3-hour window (0,3,6,...,21) rather than the exact UTC hour.
        // Must match the bucketing in useLoadWorkflow.ts's write side.
        const hourUtc = Math.floor(nowDate.getUTCHours() / 3) * 3;
        const monthOfYear = nowDate.getUTCMonth() + 1;

        const { data: biasRow } = await supabase
          .from("terminal_temp_bias")
          .select("mean_error, sample_count")
          .eq("terminal_id", terminalId)
          .eq("hour_of_day", hourUtc)
          .eq("month_of_year", monthOfYear)
          .maybeSingle();

        if (biasRow) {
          biasCorrectionF = Number(biasRow.mean_error) || 0;
          biasSampleCount = Number(biasRow.sample_count) || 0;
        }
      } catch { /* non-fatal */ }
    }

    const result = predictFuelTempNow(history, ambientUsed, nowTs, resolvedLat, resolvedLon, {
      halfLifeHours: 20,
      maxSolarBumpF: 3,
      cloudPct,
      biasCorrectionF,
      biasSampleCount,
    });

    // Back-fill terminal coords if missing OR stuck at the bad (0,0) seed
    // value (non-fatal) -- self-heals any other terminal hit by the same
    // bad-data class this request may have just worked around.
    if (terminalId && supabase) {
      try {
        await supabase
          .from("terminals")
          .update({ lat: resolvedLat, lon: resolvedLon })
          .eq("terminal_id", terminalId)
          .or("lat.is.null,and(lat.eq.0,lon.eq.0)");
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
      biasApplied: result.biasApplied,
      biasSampleCount: result.biasSampleCount,
      historyPoints: history.length,
      serverNow: new Date(nowTs * 1000).toISOString(),
    });
  } catch (e: any) {
    console.error("[fuel-temp]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
