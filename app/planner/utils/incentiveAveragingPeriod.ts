// app/planner/utils/incentiveAveragingPeriod.ts
//
// Pure date math for the incentive system's "averaging period" (the
// Planner's running-average card) -- calendar-aligned, no anchor date at
// all. Deliberately does NOT import from or extend app/admin/payPeriods.ts:
// that module drives a completely different feature (the Period Report's
// CSV export), and the incentive system isn't meant to relate to payroll
// concepts at all -- see the 20260818000000_incentive_averaging_period.sql
// migration's own header comment. Week starts Sunday; month/quarter/year
// always run from their real calendar start through today, so there's
// nothing for an admin to anchor.

export type AveragingPeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

export const AVERAGING_PERIOD_LABELS: Record<AveragingPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(y: number, m: number, d: number): string {
  // Date.UTC normalizes out-of-range month/day into the correct real
  // calendar date -- avoids manual rollover logic (e.g. "day 0" of a
  // month correctly becomes the last day of the previous one).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Returns the ISO (yyyy-mm-dd) start of the calendar period containing
 * `today` (a real Date, read via its UTC fields so this is stable
 * regardless of the caller's local timezone).
 */
export function averagingPeriodStart(periodType: AveragingPeriodType, today: Date): string {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1; // 1-12
  const d = today.getUTCDate();

  switch (periodType) {
    case "daily":
      return toISO(y, m, d);
    case "weekly":
      // getUTCDay(): 0 = Sunday -- subtracting it lands on this week's Sunday.
      return toISO(y, m, d - today.getUTCDay());
    case "monthly":
      return toISO(y, m, 1);
    case "quarterly": {
      const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1, 4, 7, or 10
      return toISO(y, quarterStartMonth, 1);
    }
    case "annually":
      return toISO(y, 1, 1);
  }
}
