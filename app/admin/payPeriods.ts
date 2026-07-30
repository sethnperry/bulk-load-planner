// app/admin/payPeriods.ts
//
// Pure date math: generates pay period boundaries from
// incentive_settings.pay_period_type + pay_period_anchor_date. No DB calls --
// the admin picks from this generated list rather than typing dates
// manually, per CLAUDE.md's payroll report spec.

export type PayPeriodType = "weekly" | "biweekly" | "semi_monthly" | "monthly";
export type PayPeriod = { start: string; end: string; label: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(y: number, m: number, d: number): string {
  // Date.UTC normalizes out-of-range month/day (e.g. month 13, day 0)
  // into the correct real calendar date -- avoids manual rollover logic.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso);
  return toISO(y, m, d + days);
}

function daysBetween(aISO: string, bISO: string): number {
  return Math.round((Date.parse(`${bISO}T00:00:00Z`) - Date.parse(`${aISO}T00:00:00Z`)) / 86400000);
}

function fmtShort(iso: string): string {
  const { m, d } = parseISO(iso);
  return `${m}/${d}`;
}

export function generatePayPeriods(
  periodType: PayPeriodType,
  anchorDateISO: string,
  count = 12,
  referenceDateISO?: string
): PayPeriod[] {
  const today = referenceDateISO ?? new Date().toISOString().slice(0, 10);

  if (periodType === "weekly" || periodType === "biweekly") {
    const len = periodType === "weekly" ? 7 : 14;
    const diff = daysBetween(anchorDateISO, today);
    const periodsSinceAnchor = Math.floor(diff / len);
    const latestStart = addDays(anchorDateISO, periodsSinceAnchor * len);
    const periods: PayPeriod[] = [];
    for (let i = 0; i < count; i++) {
      const start = addDays(latestStart, -i * len);
      const end = addDays(start, len - 1);
      periods.push({ start, end, label: `${fmtShort(start)} – ${fmtShort(end)}` });
    }
    return periods;
  }

  if (periodType === "monthly") {
    const { d: anchorDay } = parseISO(anchorDateISO);
    const { y: ty, m: tm, d: td } = parseISO(today);
    let y = ty, m = tm;
    if (td < anchorDay) { m -= 1; if (m < 1) { m = 12; y -= 1; } }
    const periods: PayPeriod[] = [];
    for (let i = 0; i < count; i++) {
      let cy = y, cm = m - i;
      while (cm < 1) { cm += 12; cy -= 1; }
      const start = toISO(cy, cm, anchorDay);
      const end = addDays(toISO(cy, cm + 1, anchorDay), -1);
      periods.push({ start, end, label: `${fmtShort(start)} – ${fmtShort(end)}` });
    }
    return periods;
  }

  // semi_monthly -- two periods per month. splitDay clamped to 1-15 so the
  // "A" half (splitDay to splitDay+14, 15 days) never overflows into the
  // following month's A start; the "B" half absorbs whatever's left,
  // matching the standard 1-15/16-EOM convention when splitDay = 1.
  const { d: anchorDayRaw } = parseISO(anchorDateISO);
  const splitDay = Math.min(Math.max(anchorDayRaw, 1), 15);
  const { y: ty } = parseISO(today);

  const starts: string[] = [];
  for (let yy = ty - 2; yy <= ty + 1; yy++) {
    for (let mm = 1; mm <= 12; mm++) {
      const aStart = toISO(yy, mm, splitDay);
      starts.push(aStart, addDays(aStart, 15));
    }
  }
  starts.sort();

  const pastPeriods: PayPeriod[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i] <= today) {
      pastPeriods.push({ start: starts[i], end: addDays(starts[i + 1], -1), label: "" });
    }
  }
  return pastPeriods
    .slice(-count)
    .reverse()
    .map((p) => ({ ...p, label: `${fmtShort(p.start)} – ${fmtShort(p.end)}` }));
}
