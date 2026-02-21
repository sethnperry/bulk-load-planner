// lib/fuelTempPredictor.ts
// Physics-informed predictor: first-order lag + solar gain.
// Above-ground, light-colored (white/light gray) tanks.
// Outputs a "recommended product temp" estimate (no conservative bias injection).

export type HourlyWx = {
  ts: number; // unix seconds
  tempF: number;
  windMph: number; // 0 if unknown
  cloudPct: number; // 0..100
};

export type PredictorParams = {
  tankPreset?: "small" | "medium" | "large"; // small=fast, large=slow
  betaSun?: number; // °F per hour at peak sun, clear sky (default ~2.0)
  cwWind?: number; // wind sensitivity multiplier per mph (default ~0.04)
  maxWindMultiplier?: number; // default ~2.5
};

export type FuelTempResult = {
  predictedFuelTempF: number;
  confidence: "high" | "medium" | "low";
  debug?: {
    seedFuelTempF: number;
    lastSimTs: number;
    k0: number;
    betaSun: number;
  };
};

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}
function rad2deg(r: number) {
  return (r * 180) / Math.PI;
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}

/**
 * Solar elevation (radians) from timestamp + lat/lon.
 * Lightweight approximation to keep deps out (swap for suncalc later if you want).
 */
export function solarElevationRad(unixSeconds: number, latDeg: number, lonDeg: number): number {
  const date = new Date(unixSeconds * 1000);

  // Julian day
  const msPerDay = 86400000;
  const jd = date.getTime() / msPerDay + 2440587.5;
  const n = jd - 2451545.0;

  // Mean longitude / anomaly (deg)
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;

  // Ecliptic longitude (deg)
  const lambda = L + 1.915 * Math.sin(deg2rad(g)) + 0.02 * Math.sin(deg2rad(2 * g));

  // Obliquity (deg)
  const epsilon = 23.439 - 0.0000004 * n;

  // Declination (rad)
  const sinDec = Math.sin(deg2rad(epsilon)) * Math.sin(deg2rad(lambda));
  const dec = Math.asin(sinDec);

  // Equation of time rough (minutes)
  const y = Math.tan(deg2rad(epsilon) / 2) ** 2;
  const eqTime =
    4 *
    rad2deg(
      y * Math.sin(2 * deg2rad(L)) -
        2 * 0.0167 * Math.sin(deg2rad(g)) +
        4 * 0.0167 * y * Math.sin(deg2rad(g)) * Math.cos(2 * deg2rad(L)) -
        0.5 * y * y * Math.sin(4 * deg2rad(L)) -
        1.25 * 0.0167 * 0.0167 * Math.sin(2 * deg2rad(g))
    );

  // True solar time (minutes)
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarMinutes = (utcMinutes + eqTime + 4 * lonDeg) % 1440;

  // Hour angle (deg)
  const hourAngleDeg = trueSolarMinutes / 4 - 180;
  const ha = deg2rad(hourAngleDeg);

  const lat = deg2rad(latDeg);

  // Solar elevation
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(clamp(sinEl, -1, 1));
}

function tankPresetToK0(preset: PredictorParams["tankPreset"]): number {
  switch (preset) {
    case "small":
      return 0.08; // e.g., ~250k gal
    case "large":
      return 0.03; // e.g., ~3M gal
    case "medium":
    default:
      return 0.05; // e.g., ~1M gal
  }
}

function confidenceFromCloudAndWind(hourlies: HourlyWx[]) {
  const last = hourlies[hourlies.length - 1];
  const avgCloud = hourlies.reduce((s, h) => s + (h.cloudPct ?? 0), 0) / hourlies.length;
  const avgWind = hourlies.reduce((s, h) => s + (h.windMph ?? 0), 0) / hourlies.length;

  if (last && avgCloud < 35 && avgWind < 15) return "high";
  if (avgCloud < 70) return "medium";
  return "low";
}

/**
 * Predict fuel temp "now" by:
 * 1) Simulating across hourly weather points (24–30h recommended).
 * 2) Blending toward current ambient (5-minute heartbeat) within the current hour.
 */
export function predictFuelTempNow(
  hourlies: HourlyWx[],
  latDeg: number,
  lonDeg: number,
  ambientNowF: number,
  nowTs: number,
  params: PredictorParams = {}
): FuelTempResult {
  if (!hourlies || hourlies.length < 6) {
    // Fallback: slight lag behind ambient
    return { predictedFuelTempF: round1(ambientNowF - 2), confidence: "low" };
  }

  const k0 = tankPresetToK0(params.tankPreset ?? "medium");
  const betaSun = params.betaSun ?? 2.0;
  const cwWind = params.cwWind ?? 0.04;
  const maxWindMultiplier = params.maxWindMultiplier ?? 2.5;

  let Tf = hourlies[0].tempF;
  let lastSimTs = hourlies[0].ts;

  for (let i = 0; i < hourlies.length; i++) {
    const h = hourlies[i];
    const dtHours = Math.max(0.25, (h.ts - lastSimTs) / 3600); // min 15 min

    // Effective k with wind
    const wind = Math.max(0, h.windMph ?? 0);
    const windMult = clamp(1 + cwWind * wind, 1, maxWindMultiplier);
    const k = clamp(k0 * windMult, 0.005, 0.25);

    // Solar heating
    const el = solarElevationRad(h.ts, latDeg, lonDeg);
    const sunFactor = Math.max(0, Math.sin(el)); // 0..1
    const cloud = clamp((h.cloudPct ?? 0) / 100, 0, 1);
    const cloudFactor = 1 - cloud; // 1 clear -> 0 overcast
    const qSunPerHour = betaSun * sunFactor * cloudFactor;

    Tf = Tf + k * (h.tempF - Tf) * dtHours + qSunPerHour * dtHours;
    lastSimTs = h.ts;
  }

  // Within-hour refinement toward 5-min ambient heartbeat
  const lastHourly = hourlies[hourlies.length - 1];
  const fracHour = clamp((nowTs - lastHourly.ts) / 3600, 0, 1);
  const kWithin = 0.35 * k0; // gentle pull
  Tf = Tf + kWithin * (ambientNowF - Tf) * fracHour;

  return {
    predictedFuelTempF: round1(Tf),
    confidence: confidenceFromCloudAndWind(hourlies),
    debug: { seedFuelTempF: hourlies[0].tempF, lastSimTs, k0, betaSun },
  };
}
