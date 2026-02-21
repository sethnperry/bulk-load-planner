// lib/weather/openWeather.ts
// OpenWeather hourly fetch helper.
// NOTE: This uses One Call 3.0. If your plan uses a different endpoint,
// swap the URL/shape but keep the returned mapping.

export type OpenWeatherHourly = {
  dt: number; // unix seconds
  temp: number; // °F when units=imperial
  wind_speed?: number; // mph when units=imperial
  clouds?: number; // 0..100
};

export type OneCallResponse = {
  hourly?: OpenWeatherHourly[];
  current?: { dt: number; temp: number; wind_speed?: number; clouds?: number };
};

export async function fetchHourlyWeather24h(params: {
  lat: number;
  lon: number;
  apiKey: string;
}): Promise<{ ts: number; tempF: number; windMph: number; cloudPct: number }[]> {
  const { lat, lon, apiKey } = params;

  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,daily,alerts&units=imperial&appid=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`OpenWeather error: ${res.status}`);
  const data = (await res.json()) as OneCallResponse;

  const hourly = (data.hourly ?? []).slice(0, 30); // ~30 hours
  if (hourly.length < 6) throw new Error("OpenWeather hourly data missing/too short.");

  return hourly.map((h) => ({
    ts: Number(h.dt),
    tempF: Number(h.temp),
    windMph: Number(h.wind_speed ?? 0),
    cloudPct: Number(h.clouds ?? 0),
  }));
}
