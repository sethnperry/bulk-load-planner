// Keep function names identical to page.tsx (underscore suffix) to avoid behavior drift.

export function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toLocalMidnight(dateLike: string) {
  // Accepts "YYYY-MM-DD" OR "YYYY-MM-DDTHH:mm:ss..." and normalizes to local midnight
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function todayLocalMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
}

export function formatMDY(dateLike: string) {
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return `${m}-${d}-${y}`;
}

export function isoToday_() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function addDaysISO_(iso: string, days: number) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

export function daysUntilISO_(iso: string | null | undefined) {
  if (!iso) return null;
  const todayISO = isoToday_();
  const [ty, tm, td] = todayISO.slice(0, 10).split("-").map((v) => Number(v));
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const a = new Date(ty, (tm || 1) - 1, td || 1);
  const b = new Date(y, (m || 1) - 1, d || 1);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function formatMDYWithCountdown_(iso: string) {
  const mdy = formatMDY(iso);
  const d = daysUntilISO_(iso);
  if (d === null) return mdy;
  return `${mdy} (${d} days)`;
}

export function isPastISO_(iso: string | null | undefined) {
  if (!iso) return false;
  // Lexicographic compare works for YYYY-MM-DD
  return iso < isoToday_();
}
