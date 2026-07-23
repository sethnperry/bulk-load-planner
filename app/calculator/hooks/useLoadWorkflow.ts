"use client";
// hooks/useLoadWorkflow.ts
// Owns: begin_load, complete_load RPCs, load state machine, load report.

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { beginLoad, completeLoad, deleteLoad } from "@/lib/supabase/load";
import { lbsPerGallonAtTemp } from "../utils/planMath";
import type { LoadReport, PlanRow, ProductRow } from "../types";

// ─── Hook ─────────────────────────────────────────────────────────────────────

type Props = {
  authUserId: string | null;
  selectedComboId: string;
  selectedTerminalId: string;
  selectedState: string;
  selectedCity: string;
  selectedCityId: string | null;
  tare: number;
  cgBias: number;
  ambientTempF: number | null;
  tempF: number;
  planRows: PlanRow[];
  plannedGallonsTotal: number;
  plannedWeightLbs: number;
  terminalProducts: ProductRow[];
  productNameById: Map<string, string>;
  productInputs: Record<string, { api?: string; tempF?: number }>;
  setProductInputs: (v: Record<string, { api?: string; tempF?: number }>) => void;
  // Post-load refresh callbacks
  onRefreshTerminalProducts?: () => Promise<void>;  // re-fetch last_api, last_temp_f
  onRefreshTerminalAccess?: () => Promise<void>;    // re-fetch terminal expiry dates
  onPostLoadComplete?: () => Promise<void>;         // re-read load_log for slot 0 / slip seat
  predictedTempF?: number | null;                  // what the predictor said at plan time
};

export function useLoadWorkflow({
  authUserId,
  selectedComboId, selectedTerminalId, selectedState, selectedCity, selectedCityId,
  tare, cgBias, ambientTempF, tempF,
  planRows, plannedGallonsTotal, plannedWeightLbs,
  terminalProducts, productNameById,
  productInputs, setProductInputs,
  onRefreshTerminalProducts,
  onRefreshTerminalAccess,
  onPostLoadComplete,
  predictedTempF,
}: Props) {
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [beginLoadBusy, setBeginLoadBusy] = useState(false);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingModalError, setLoadingModalError] = useState<string | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [actualByComp, setActualByComp] = useState<
    Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>
  >({});

  const [loadReport, setLoadReport] = useState<LoadReport | null>(null);

  const PLAN_SNAPSHOT_VERSION = 1;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function alphaPerFForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.alpha_per_f == null) return null;
    const v = Number(p.alpha_per_f);
    return Number.isFinite(v) ? v : null;
  }

  function computePlannedGrossLbs(): number | null {
    if (![tare, plannedWeightLbs].every((x) => Number.isFinite(x))) return null;
    return tare + plannedWeightLbs;
  }

  // ── Begin load ────────────────────────────────────────────────────────────

  const beginLoadToSupabase = useCallback(async () => {
    if (beginLoadBusy) return;
    try {
      setBeginLoadBusy(true);
      if (!selectedComboId) throw new Error("Select equipment first.");
      if (!selectedTerminalId) throw new Error("Select terminal first.");
      if (!selectedState || !selectedCity) throw new Error("Select location first.");
      if (!selectedCityId) throw new Error("City ID not found.");
      if (!planRows || planRows.length === 0) throw new Error("No plan to load.");

      const lines = (planRows as any[])
        .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
        .map((r) => {
          const gallons = Number(r.planned_gallons ?? 0);
          const lbs = gallons * Number(r.lbsPerGal ?? 0);
          const prod = terminalProducts.find((p) => p.product_id === r.productId);
          // Capture API and its timestamp at plan time — last_api_updated_at gets
          // overwritten on load completion, so we must snapshot it now.
          const plannedApi = prod?.last_api != null ? Number(prod.last_api) : null;
          const plannedApiUpdatedAt = (prod as any)?.last_api_updated_at ?? null;
          return {
            comp_number: Number(r.comp_number),
            product_id: String(r.productId),
            product_name: prod?.product_name ?? prod?.display_name ?? null,
            button_code: (prod as any)?.button_code ?? null,
            un_number: (prod as any)?.un_number ?? null,
            planned_gallons: Number.isFinite(gallons) ? gallons : null,
            planned_lbs: Number.isFinite(lbs) ? lbs : null,
            temp_f: tempF ?? null,
            planned_api: Number.isFinite(plannedApi ?? NaN) ? plannedApi : null,
            planned_api_updated_at: plannedApiUpdatedAt,
          };
        });

      if (lines.length === 0) throw new Error("No filled compartments.");

      const planned_total_gal = Number.isFinite(plannedGallonsTotal) ? plannedGallonsTotal : null;
      const planned_total_lbs = Number.isFinite(plannedWeightLbs) ? plannedWeightLbs : null;
      const planned_gross_lbs =
        Number.isFinite(tare) && Number.isFinite(plannedWeightLbs)
          ? tare + plannedWeightLbs : null;

      const result = await beginLoad({
        combo_id: selectedComboId,
        terminal_id: selectedTerminalId,
        state_code: selectedState,
        city_id: selectedCityId,
        cg_bias: Number.isFinite(cgBias) ? cgBias : null,
        ambient_temp_f: ambientTempF ?? null,
        product_temp_f: tempF ?? null,
        planned_totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
        planned_snapshot: {
          v: PLAN_SNAPSHOT_VERSION,
          created_at: new Date().toISOString(),
          totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
          lines,
        },
        lines,
      });

      setActiveLoadId(result.load_id);

      // Reset terminal access expiry — driver is actively loading, so re-card them now.
      // begin_load doesn't touch terminal_access, so we do it here.
      if (selectedTerminalId && authUserId) {
        (async () => {
  try {
    await supabase
      .from("terminal_access")
      .upsert(
        { user_id: authUserId, terminal_id: selectedTerminalId, carded_on: new Date().toISOString() },
        { onConflict: "user_id,terminal_id" }
      );

    await Promise.resolve(onRefreshTerminalAccess?.());
  } catch (err) {
  console.warn("terminal_access refresh failed (non-fatal):", err);
}
})();
      }

      // Init per-product inputs
      const nextInputs: Record<string, { api?: string; tempF?: number }> = {};
      for (const r of planRows as any[]) {
        const pid = r?.productId ? String(r.productId) : null;
        if (!pid || !Number.isFinite(Number(r?.planned_gallons ?? 0))) continue;
        if (!nextInputs[pid]) {
          // Pre-fill with last observed API from this terminal so driver sees it immediately
          const product = terminalProducts.find((p) => p.product_id === pid);
          const prefilledApi = product?.last_api != null && Number.isFinite(Number(product.last_api))
            ? String(product.last_api)
            : "";
          nextInputs[pid] = { api: prefilledApi, tempF: Number(tempF) };
        }
      }
      setProductInputs(nextInputs);
      setLoadingOpen(true);
      setLoadingModalError(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Failed to begin load.");
    } finally {
      setBeginLoadBusy(false);
    }
  }, [
    beginLoadBusy, selectedComboId, selectedTerminalId, selectedState, selectedCity,
    selectedCityId, planRows, plannedGallonsTotal, plannedWeightLbs,
    tare, cgBias, ambientTempF, tempF, setProductInputs, onRefreshTerminalAccess, authUserId,
  ]);

  // ── Cancel (Loading modal closed before LOADED is tapped) ─────────────────
  // begin_load inserts the load_log row immediately (needed so terminal_access
  // gets re-carded and the modal has a load_id to write into), so closing out
  // without completing must delete that row again -- otherwise every LOAD tap
  // that doesn't end in LOADED leaves a permanent blank "planned" row in My
  // Loads (the bug this fixes).
  const [cancelBusy, setCancelBusy] = useState(false);

  const cancelActiveLoad = useCallback(async () => {
    const loadId = activeLoadId;
    setLoadingOpen(false);
    if (!loadId) return;
    setActiveLoadId(null);
    setCancelBusy(true);
    try {
      await deleteLoad(loadId);
    } catch (err) {
      console.warn("cancelActiveLoad: delete_load failed (non-fatal):", err);
    } finally {
      setCancelBusy(false);
    }
  }, [activeLoadId]);

  // ── On loaded (from loading modal) ────────────────────────────────────────

  const onLoadedFromLoadingModal = useCallback(async () => {
    if (!activeLoadId) return;

    const requiredProductIds = Array.from(new Set(
      (planRows as any[])
        .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
        .map((r) => String(r.productId))
    ));

    for (const pid of requiredProductIds) {
      const apiStr = String(productInputs[pid]?.api ?? "").trim();
      const tempVal = productInputs[pid]?.tempF;
      if (!apiStr || !Number.isFinite(Number(apiStr))) {
        alert(`Enter API for ${productNameById.get(pid) ?? pid}`); return;
      }
      if (tempVal == null || !Number.isFinite(Number(tempVal))) {
        alert(`Enter Temp for ${productNameById.get(pid) ?? pid}`); return;
      }
    }

    const nextActualByComp: Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }> = {};
    let actualPayloadLbs = 0;

    for (const r of planRows as any[]) {
      const comp = Number(r?.comp_number ?? 0);
      const gallons = Number(r?.planned_gallons ?? 0);
      const pid = r?.productId ? String(r.productId) : null;
      if (!Number.isFinite(comp) || comp <= 0 || !pid || !Number.isFinite(gallons) || gallons <= 0) continue;

      const apiNum = Number(String(productInputs[pid]?.api ?? "").trim());
      const tempVal = Number(productInputs[pid]?.tempF);
      const alpha = alphaPerFForProductId(pid);

      if (!Number.isFinite(apiNum) || !Number.isFinite(tempVal) || alpha == null) {
        const lpgPlanned = Number(r?.lbsPerGal ?? 0);
        const lbsPlanned = gallons * (Number.isFinite(lpgPlanned) ? lpgPlanned : 0);
        nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbsPlanned) ? lbsPlanned : null, temp_f: tempVal };
        actualPayloadLbs += Number.isFinite(lbsPlanned) ? lbsPlanned : 0;
        continue;
      }

      // Back-correct observed API to 60°F before computing lbs/gal —
      // matches bestLbsPerGallon used in planning. Without this, plan and
      // actual use different effective API60 causing a phantom diff.
      const api60 = apiNum + alpha * (tempVal - 60);
      const lpg = lbsPerGallonAtTemp(api60, alpha, tempVal);
      const lbs = gallons * lpg;
      nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbs) ? lbs : null, temp_f: tempVal };
      if (Number.isFinite(lbs)) actualPayloadLbs += lbs;
    }

    setActualByComp(nextActualByComp);

    try {
      setCompleteBusy(true);
      setCompleteError(null);

      const lines = Object.entries(nextActualByComp).map(([compStr, a]) => ({
        comp_number: Number(compStr),
        actual_gallons: a.actual_gallons ?? null,
        actual_lbs: a.actual_lbs ?? null,
        temp_f: a.temp_f ?? null,
      }));

      const product_updates = requiredProductIds.map((pid) => ({
        product_id: pid,
        api: Number(String(productInputs[pid]?.api ?? "").trim()),
        temp_f: (productInputs[pid]?.tempF ?? null) as number | null,
      }));

      const res = await completeLoad({
        load_id: activeLoadId,
        lines,
        completed_at: new Date().toISOString(),
        product_updates,
      });

// Update terminal temp bias with the observed error (self-training)
// error = actual_temp - predicted_temp_at_plan_time
try {
  if (selectedTerminalId && predictedTempF != null) {
    const now = new Date();
    // Bucketed to a 3-hour window — must match app/api/fuel-temp/route.ts's read side.
    const hourUtc = Math.floor(now.getUTCHours() / 3) * 3;
    const monthOfYear = now.getUTCMonth() + 1;

    // Compute mean actual temp across all compartments for this load
    const actualTemps = Object.values(nextActualByComp)
      .map(a => a.temp_f)
      .filter((t): t is number => t != null && Number.isFinite(t));

    if (actualTemps.length > 0) {
      const meanActual = actualTemps.reduce((s, t) => s + t, 0) / actualTemps.length;
      const observedError = meanActual - predictedTempF;

      // Only update if error is plausible (not a data entry mistake)
      if (Math.abs(observedError) < 25) {
        await supabase.rpc("update_terminal_temp_bias", {
          p_terminal_id:   selectedTerminalId,
          p_hour_of_day:   hourUtc,
          p_month_of_year: monthOfYear,
          p_error:         observedError,
        });
      }
    }
  }
} catch (e) {
  console.warn("terminal_temp_bias update failed (non-fatal):", e);
}

// Fallback: persist "last observed" API/temp so LoadingModal can show previous API on reload
// (Non-fatal if RLS blocks it)
try {
  if (selectedTerminalId && product_updates.length > 0) {
    const now = new Date().toISOString();

    // Pool onto the canonical product's row for rack-injected-variance
    // products (e.g. dyed diesel) -- same resolution complete_load's RPC
    // does server-side; this client-side fallback upsert has its own
    // separate write path and needs the same redirect, or a dyed-diesel
    // delivery would still build up its own separate row here.
    const canonicalByProductId = new Map(
      terminalProducts.map((p) => [p.product_id, p.canonical_product_id ?? null])
    );

    const rows = product_updates.map((u) => ({
      terminal_id: selectedTerminalId,
      product_id: canonicalByProductId.get(u.product_id) || u.product_id,

      // values
      last_api: u.api,
      last_temp_f: u.temp_f,

      // timestamps (these ARE the real column names in your table)
      last_api_updated_at: now,
      last_loaded_at: now,
      last_updated_at: now,

      // optional but useful for traceability (exists in your table)
      last_updated_by_load_id: activeLoadId,

      // keep your normal row-updated timestamp too
      updated_at: now,
    }));

    // Update-then-insert-if-missing instead of a plain upsert: `active`
    // defaults to true on this table, and a canonical-grouped product (e.g.
    // dyed diesel) can pool onto a "main" product row that doesn't exist yet
    // at a terminal that only ever curated the variant (confirmed live --
    // Kinder Morgan offers dyed diesel but has no plain D2 row at all). A
    // blind upsert would either silently no-op (update) or, if it did
    // insert, wrongly surface that main product as a new driver-selectable
    // option nobody curated. Only a genuine insert sets active explicitly
    // (to false, pooling-only); an existing row's active flag is never
    // touched.
    for (const row of rows) {
      const { data: updated, error: updateErr } = await supabase
        .from("terminal_products")
        .update({
          last_api: row.last_api,
          last_temp_f: row.last_temp_f,
          last_api_updated_at: row.last_api_updated_at,
          last_loaded_at: row.last_loaded_at,
          last_updated_by_load_id: row.last_updated_by_load_id,
          updated_at: row.updated_at,
        })
        .eq("terminal_id", row.terminal_id)
        .eq("product_id", row.product_id)
        .select("terminal_id");

      if (updateErr) { console.warn("terminal_products update failed (non-fatal):", updateErr); continue; }

      if (!updated || updated.length === 0) {
        const { error: insertErr } = await supabase
          .from("terminal_products")
          .insert({ ...row, active: false });
        if (insertErr) console.warn("terminal_products insert failed (non-fatal):", insertErr);
      }
    }
  }
} catch (e) {
  console.warn("terminal_products upsert threw (non-fatal):", e);
}

      const plannedGross = computePlannedGrossLbs();
      const actualGross =
        Number.isFinite(tare) && Number.isFinite(actualPayloadLbs)
          ? tare + actualPayloadLbs : null;
      const diff = Number.isFinite(Number(res?.diff_lbs))
        ? Number(res.diff_lbs)
        : plannedGross != null && actualGross != null ? actualGross - plannedGross : null;

      setLoadReport({
        planned_total_gal: Number(plannedGallonsTotal),
        planned_gross_lbs: plannedGross,
        actual_gross_lbs: actualGross,
        diff_lbs: diff,
      });
      setLoadingOpen(false);

      // ── Post-load refresh (don't reset loadReport — it's set above) ─────────
      // Fire in parallel — neither touches loadReport state
      await Promise.allSettled([
        onRefreshTerminalProducts?.(),
        onRefreshTerminalAccess?.(),
        onPostLoadComplete?.(),
      ]);

    } catch (e: any) {
      console.error("complete_load failed:", e);
      alert(e?.message ?? String(e));
      setCompleteError(e?.message ?? String(e));
    } finally {
      setCompleteBusy(false);
    }
  }, [activeLoadId, planRows, productInputs, productNameById, tare, plannedGallonsTotal, terminalProducts,
      selectedTerminalId, tempF, onRefreshTerminalProducts, onRefreshTerminalAccess, onPostLoadComplete]);

  return {
    activeLoadId,
    beginLoadBusy,
    loadingOpen, setLoadingOpen,
    loadingModalError,
    completeOpen, setCompleteOpen,
    completeBusy,
    completeError,
    actualByComp,
    loadReport,
    beginLoadToSupabase,
    onLoadedFromLoadingModal,
    cancelActiveLoad,
    cancelBusy,
  };
}
