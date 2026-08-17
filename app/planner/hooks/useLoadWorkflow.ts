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
  selectedRackId?: string | null; // see CLAUDE.md "rack-aware loading"
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
  trainingTraineeId?: string | null;                // Driver Training: tag this load for a trainee (see CLAUDE.md)
  activeSlotLetter?: number | null;                 // which named preset (1-5 / A-E) was active when LOAD was tapped, for the recap card's "Plan X" label
};

export function useLoadWorkflow({
  authUserId,
  selectedComboId, selectedTerminalId, selectedRackId, selectedState, selectedCity, selectedCityId,
  tare, cgBias, ambientTempF, tempF,
  planRows, plannedGallonsTotal, plannedWeightLbs,
  terminalProducts, productNameById,
  productInputs, setProductInputs,
  onRefreshTerminalProducts,
  onRefreshTerminalAccess,
  onPostLoadComplete,
  predictedTempF,
  trainingTraineeId,
  activeSlotLetter,
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

      // Clean up any stale "planned" row left behind by a previous LOAD tap
      // for this same combo that never reached LOADED or Cancel (app
      // backgrounded/closed mid-session -- see CLAUDE.md "Pre-launch
      // cleanup: orphaned planned load_log rows"). Reuses the same
      // delete_load RPC the explicit Cancel path already calls, so this is
      // just making sure begin_load never accumulates more than one
      // abandoned planned row per combo going forward. Best-effort: a
      // failure here shouldn't block starting the new load.
      if (authUserId && selectedComboId) {
        try {
          const { data: stale } = await supabase
            .from("load_log")
            .select("load_id")
            .eq("user_id", authUserId)
            .eq("combo_id", selectedComboId)
            .eq("status", "planned");
          if (stale && stale.length > 0) {
            await Promise.all(stale.map((r: any) => deleteLoad(r.load_id).catch(() => {})));
          }
        } catch (err) {
          console.warn("stale planned-row cleanup failed (non-fatal):", err);
        }
      }

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

      // Rack-aware loading: tag which physical rack this load happened at
      // (see CLAUDE.md "rack-aware loading"). Plain UPDATE on the row just
      // created, same non-blocking pattern as trainee_id/plan_slot below --
      // a failure here only means this load can't be attributed to a rack
      // later, never blocks the load itself. Skipped entirely for a 0/1-rack
      // terminal (selectedRackId is "" -- nothing to tag).
      if (selectedRackId && result.load_id) {
        supabase.from("load_log").update({ rack_id: selectedRackId }).eq("load_id", result.load_id)
          .then(({ error }) => { if (error) console.error("[rack] failed to tag rack_id:", error.message); });
      }

      // Driver Training: tag this load for the trainee (single-load model --
      // see CLAUDE.md "Terminal Tier — Build Spec"). Plain UPDATE on the
      // lead's own just-created row, already covered by load_log_update_own;
      // no RPC change needed. Non-fatal -- a failure here shouldn't block
      // the load itself, just the training attribution.
      if (trainingTraineeId && result.load_id) {
        supabase.from("load_log").update({ trainee_id: trainingTraineeId }).eq("load_id", result.load_id)
          .then(({ error }) => { if (error) console.error("[training] failed to tag trainee_id:", error.message); });
      }

      // Recap card label ("Plan A") -- plain UPDATE on the row just created,
      // same pattern as trainee_id above. Non-fatal: a failure here only
      // means the recap can't name a preset, never blocks the load itself.
      if (activeSlotLetter && result.load_id) {
        supabase.from("load_log").update({ plan_slot: activeSlotLetter }).eq("load_id", result.load_id)
          .then(({ error }) => { if (error) console.error("[recap] failed to tag plan_slot:", error.message); });
      }

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
    beginLoadBusy, selectedComboId, selectedTerminalId, selectedRackId, selectedState, selectedCity,
    selectedCityId, planRows, plannedGallonsTotal, plannedWeightLbs,
    tare, cgBias, ambientTempF, tempF, setProductInputs, onRefreshTerminalAccess, authUserId,
    trainingTraineeId, activeSlotLetter,
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

// Incentive system ("Recovered Gallons") -- silent, non-fatal. No-ops
// server-side if the company hasn't enabled it (calculate_load_points
// returns { enabled: false }).
let recoveredPoints: number | null = null;
try {
  const { data: pointsRes } = await supabase.rpc("calculate_load_points", { p_load_id: activeLoadId });
  if (pointsRes?.enabled) recoveredPoints = Number(pointsRes.recovered_gallons ?? 0);
} catch (e) {
  console.warn("calculate_load_points failed (non-fatal):", e);
}

// Persist "last observed" API/temp so LoadingModal can show previous API on
// reload -- rack_product_status only (see CLAUDE.md "rack-aware loading,
// unified"). terminal_products is deliberately no longer written here: with
// every terminal now guaranteed a rack (auto-named "Main Rack" for
// terminals that never touched the Terminal tab), a rack IS the terminal's
// product list and reference reading, so there's no separate terminal-wide
// store left to keep in sync. (Non-fatal if RLS blocks it.)
try {
  // Fall back to resolving the terminal's own rack when none was selected
  // at load time -- confirmed live (2026-08-13) this genuinely happens: a
  // completed load's load_log.rack_id came back null even though the
  // terminal has exactly one real rack, silently skipping this whole
  // block and leaving rack_product_status stuck on whatever a manual STUD
  // last set, potentially days stale, while terminal_products (written by
  // the complete_load RPC itself, unconditionally) had the fresh reading
  // the whole time. Root cause of why selectedRackId was empty in that
  // specific case wasn't pinned down, but a terminal with more than one
  // rack still can't be safely guessed here -- that's exactly the
  // ambiguity chooseTerminal()'s own rack-picker prompt exists to force a
  // real choice on, so this only ever resolves the 0/1-rack case, never a
  // silent guess among several.
  let effectiveRackId = selectedRackId || null;
  if (!effectiveRackId && selectedTerminalId) {
    const { data: racks } = await supabase
      .from("terminal_racks")
      .select("rack_id")
      .eq("terminal_id", selectedTerminalId);
    if (racks && racks.length === 1) effectiveRackId = racks[0].rack_id;
  }

  if (effectiveRackId && product_updates.length > 0) {
    const now = new Date().toISOString();

    // Canonical-group siblings on this rack (e.g. D2 <-> its dyed variant)
    // -- physically the same tank/feed at the point of loading, so one
    // product's observed reading is also true for the other. Propagation
    // is update-only, same reasoning as the insert-vs-update split below:
    // a sibling only gets the new reading if it already has a real row on
    // this rack (i.e. it was already offered/tracked here) -- this never
    // creates a new curated entry for a sibling nobody actually assigned
    // to this rack.
    const canonicalRootByProductId = new Map(
      terminalProducts.map((p) => [p.product_id, p.canonical_product_id || p.product_id])
    );
    const siblingsByRoot = new Map<string, string[]>();
    for (const p of terminalProducts) {
      const root = canonicalRootByProductId.get(p.product_id)!;
      const list = siblingsByRoot.get(root) ?? [];
      list.push(p.product_id);
      siblingsByRoot.set(root, list);
    }

    for (const u of product_updates) {
      // Update-then-insert-if-missing instead of a blind upsert: the
      // Terminal tab's rack Product List filters rack_product_status on
      // active = true (page.tsx / EditTerminalModal.tsx), an admin/lead-
      // curated "this rack carries this product" flag -- a blind upsert
      // defaulting active's own column default (true) would silently add
      // a product to that curated list just because a driver happened to
      // plan it here, even if nobody ever actually assigned it to this
      // rack. A genuine insert sets active: false (informational reading
      // only, not a curation claim); an existing row's active flag is
      // never touched either way.
      const { data: rpsUpdated, error: rpsUpdateErr } = await supabase
        .from("rack_product_status")
        .update({ last_api: u.api, last_temp_f: u.temp_f, updated_at: now, updated_by: authUserId || null })
        .eq("rack_id", effectiveRackId)
        .eq("product_id", u.product_id)
        .select("rack_id");

      if (rpsUpdateErr) {
        console.warn("rack_product_status update failed (non-fatal):", rpsUpdateErr);
      } else if (!rpsUpdated || rpsUpdated.length === 0) {
        const { error: rpsInsertErr } = await supabase.from("rack_product_status").insert({
          rack_id: effectiveRackId,
          product_id: u.product_id,
          last_api: u.api,
          last_temp_f: u.temp_f,
          updated_at: now,
          updated_by: authUserId || null,
          active: false,
        });
        if (rpsInsertErr) console.warn("rack_product_status insert failed (non-fatal):", rpsInsertErr);
      }

      const root = canonicalRootByProductId.get(u.product_id) ?? u.product_id;
      const siblingIds = (siblingsByRoot.get(root) ?? []).filter((pid) => pid !== u.product_id);
      for (const siblingId of siblingIds) {
        const { error: siblingErr } = await supabase
          .from("rack_product_status")
          .update({ last_api: u.api, last_temp_f: u.temp_f, updated_at: now, updated_by: authUserId || null })
          .eq("rack_id", effectiveRackId)
          .eq("product_id", siblingId);
        if (siblingErr) console.warn("rack_product_status sibling propagation failed (non-fatal):", siblingErr);
      }
    }
  }
} catch (e) {
  console.warn("rack_product_status upsert threw (non-fatal):", e);
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
        recovered_points: recoveredPoints,
        completed_at: res?.completed_at ?? new Date().toISOString(),
        plan_slot: activeSlotLetter ?? null,
      });
      setLoadingOpen(false);
      // activeLoadId was previously only ever cleared in cancelActiveLoad
      // (Update Card/Back to Planner) -- never on a genuine successful
      // completion, so the LOAD button stayed stuck reading "Load started"
      // until a full page reload. Clear it here too so loadLabel correctly
      // falls back to RELOAD/LOAD immediately after a real completed load.
      setActiveLoadId(null);

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
      selectedTerminalId, selectedRackId, tempF, onRefreshTerminalProducts, onRefreshTerminalAccess,
      onPostLoadComplete, activeSlotLetter]);

  return {
    activeLoadId,
    beginLoadBusy,
    loadingOpen, setLoadingOpen,
    loadingModalError,
    completeOpen, setCompleteOpen,
    completeBusy,
    completeError,
    actualByComp,
    loadReport, setLoadReport,
    beginLoadToSupabase,
    onLoadedFromLoadingModal,
    cancelActiveLoad,
    cancelBusy,
  };
}
