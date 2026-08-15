"use client";
// hooks/usePlanSlots.ts
// Owns: plan snapshot save/load, localStorage hot cache, Supabase cross-device sync.
// Intentionally isolated — this is the most complex state machine in the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { biasToCgSlider } from "../utils/planMath";
import type { CompPlanInput, PlanSnapshot } from "../types";

const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

// ─── Payload parse (back-compat) ──────────────────────────────────────────────

function parsePlanPayload(raw: string | null, fallbackTerminalId: string, fallbackComboId: string): any {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.version == null) {
      return {
        version: 0, savedAtISO: "",
        terminalId: fallbackTerminalId,
        comboId: fallbackComboId,
        tempF: typeof obj.tempF === "number" ? obj.tempF : undefined,
        cgSlider: typeof obj.cgSlider === "number" ? obj.cgSlider : undefined,
        compPlan: obj.compPlan ?? undefined,
      };
    }
    return obj;
  } catch {
    return null;
  }
}

function compareSavedAt(a: any, b: any): number {
  const at = a?.savedAtISO ? Date.parse(String(a.savedAtISO)) : 0;
  const bt = b?.savedAtISO ? Date.parse(String(b.savedAtISO)) : 0;
  return at - bt;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Sentinel scope used for named presets (slots 1-5) so they're stored
// terminal/combo-independent -- user_plan_slots.terminal_id/combo_id are
// NOT NULL text and part of the unique key, so a constant, non-null value
// here needs no schema migration and dedupes correctly (unlike NULL, which
// Postgres never treats as equal to itself for uniqueness). Slot 0 (the
// autosave/last-load draft, not a driver-facing "preset") keeps using the
// real terminal/combo exactly as before.
const UNIVERSAL_SCOPE = "__universal__";

type Props = {
  authUserId: string;
  selectedTerminalId: string;
  selectedComboId: string;
  tempF: number;
  compPlan: Record<number, CompPlanInput>;
  setCompPlan: (v: Record<number, CompPlanInput>) => void;
  cgSlider: number;
  setCgSlider: (v: number) => void;
  compartmentsLoaded: boolean;
  // Called by useLoadWorkflow after completeLoad — writes slot 0 as equipment-scoped
  onSaveLastLoad?: (payload: any) => Promise<void>;
};

export function usePlanSlots({
  authUserId, selectedTerminalId, selectedComboId,
  tempF, compPlan,
  setCompPlan,
  cgSlider, setCgSlider,
  compartmentsLoaded,
  onSaveLastLoad,
}: Props) {
  const [slotBump, setSlotBump] = useState(0);
  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});
  const [lastLoadLines, setLastLoadLines] = useState<any[]>([]);
  const [lastLoadReport, setLastLoadReport] = useState<{
    planned_total_gal: number; planned_gross_lbs: number | null; actual_gross_lbs: number | null; diff_lbs: number | null; recovered_points: number | null;
    completed_at: string | null; plan_slot: number | null;
  } | null>(null);

  // True only until the first real (signed-in) scope resolves after a fresh
  // page mount -- lets the "restore slot 0" effect below tell a genuine
  // refresh apart from a later same-session terminal switch, so an
  // unfinalized in-progress plan never survives a reload (see that effect).
  const isFreshMountRef = useRef(true);

  const planRestoreReadyRef = useRef<string | null>(null);
  const planDirtyRef = useRef(false);
  const autosaveTimerRef = useRef<any>(null);
  const lastAppliedScopeRef = useRef("");
  const serverSyncInFlightRef = useRef(false);
  const serverLastPulledScopeRef = useRef("");
  const serverWriteDebounceRef = useRef<any>(null);

  // ── Scope key ─────────────────────────────────────────────────────────────

  const planScopeKey = useMemo(() => {
    const who = authUserId ? `u:${authUserId}` : "anon";
    const term = selectedTerminalId ? `t:${selectedTerminalId}` : "t:none";
    return `proTankr:${who}:${term}`;
  }, [authUserId, selectedTerminalId]);

  // Slot 0 (autosave/last-load draft) stays keyed per-terminal, exactly as
  // before. Slots 1-5 (named A-E presets) are keyed per-user *and*
  // per-equipment-combo -- no terminal component -- so the same preset
  // shows up and loads regardless of which terminal is currently selected,
  // but different trucks/trailers (different compartment layouts) get
  // independent presets. Requires selectedComboId to resolve; falls back to
  // "c:none" when it hasn't yet (matches every other guard in this file
  // that treats an unresolved combo as "nothing to scope to yet").
  const planStoreKey = useCallback(
    (slot: number) => {
      if (slot === 0) return `${planScopeKey}:plan:slot:0`;
      const who = authUserId ? `u:${authUserId}` : "anon";
      const combo = selectedComboId ? `c:${selectedComboId}` : "c:none";
      return `proTankr:${who}:${combo}:preset:slot:${slot}`;
    },
    [planScopeKey, authUserId, selectedComboId]
  );

  // Pre-equipment-scoping key (every preset used to live here, user-only,
  // shared across all equipment). Kept as a READ-ONLY fallback so existing
  // presets don't silently vanish for any combo that hasn't been
  // individually customized yet -- see readSlot below. Writes only ever go
  // to the new combo-specific key; this key is never written to again.
  const legacyPresetKey = useCallback(
    (slot: number) => {
      const who = authUserId ? `u:${authUserId}` : "anon";
      return `proTankr:${who}:preset:slot:${slot}`;
    },
    [authUserId]
  );

  const serverSyncEnabled = Boolean(authUserId);

  // ── Safe localStorage helpers ─────────────────────────────────────────────

  const safeRead = useCallback((key: string) => {
    try { return typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(key) ?? "null") : null; }
    catch { return null; }
  }, []);

  const safeWrite = useCallback((key: string, value: any) => {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }, []);

  const safeDelete = useCallback((key: string) => {
    try { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
    catch {}
  }, []);

  // Read a preset slot's raw payload, falling back to the pre-equipment-
  // scoping legacy key when this specific combo has never had that slot
  // saved yet. No implicit write-on-read -- once this combo's own key has
  // *any* value (including an explicit "cleared" marker written by
  // clearSlot below), the legacy fallback stops applying for it.
  const readSlot = useCallback(
    (slot: number) => {
      if (slot === 0) return safeRead(planStoreKey(0));
      return safeRead(planStoreKey(slot)) ?? safeRead(legacyPresetKey(slot));
    },
    [planStoreKey, legacyPresetKey, safeRead]
  );

  // "Has real content" rather than "has a record at all" -- a slot that's
  // been explicitly cleared (see clearSlot) still has a record (an empty
  // marker, so the legacy fallback doesn't leak through) but should read as
  // unset for the dial's own has-data indicator.
  function snapshotHasContent(snap: any): boolean {
    if (!snap || snap.v !== 1 || !snap.compPlan || typeof snap.compPlan !== "object") return false;
    return Object.values(snap.compPlan).some((v: any) => v && !v.empty && v.productId);
  }

  // ── Slot has map ──────────────────────────────────────────────────────────

  const refreshSlotHas = useCallback(() => {
    if (!selectedTerminalId) { setSlotHas({}); setLastLoadLines([]); return; }
    // PLAN_SLOTS is always [1,2,3,4,5] -- slot 0 (autosave) never goes
    // through this map, so every slot here goes through readSlot's
    // combo-aware + legacy-fallback lookup.
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = snapshotHasContent(readSlot(s));
    setSlotHas(next);
    // Read lastLoadLines from dedicated key (never clobbered by autosave)
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      const llData = safeRead(llKey) as any;
      const ll = llData?.lastLoadLines ?? [];
      setLastLoadLines(ll);
    }
  }, [selectedTerminalId, selectedComboId, authUserId, readSlot, safeRead]);

  // ── Supabase server sync ──────────────────────────────────────────────────
  // Slot 0 stays scoped to the real terminal/combo. Slots 1-5 (presets) use
  // terminal_id = UNIVERSAL_SCOPE (loadable from any terminal) but a real
  // combo_id -- different equipment (different compartment layouts) gets
  // independent presets. Requires a resolved combo to write to at all,
  // same as slot 0 requires a resolved terminal+combo.

  function scopeFor(slot: number): { terminalId: string; comboId: string } | null {
    if (slot === 0) {
      if (!selectedTerminalId || !selectedComboId) return null;
      return { terminalId: String(selectedTerminalId), comboId: String(selectedComboId) };
    }
    if (!selectedComboId) return null;
    return { terminalId: UNIVERSAL_SCOPE, comboId: String(selectedComboId) };
  }

  // Returns both the combo-scoped preset rows (preferred, post-rework) and
  // the pre-equipment-scoping legacy rows (terminal_id AND combo_id both
  // UNIVERSAL_SCOPE -- every preset lived here before this rework). The
  // pull effect below writes each into its own local cache; readSlot
  // prefers the combo-scoped one and only falls back to legacy for a combo
  // that's never had that slot saved under the new scheme.
  async function serverFetchSlots(): Promise<{ scoped: Record<number, any>; legacy: Record<number, any> }> {
    if (!authUserId) return { scoped: {}, legacy: {} };
    const scoped: Record<number, any> = {};
    const legacy: Record<number, any> = {};

    if (selectedTerminalId && selectedComboId) {
      const { data, error } = await supabase
        .from("user_plan_slots")
        .select("slot,payload,updated_at")
        .eq("user_id", authUserId)
        .eq("terminal_id", String(selectedTerminalId))
        .eq("combo_id", String(selectedComboId))
        .eq("slot", 0);
      if (error) console.warn("serverFetchSlots (slot 0) error:", error.message);
      else (data || []).forEach((r: any) => { scoped[Number(r.slot)] = r.payload ?? null; });
    }

    if (selectedComboId) {
      const { data: presetRows, error: presetErr } = await supabase
        .from("user_plan_slots")
        .select("slot,payload,updated_at")
        .eq("user_id", authUserId)
        .eq("terminal_id", UNIVERSAL_SCOPE)
        .eq("combo_id", String(selectedComboId))
        .in("slot", [1, 2, 3, 4, 5]);
      if (presetErr) console.warn("serverFetchSlots (presets, combo-scoped) error:", presetErr.message);
      else (presetRows || []).forEach((r: any) => { scoped[Number(r.slot)] = r.payload ?? null; });
    }

    const { data: legacyRows, error: legacyErr } = await supabase
      .from("user_plan_slots")
      .select("slot,payload,updated_at")
      .eq("user_id", authUserId)
      .eq("terminal_id", UNIVERSAL_SCOPE)
      .eq("combo_id", UNIVERSAL_SCOPE)
      .in("slot", [1, 2, 3, 4, 5]);
    if (legacyErr) console.warn("serverFetchSlots (presets, legacy) error:", legacyErr.message);
    else (legacyRows || []).forEach((r: any) => { legacy[Number(r.slot)] = r.payload ?? null; });

    return { scoped, legacy };
  }

  async function serverUpsertSlot(slot: number, payload: any) {
    if (!authUserId) return;
    const scope = scopeFor(slot);
    if (!scope) return;
    const { error } = await supabase.from("user_plan_slots").upsert({
      user_id: authUserId, terminal_id: scope.terminalId,
      combo_id: scope.comboId, slot, payload,
    }, { onConflict: "user_id,terminal_id,combo_id,slot" });
    if (error) console.warn("serverUpsertSlot error:", error.message);
  }

  async function serverDeleteSlot(slot: number) {
    if (!authUserId) return;
    const scope = scopeFor(slot);
    if (!scope) return;
    const { error } = await supabase.from("user_plan_slots").delete()
      .eq("user_id", authUserId).eq("terminal_id", scope.terminalId)
      .eq("combo_id", scope.comboId).eq("slot", slot);
    if (error) console.warn("serverDeleteSlot error:", error.message);
  }

  // ── Last load from load_log (equipment-scoped, any driver on this combo sees it) ──
  // Reads planned_snapshot from the most recent completed load for this combo.
  // planned_snapshot.lines contains { comp_number, product_id, un_number, ... }
  // which is all we need to restore slot 0 and compute placard residue.

  // For each empty compartment, find the last product loaded into it for this combo.
  async function fetchLastProductPerComp(emptyComps: number[]): Promise<Record<number, { product_id: string; un_number: string | null }>> {
    if (!selectedComboId || emptyComps.length === 0) return {};

    // Step 1: get all completed load_ids for this combo, ordered newest first
    const { data: logRows, error: logErr } = await supabase
      .from("load_log")
      .select("load_id")
      .eq("combo_id", selectedComboId)
      .order("started_at", { ascending: false })
      .limit(50);

    if (logErr || !logRows?.length) return {};
    const loadIds = logRows.map((r: any) => r.load_id);

    // Step 2: for each empty comp, find the most recent load_line from those loads
    const result: Record<number, { product_id: string; un_number: string | null }> = {};

    await Promise.all(emptyComps.map(async (compNum) => {
      const { data, error } = await supabase
        .from("load_lines")
        .select("product_id, load_id, products(un_number)")
        .in("load_id", loadIds)
        .eq("comp_number", compNum)
        .gt("planned_gallons", 0)
        // Order by the position in loadIds array (newest load first)
        // We can't order by started_at here, so we fetch all and pick the one
        // whose load_id appears earliest in loadIds
        .limit(50);

      if (!error && data?.length) {
        // Pick the row whose load_id is earliest in loadIds (= most recent load)
        const sorted = data.sort((a: any, b: any) =>
          loadIds.indexOf(a.load_id) - loadIds.indexOf(b.load_id)
        );
        const best = sorted[0];
        if (best?.product_id) {
          result[compNum] = {
            product_id: String(best.product_id),
            un_number: (best.products as any)?.un_number ?? null,
          };
        }
      }
    }));

    return result;
  }

  async function fetchLastLoadFromLog(): Promise<any | null> {
    if (!selectedComboId) return null;

    // Only a genuinely finalized ("loaded") row counts -- an abandoned
    // "planned" row (LOAD tapped but never confirmed LOADED) must never be
    // treated as "the last load" for slip-seat pre-fill or the Target/
    // Actual/Diff summary. No fallback to "any status" on purpose.
    const { data: comboRows, error: comboErr } = await supabase
      .from("load_log")
      .select("load_id, status, started_at, completed_at, terminal_id, planned_total_gal, planned_gross_lbs, diff_lbs, plan_slot, cg_bias")
      .eq("combo_id", selectedComboId)
      .eq("status", "loaded")
      .order("started_at", { ascending: false })
      .limit(1);

    if (comboErr || !comboRows?.length) return null;
    const resolvedRow = comboRows[0];

    // Step 2: get load_lines for that load, joined with products for un_number
    const { data: lineRows, error: lineErr } = await supabase
      .from("load_lines")
      .select("comp_number, product_id, planned_gallons, products(un_number, product_name, display_name)")
      .eq("load_id", resolvedRow.load_id);

    if (lineErr || !lineRows) return null;

    const lines = lineRows.map((l: any) => ({
      comp_number: Number(l.comp_number),
      product_id: l.product_id ? String(l.product_id) : null,
      un_number: l.products?.un_number ? String(l.products.un_number) : null,
      product_name: l.products?.product_name ?? l.products?.display_name ?? null,
      planned_gallons: Number(l.planned_gallons ?? 0),
    }));

    const compPlan: Record<string, { empty: boolean; productId: string }> = {};
    for (const line of lines) {
      const n = String(line.comp_number ?? "");
      if (!n || !line.product_id) continue;
      compPlan[n] = { empty: false, productId: line.product_id };
    }

    const plannedGross = resolvedRow.planned_gross_lbs != null ? Number(resolvedRow.planned_gross_lbs) : null;
    const diff = resolvedRow.diff_lbs != null ? Number(resolvedRow.diff_lbs) : null;
    const loadReport = plannedGross != null && diff != null ? {
      planned_total_gal: Number(resolvedRow.planned_total_gal ?? 0),
      planned_gross_lbs: plannedGross,
      actual_gross_lbs: plannedGross + diff,
      diff_lbs: diff,
      completed_at: (resolvedRow as any).completed_at ?? null,
      plan_slot: (resolvedRow as any).plan_slot ?? null,
    } : null;

    // Real CG the driver actually used for this load, not a hardcoded
    // default -- see CLAUDE.md "recap / recall last load" discussion.
    // load_log.cg_bias is written at begin_load time (useLoadWorkflow.ts),
    // so it's the true value for this specific completed load -- but it's
    // the CONVERTED physics bias (cgSliderToBias's output, a nonlinear
    // curve roughly -1..2.5), not the raw 0-1 slider position. Feeding it
    // to the slider directly is a unit mismatch that sent the puck to a
    // clamped, "way off to unstable land" position -- confirmed live
    // (real cg_bias values like 1.5+ clamp a 0-1 range straight to 1,
    // full front, regardless of what the driver actually had it at).
    // biasToCgSlider is the inverse of that same conversion.
    const cgFromLoad = (resolvedRow as any).cg_bias;
    const cgSlider = typeof cgFromLoad === "number" && Number.isFinite(cgFromLoad) ? biasToCgSlider(cgFromLoad) : 0.5;

    return {
      v: 1,
      savedAt: resolvedRow.started_at ? new Date(resolvedRow.started_at).getTime() : Date.now(),
      terminalId: String((resolvedRow as any).terminal_id ?? selectedTerminalId ?? ""),
      tempF: 60,
      cgSlider,
      compPlan,
      lastLoadLines: lines,
      lastLoadId: resolvedRow.load_id,
      loadReport,
    };
  }

  // ── Snapshot build/apply ──────────────────────────────────────────────────

  // stripFillLevel drops capOverride from every compartment -- used for named
  // presets (slots 1-5), which store only the product selection + CG (per
  // explicit 2026-08-04 direction: CG is saved with the preset and restored
  // when the driver taps it, reversing the original "CG never lives in a
  // preset" call). Slot 0 (the autosave/last-load draft) keeps full
  // fidelity, since it's plan continuity, not a driver-facing "preset" --
  // its cgSlider is still saved (harmless) but never restored, see
  // applySnapshot below.
  const buildSnapshot = useCallback(
    (terminalId: string, opts?: { stripFillLevel?: boolean }): PlanSnapshot => {
      const plan = opts?.stripFillLevel
        ? Object.fromEntries(Object.entries(compPlan).map(([k, v]) => [k, { empty: v.empty, productId: v.productId }]))
        : compPlan;
      return {
        v: 1, savedAt: Date.now(), terminalId,
        tempF: Number(tempF) || 60,
        cgSlider: Number(cgSlider),
        compPlan: plan,
      };
    },
    [tempF, cgSlider, compPlan]
  );

  const applySnapshot = useCallback((snap: PlanSnapshot, opts?: { restoreCg?: boolean }) => {
    // NOTE: tempF is intentionally NOT restored from any snapshot.
    // The fuel temp prediction always owns tempF. Restoring it from saved state
    // would override the prediction every time a slot is switched or the page reloads.
    setCompPlan(snap.compPlan || {});
    if (opts?.restoreCg && typeof snap.cgSlider === "number" && Number.isFinite(snap.cgSlider)) {
      setCgSlider(snap.cgSlider);
    }
  }, [setCompPlan, setCgSlider]);

  // ── Server pull (once per scope) ──────────────────────────────────────────

  useEffect(() => {
    if (!serverSyncEnabled) return;
    if (!planScopeKey) return;
    if (!selectedTerminalId || !selectedComboId) return;
    if (serverSyncInFlightRef.current) return;
    if (serverLastPulledScopeRef.current === planScopeKey) return;

    serverSyncInFlightRef.current = true;
    (async () => {
      try {
        const { scoped, legacy } = await serverFetchSlots();

        // Normalize into the same { v: 1, savedAt, ... } shape buildSnapshot
        // produces -- the server's own payload shape (version/savedAtISO) is
        // a different, older schema, and loadFromSlot only recognizes v:1.
        // Writing the raw server shape here made freshly-pulled slots (e.g.
        // a brand-new device, or any slot re-pulled after a local cache
        // clear) silently fail to load on tap until a save from that device
        // produced a compliant local entry.
        function normalize(sp: any, terminalIdFallback: string) {
          return {
            v: 1,
            savedAt: sp.savedAtISO ? (Date.parse(String(sp.savedAtISO)) || Date.now()) : Date.now(),
            terminalId: String(sp.terminalId ?? terminalIdFallback),
            tempF: typeof sp.tempF === "number" ? sp.tempF : 60,
            cgSlider: typeof sp.cgSlider === "number" ? sp.cgSlider : undefined,
            compPlan: sp.compPlan ?? {},
          };
        }

        function pullInto(key: string, sp: any) {
          if (!sp) return;
          const localRaw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
          const lp = parsePlanPayload(localRaw, selectedTerminalId, selectedComboId);
          if (!lp || compareSavedAt(sp, lp) > 0) {
            try { localStorage.setItem(key, JSON.stringify(normalize(sp, selectedTerminalId))); setSlotBump((v) => v + 1); } catch {}
          }
        }

        pullInto(planStoreKey(0), scoped[0]);
        for (const s of [1, 2, 3, 4, 5]) {
          // Combo-scoped (preferred) and legacy (fallback) are independent
          // local caches -- both get pulled so readSlot's fallback has
          // something to find even on a brand-new device that's never
          // cached anything locally yet.
          pullInto(planStoreKey(s), scoped[s]);
          pullInto(legacyPresetKey(s), legacy[s]);
        }

        const local0 = parsePlanPayload(
          typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null,
          selectedTerminalId, selectedComboId
        );
        if (local0 && compartmentsLoaded) {
          const safeToApply =
            !planDirtyRef.current ||
            Object.keys(compPlan || {}).length === 0 ||
            lastAppliedScopeRef.current !== planScopeKey;

          if (safeToApply) {
            // NOTE: tempF is intentionally NOT restored from snapshot.
            // The fuel temp prediction always dominates on load/refresh.
            // tempF is only ever set by the prediction hook or manually by the user.
            // cgSlider is likewise never restored -- see applySnapshot.
            if (local0.compPlan && typeof local0.compPlan === "object") setCompPlan(local0.compPlan);
            planDirtyRef.current = false;
            lastAppliedScopeRef.current = planScopeKey;
          }
        }

        serverLastPulledScopeRef.current = planScopeKey;
      } finally {
        serverSyncInFlightRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSyncEnabled, planScopeKey, selectedTerminalId, selectedComboId, compartmentsLoaded, slotBump]);

  // ── On combo claim: fetch equipment-scoped last load from DB into local slot 0 ─

  // Load cached lastLoadLines immediately when comboId resolves (before DB fetch)
  useEffect(() => {
    if (!selectedComboId) { setLastLoadLines([]); return; }
    const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
    const llData = safeRead(llKey) as any;
    const ll = llData?.lastLoadLines ?? [];
    setLastLoadLines(ll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId]);

  useEffect(() => {
    if (!selectedComboId || !authUserId) return;
    (async () => {
      const dbPayload = await fetchLastLoadFromLog();
      if (!dbPayload) return;

      // Always update lastLoadLines — this is residue data, always current
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
      setLastLoadReport(dbPayload.loadReport ? { ...dbPayload.loadReport, recovered_points: dbPayload.loadReport.recovered_points ?? null } : null);

      // Only restore the plan (compPlan/temp/CG) if slot 0 is empty — i.e. fresh page load
      // with no autosaved state. If slot 0 has data the driver is mid-plan; don't clobber it.
      const localRaw = safeRead(planStoreKey(0));
      const slotIsEmpty = !localRaw || !localRaw.savedAt;
      if (slotIsEmpty) {
        safeWrite(planStoreKey(0), dbPayload);
        // restoreCg: true -- see CLAUDE.md "recap / recall last load": a
        // fresh mount/refresh should reproduce the last completed load
        // exactly, CG position included, not just the product selection.
        applySnapshot(dbPayload, { restoreCg: true });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId]);

  // ── Restore slot 0 on terminal change ─────────────────────────────────────
  // A genuine fresh mount/refresh never resumes an unfinalized in-progress
  // plan -- any local WIP draft for this real (signed-in) scope gets cleared
  // exactly once, the first time it's seen after mount, so the combo-claim
  // effect above sees an empty slot 0 and only the last *completed* load's
  // slip-seat data (if any) can pre-fill compPlan. Later terminal switches
  // within the same session still restore each terminal's own local draft
  // normally -- this only guards the very first resolution after a reload.

  useEffect(() => {
    if (!selectedTerminalId) return;
    const raw = safeRead(planStoreKey(0)) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;

    const consumesFreshFlag = !!authUserId;
    const skipLocalRestore = isFreshMountRef.current && consumesFreshFlag;
    if (consumesFreshFlag) isFreshMountRef.current = false;

    if (skipLocalRestore) {
      safeDelete(planStoreKey(0));
      setCompPlan({});
    } else if (raw && raw.v === 1 && String(raw.terminalId) === String(selectedTerminalId)) {
      applySnapshot(raw);
    }

    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
    refreshSlotHas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, planScopeKey]);

  // ── Mark dirty on plan changes ────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;
    planDirtyRef.current = true;
  }, [selectedTerminalId, tempF, compPlan]);

  // ── Debounced autosave slot 0 ─────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!selectedTerminalId || !planDirtyRef.current) return;
      const snap = buildSnapshot(String(selectedTerminalId));
      safeWrite(planStoreKey(0), snap);
      planDirtyRef.current = false;
      refreshSlotHas();
    }, 350);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [selectedTerminalId, tempF, compPlan, buildSnapshot, planStoreKey, safeWrite, refreshSlotHas]);

  // ── Server sync helpers ───────────────────────────────────────────────────

  async function syncSlotToServer(slot: number) {
    if (!serverSyncEnabled) return;
    const payload = parsePlanPayload(
      typeof window !== "undefined" ? localStorage.getItem(planStoreKey(slot)) : null,
      selectedTerminalId, selectedComboId
    );
    if (!payload) return;
    await serverUpsertSlot(slot, payload);
  }

  async function afterLocalSlotWrite(slot: number) {
    if (!serverSyncEnabled) return;
    if (slot === 0) {
      if (serverWriteDebounceRef.current) clearTimeout(serverWriteDebounceRef.current);
      serverWriteDebounceRef.current = setTimeout(() => syncSlotToServer(0), 1200);
      return;
    }
    await syncSlotToServer(slot);
  }

  // ── Public save/load ──────────────────────────────────────────────────────

  // Slot 0 needs a resolved terminal (it's per-terminal); presets (1-5) need
  // a resolved equipment combo instead (terminal-independent, combo-specific).
  function canUseSlot(slot: number): boolean {
    return slot === 0 ? !!selectedTerminalId : !!selectedComboId;
  }

  const saveToSlot = useCallback((slot: number) => {
    if (!canUseSlot(slot)) return;
    const snap = buildSnapshot(String(selectedTerminalId), { stripFillLevel: slot !== 0 });
    safeWrite(planStoreKey(slot), snap);
    refreshSlotHas();
    afterLocalSlotWrite(slot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, selectedComboId, buildSnapshot, safeWrite, planStoreKey, refreshSlotHas]);

  const clearSlot = useCallback((slot: number) => {
    if (!canUseSlot(slot)) return;
    if (slot === 0) {
      safeDelete(planStoreKey(slot));
    } else {
      // Write an explicit empty marker rather than deleting -- a bare
      // delete would just let the legacy fallback (readSlot) show back
      // through for a combo that's never had this slot customized, making
      // "Clear" look like it silently did nothing. Also syncs to the
      // server via the normal write path, so this combo is clear
      // cross-device too, without touching the legacy shared row (other,
      // not-yet-customized equipment keeps seeing it).
      safeWrite(planStoreKey(slot), { v: 1, savedAt: Date.now(), terminalId: UNIVERSAL_SCOPE, compPlan: {} });
      afterLocalSlotWrite(slot);
    }
    refreshSlotHas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, selectedComboId, safeDelete, safeWrite, planStoreKey, refreshSlotHas]);

  const loadFromSlot = useCallback((slot: number) => {
    if (!canUseSlot(slot)) return;
    const raw = readSlot(slot) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return;
    // Terminal-match is only meaningful for slot 0 (the real per-terminal
    // draft) -- named presets (1-5) are terminal-independent by design, so
    // they load regardless of which terminal is currently selected.
    if (slot === 0 && String(raw.terminalId) !== String(selectedTerminalId)) return;
    planRestoreReadyRef.current = planScopeKey;
    // Named presets (1-5) snap the CG slider to whatever was saved with them;
    // slot 0 (autosave/last-load draft) never restores CG -- see applySnapshot.
    applySnapshot(raw, { restoreCg: slot !== 0 });
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
  }, [selectedTerminalId, selectedComboId, readSlot, applySnapshot, planScopeKey]);

  // Read-only peek at a slot's saved compPlan, for showing a real summary
  // (e.g. "Load Diesel, Regular") in the action sheet before committing to
  // load or overwrite it. Never mutates anything.
  const peekSlot = useCallback((slot: number): PlanSnapshot | null => {
    const raw = readSlot(slot) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return null;
    return raw;
  }, [readSlot]);

  // Public: refresh slot 0 from load_log after a completed load
  // Called by page.tsx post-completeLoad so slip seat state updates without reload
  const refreshLastLoad = useCallback(async () => {
    const dbPayload = await fetchLastLoadFromLog();
    if (!dbPayload) return;
    safeWrite(planStoreKey(0), dbPayload);
    // Write lastLoadLines to dedicated key and update state immediately
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
    }
    refreshSlotHas();
    setSlotBump((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, selectedTerminalId, planStoreKey, safeWrite, refreshSlotHas]);

  // Public: "Recall Last Load" button (page.tsx) -- unlike the passive
  // mount-time restore above (which deliberately never clobbers an
  // existing slot-0 draft, so a driver's real in-progress work is never
  // silently discarded), this is a direct, explicit user request to throw
  // the current draft away and go back to the last real load. Applies the
  // DB snapshot live (compPlan + CG) immediately, unconditionally -- no
  // slotIsEmpty gate, no reload, and no dependency on the fresh-mount
  // ordering between this hook's own restore effects (those two effects
  // have independent trigger dependencies and can fire in either order;
  // a page reload was tried first and found to lose that race in
  // practice, live-verified before switching to this direct approach).
  const recallLastLoad = useCallback(async () => {
    const dbPayload = await fetchLastLoadFromLog();
    if (!dbPayload) return null;
    safeWrite(planStoreKey(0), dbPayload);
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
    }
    applySnapshot(dbPayload, { restoreCg: true });
    const report = dbPayload.loadReport ? { ...dbPayload.loadReport, recovered_points: dbPayload.loadReport.recovered_points ?? null } : null;
    setLastLoadReport(report);
    refreshSlotHas();
    // Returned (not just set on internal lastLoadReport state) because
    // page.tsx's loadWorkflow.loadReport -- what the recap card actually
    // renders -- is a SEPARATE piece of state in a different hook, synced
    // from lastLoadReport by a mount-time seed effect that's guarded to
    // only ever fire once (while loadReport is still null). By the time
    // this runs, loadReport is already set from before, so that seed
    // effect won't re-fire -- the caller has to push this report into
    // loadWorkflow directly.
    return report;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId, planStoreKey, safeWrite, applySnapshot, refreshSlotHas]);

  return {
    PLAN_SLOTS,
    slotHas,
    lastLoadLines,
    lastLoadReport,
    fetchLastProductPerComp,
    saveToSlot,
    clearSlot,
    loadFromSlot,
    peekSlot,
    refreshLastLoad,
    recallLastLoad,
  };
}
