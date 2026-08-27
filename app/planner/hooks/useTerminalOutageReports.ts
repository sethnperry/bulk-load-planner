"use client";
// app/planner/hooks/useTerminalOutageReports.ts
//
// Owns: posting Out of Product / Out of Allocation reports
// (submitOutageReport, called from page.tsx's onSubmitOutageReport, which
// CancelLoadSheet.tsx's new "Report Terminal Issue" flow calls into), and
// reading back the currently-active ones as two separate per-type message
// lists (useActiveOutageBanner, used by the shared TerminalOutageBanner.tsx
// -- one MessageTicker.tsx row for Out of Product, another for Out of
// Allocation).
//
// Out of Product also reuses the Terminal tab's existing
// rack_product_status.is_out flag (see RackProductStatusModal.tsx) so the
// Terminal tab's own product list never disagrees with this banner -- see
// CLAUDE.md "Terminal outage banners" for the full design.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { resolveEffectiveRackId } from "../utils/rack";
import { mostRecentClearingCheckpoint, nextClearingCheckpoint, hhmmInTimeZone } from "../utils/dates";

export type OutageReportType = "out_of_product" | "out_of_allocation";

// ─── Submit ─────────────────────────────────────────────────────────────────

type SubmitArgs = {
  terminalId: string;
  selectedRackId: string | null;
  productIds: string[];
  reportType: OutageReportType;
  companyId: string;
  userId: string;
  truckLabel: string;
};

/**
 * Posts one report row per selected product. For "out_of_product", also
 * upserts rack_product_status.is_out = true for each (same shape
 * RackProductStatusModal.tsx already writes) -- resolved via the same
 * fallback-to-single-rack logic useLoadWorkflow.ts's own rack_product_status
 * write already uses (see resolveEffectiveRackId). If no rack can be
 * resolved (a multi-rack terminal with no explicit selection), the report
 * still posts -- the banner still works, it just can't also flip the
 * Terminal tab's own per-rack flag.
 */
export async function submitOutageReport({
  terminalId, selectedRackId, productIds, reportType, companyId, userId, truckLabel,
}: SubmitArgs): Promise<{ error: string | null }> {
  if (!terminalId || !companyId || !userId || productIds.length === 0) {
    return { error: "Missing required info to submit this report." };
  }

  let rackId: string | null = null;
  if (reportType === "out_of_product") {
    rackId = await resolveEffectiveRackId(selectedRackId, terminalId);
    if (rackId) {
      const nowIso = new Date().toISOString();
      for (const productId of productIds) {
        const { error } = await supabase.from("rack_product_status").upsert(
          { rack_id: rackId, product_id: productId, is_out: true, updated_at: nowIso, updated_by: userId, active: true },
          { onConflict: "rack_id,product_id" }
        );
        if (error) return { error: error.message };
      }
    }
  }

  const rows = productIds.map((productId) => ({
    terminal_id: terminalId,
    rack_id: rackId,
    product_id: productId,
    report_type: reportType,
    company_id: companyId,
    reporter_user_id: userId,
    truck_label: truckLabel || null,
  }));

  const { error } = await supabase.from("terminal_outage_reports").insert(rows);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Read (banner) ──────────────────────────────────────────────────────────

type OutageRow = {
  report_id: string;
  product_id: string;
  report_type: OutageReportType;
  company_id: string;
  reporter_user_id: string;
  truck_label: string | null;
  created_at: string;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type ComposedOutageReport = {
  reportId: string;
  reportType: OutageReportType;
  text: string;
  expiresAtMs: number;
  canClear: boolean;
};

/** Deletes one report early, instead of waiting for its natural checkpoint
 * expiry -- only succeeds for the reporter's own report (RLS-enforced, see
 * the 20260829000000 migration); a stray call for someone else's report
 * simply deletes 0 rows. */
export async function clearOutageReport(reportId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("terminal_outage_reports").delete().eq("report_id", reportId);
  return { error: error ? error.message : null };
}

/**
 * Polls (30s, matching the existing trainee-banner precedent in page.tsx)
 * for currently-active outage reports at `terminalId` and composes them
 * into per-report-type message lists (`productMessages`/
 * `allocationMessages`, one MessageTicker.tsx row each -- per explicit
 * follow-up putting Out of Product and Out of Allocation on their own
 * separate banner rows rather than one mixed ticker) plus a structured
 * per-report list (`reports`, for the detail view's expiry/Clear-Issue UI).
 * RLS on terminal_outage_reports already narrows "out_of_allocation" rows
 * to the caller's own active company -- no client-side company filtering
 * needed here on top of that.
 *
 * Deduped to the most recent report per (report_type, product_id) --
 * per explicit follow-up ("multiple entries should resolve to the most
 * recent... same for allocation"): if several drivers (or one driver
 * twice) report the same product out at the same terminal, only the
 * latest one shows. Older superseded reports are left in the table
 * untouched (still real history, just not displayed) -- this is a
 * display-layer collapse, not a write-time dedup.
 *
 * Resolves the terminal's own timezone internally (rather than depending on
 * whichever tab's own useTerminals() instance happens to be mounted) since
 * this banner renders in the shared header across every tab, not just the
 * Planner. `effectiveUserId` drives `canClear` per report -- compared
 * against the SAME identity submitOutageReport wrote as reporter_user_id
 * (page.tsx's effectiveUserId, not the real signed-in admin during
 * impersonation), so "can I clear this" stays consistent with "did I post
 * this."
 */
export function useActiveOutageBanner(terminalId: string | null, effectiveUserId: string | null): {
  productMessages: string[];
  allocationMessages: string[];
  reports: ComposedOutageReport[];
  timeZone: string;
  refresh: () => void;
} {
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [productMessages, setProductMessages] = useState<string[]>([]);
  const [allocationMessages, setAllocationMessages] = useState<string[]>([]);
  const [reports, setReports] = useState<ComposedOutageReport[]>([]);

  useEffect(() => {
    if (!terminalId) { setTimeZone(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("terminals").select("timezone").eq("terminal_id", terminalId).maybeSingle();
      if (!cancelled) setTimeZone((data as any)?.timezone ?? null);
    })();
    return () => { cancelled = true; };
  }, [terminalId]);

  const fetchAndCompose = useCallback(async () => {
    if (!terminalId) { setProductMessages([]); setAllocationMessages([]); setReports([]); return; }
    const tz = timeZone || "America/New_York";
    const cutoffMs = mostRecentClearingCheckpoint(Date.now(), tz);

    const { data, error } = await supabase
      .from("terminal_outage_reports")
      .select("report_id, product_id, report_type, company_id, reporter_user_id, truck_label, created_at")
      .eq("terminal_id", terminalId)
      .gte("created_at", new Date(cutoffMs).toISOString())
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) { setProductMessages([]); setAllocationMessages([]); setReports([]); return; }

    // Rows already come back newest-first -- keeping only the first row
    // seen per (report_type, product_id) is exactly "resolve to the most
    // recent."
    const seen = new Set<string>();
    const rows: OutageRow[] = [];
    for (const r of data as OutageRow[]) {
      const key = `${r.report_type}:${r.product_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }

    const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
    const companyIds = Array.from(new Set(rows.filter((r) => r.report_type === "out_of_product").map((r) => r.company_id)));
    const reporterIds = Array.from(new Set(rows.filter((r) => r.report_type === "out_of_allocation").map((r) => r.reporter_user_id)));

    const [productsRes, companiesRes, namesRes]: any[] = await Promise.all([
      productIds.length ? supabase.from("products").select("product_id, product_name, display_name").in("product_id", productIds) : Promise.resolve({ data: [] }),
      companyIds.length ? supabase.from("companies").select("company_id, company_name").in("company_id", companyIds) : Promise.resolve({ data: [] }),
      reporterIds.length ? supabase.rpc("get_display_names_full", { p_user_ids: reporterIds }) : Promise.resolve({ data: [] }),
    ]);

    const productNameById = new Map<string, string>((productsRes.data ?? []).map((p: any) => [p.product_id, p.product_name ?? p.display_name ?? "product"]));
    const companyNameById = new Map<string, string>((companiesRes.data ?? []).map((c: any) => [c.company_id, c.company_name ?? ""]));
    const displayNameByUserId = new Map<string, string>((namesRes.data ?? []).map((n: any) => [n.user_id, n.display_name ?? ""]));

    const composed: ComposedOutageReport[] = rows.map((r) => {
      const productName = productNameById.get(r.product_id) ?? "product";
      const createdAtMs = new Date(r.created_at).getTime();
      const hhmm = hhmmInTimeZone(createdAtMs, tz);
      const truck = r.truck_label || "?";
      const text = r.report_type === "out_of_product"
        ? `${(companyNameById.get(r.company_id) ?? "").slice(0, 3) || "???"} ${truck} - Out of ${productName} @ ${hhmm}hr`
        : `${initialsOf(displayNameByUserId.get(r.reporter_user_id) ?? "")} ${truck} OOA ${productName} @ ${hhmm}hr`;
      return {
        reportId: r.report_id,
        reportType: r.report_type,
        text,
        expiresAtMs: nextClearingCheckpoint(createdAtMs, tz),
        canClear: !!effectiveUserId && r.reporter_user_id === effectiveUserId,
      };
    });

    setReports(composed);
    setProductMessages(composed.filter((c) => c.reportType === "out_of_product").map((c) => c.text));
    setAllocationMessages(composed.filter((c) => c.reportType === "out_of_allocation").map((c) => c.text));
  }, [terminalId, timeZone, effectiveUserId]);

  useEffect(() => {
    fetchAndCompose();
    const id = setInterval(fetchAndCompose, 30000);
    return () => clearInterval(id);
  }, [fetchAndCompose]);

  return { productMessages, allocationMessages, reports, timeZone: timeZone || "America/New_York", refresh: fetchAndCompose };
}
