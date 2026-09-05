// lib/capacity/useUtilizationPeriod.ts
//
// Which window a driver's utilization average covers -- resolved in ONE place
// so the Planner card and the Reports section can never quote different
// numbers for the same driver.
//
// Reuses the company's own configured report period when there is one, and
// falls back to a plain rolling 30 days when there isn't. That fallback is the
// point, not a convenience: measurement must work for a company that has
// configured nothing at all (docs/incentive-redesign-plan.md, TEST K), so this
// never gates on incentive_settings.enabled the way the legacy points card
// does -- it only reads the period shape, and shrugs if there isn't one.

"use client";

import { useQuery } from "@tanstack/react-query";

import { generatePayPeriods, type PayPeriodType } from "@/app/admin/payPeriods";
import { supabase } from "@/lib/supabase/client";

const FALLBACK_DAYS = 30;

const PERIOD_LABELS: Record<PayPeriodType, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-Monthly",
  monthly: "Monthly",
};

export type UtilizationPeriod = {
  /** ISO timestamp to filter loaded_at from. */
  since: string;
  /** For the Planner card's compact right-hand label, e.g. "Biweekly Avg". */
  shortLabel: string;
  /** For the Reports header, e.g. "This biweekly period". */
  longLabel: string;
};

function rollingWindow(): UtilizationPeriod {
  const d = new Date();
  d.setDate(d.getDate() - FALLBACK_DAYS);
  return {
    since: d.toISOString(),
    shortLabel: `${FALLBACK_DAYS}-Day Avg`,
    longLabel: `Last ${FALLBACK_DAYS} days`,
  };
}

export function useUtilizationPeriod(companyId: string | null): UtilizationPeriod {
  const { data } = useQuery({
    queryKey: ["utilizationPeriod", companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incentive_settings")
        .select("pay_period_type, pay_period_anchor_date")
        .eq("company_id", companyId!)
        .maybeSingle();
      // A company with no settings row at all is the normal, expected case
      // here -- not an error worth surfacing. The caller falls back.
      if (error) return null;
      return data;
    },
  });

  const anchor = data?.pay_period_anchor_date as string | null | undefined;
  if (!anchor) return rollingWindow();

  const type = ((data?.pay_period_type as PayPeriodType | null) ?? "biweekly");
  const start = generatePayPeriods(type, anchor, 1)[0]?.start;
  if (!start) return rollingWindow();

  return {
    since: `${start}T00:00:00Z`,
    shortLabel: `${PERIOD_LABELS[type]} Avg`,
    longLabel: `This ${PERIOD_LABELS[type].toLowerCase()} period`,
  };
}
