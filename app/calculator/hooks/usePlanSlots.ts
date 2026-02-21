"use client";
// hooks/usePlanSlots.ts
// Owns: plan snapshot save/load, localStorage hot cache, Supabase cross-device sync.
// Intentionally isolated — this is the most complex state machine in the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
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

type Props = {
  authUserId: string;
  selectedTerminalId: string;
  selectedComboId: string;
  tempF: number;
  cgSlider: number;
  compPlan: Record<number, CompPlanInput>;
  setCgSlider: (v: number) => void;
  setCompPlan: (v: Record<number, CompPlanInput>) => void;
  compartmentsLoaded: boolean;
  // Called by useLoadWorkflow after completeLoad — writes slot 0 as equipment-scoped
  onSaveLastLoad?: (payload: any) => Promise<void>;
};

export function usePlanSlots({
  authUserId, selectedTerminalId, selectedComboId,
  tempF, cgSlider, compPlan,
  setCgSlider, setCompPlan,
  compartmentsLoaded,
  onSaveLastLoad,
}: Props) {
  const [slotBump, setSlotBump] = useState(0);
  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});
  const [lastLoadLines, setLastLoadLines] = useState<any[]>([]);

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

  const planStoreKey = useCallback(
    (slot: number) => `${planScopeKey}:plan:slot:${slot}`,
    [planScopeKey]
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

  // ── Slot has map ──────────────────────────────────────────────────────────

  const refreshSlotHas = useCallback(() => {
    if (!selectedTerminalId) { setSlotHas({}); setLastLoadLines([]); return; }
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = !!safeRead(planStoreKey(s));
    setSlotHas(next);
    // Read lastLoadLines from dedicated key (never clobbered by autosave)
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      const llData = safeRead(llKey) as any;
      const ll = llData?.lastLoadLines ?? [];
      setLastLoadLines(ll);
    }
  }, [selectedTerminalId, planStoreKey, safeRead]);

  // ── Supabase server sync ──────────────────────────────────────────────────

  async function serverFetchSlots(): Promise<Record<number, any>> {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return {};
    const { data, error } = await supabase
      .from("user_plan_slots")
      .select("slot,payload,updated_at")
      .eq("user_id", authUserId)
      .eq("terminal_id", String(selectedTerminalId))
      .eq("combo_id", String(selectedComboId))
      .in("slot", [0, 1, 2, 3, 4, 5]);
    if (error) { console.warn("serverFetchSlots error:", error.message); return {}; }
    const out: Record<number, any> = {};
    (data || []).forEach((r: any) => { out[Number(r.slot)] = r.payload ?? null; });
    return out;
  }

  async function serverUpsertSlot(slot: number, payload: any) {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return;
    const { error } = await supabase.from("user_plan_slots").upsert({
      user_id: authUserId, terminal_id: String(selectedTerminalId),
      combo_id: String(selectedComboId), slot, payload,
    }, { onConflict: "user_id,terminal_id,combo_id,slot" });
    if (error) console.warn("serverUpsertSlot error:", error.message);
  }

  async function serverDeleteSlot(slot: number) {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return;
    const { error } = await supabase.from("user_plan_slots").delete()
      .eq("user_id", authUserId).eq("terminal_id", String(selectedTerminalId))
      .eq("combo_id", String(selectedComboId)).eq("slot", slot);
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
    console.log("[planSlots] fetchLastLoadFromLog — comboId:", selectedComboId);
    if (!selectedComboId) return null;

    // Step 1: get the most recent completed load_id for this combo
    // Broad diagnostic: any rows visible at all?
    const { data: anyRows, error: anyErr } = await supabase
      .from("load_log")
      .select("load_id, status, started_at, combo_id, user_id")
      .order("started_at", { ascending: false })
      .limit(3);
    console.log("[planSlots] BROAD load_log (no filter):", anyRows?.map((r: any) => ({ status: r.status, combo_id: r.combo_id?.slice(0,8), user_id: r.user_id?.slice(0,8) })), "err:", anyErr?.message);

    const { data: comboRows, error: comboErr } = await supabase
      .from("load_log")
      .select("load_id, status, started_at, combo_id")
      .eq("combo_id", selectedComboId)
      .order("started_at", { ascending: false })
      .limit(5);
    console.log("[planSlots] load_log for THIS combo (all statuses):", comboRows?.map((r: any) => ({ status: r.status, load_id: r.load_id?.slice(0,8) })), "err:", comboErr?.message, "comboId:", selectedComboId?.slice(0,8));

    const logRow = comboRows?.find((r: any) => r.status === "completed") ?? null;
    const logErr = comboErr;
    if (!logRow) {
      console.log("[planSlots] no completed row found. All statuses seen:", comboRows?.map((r:any)=>r.status));
      // Try with any status as fallback — use most recent regardless
      const fallback = comboRows?.[0] ?? null;
      if (!fallback) return null;
      console.log("[planSlots] using fallback row with status:", fallback.status);
      // Continue with fallback below — reassign
      Object.assign(logRow ?? {}, fallback);
    }
    // Resolved row
    const resolvedRow = comboRows?.find((r: any) => r.status === "completed") ?? comboRows?.[0] ?? null;
    console.log("[planSlots] resolved row:", resolvedRow ? { load_id: resolvedRow.load_id?.slice(0,8), status: resolvedRow.status } : null);
    if (!resolvedRow) return null;

    // Step 2: get load_lines for that load, joined with products for un_number
    const { data: lineRows, error: lineErr } = await supabase
      .from("load_lines")
      .select("comp_number, product_id, planned_gallons, products(un_number, product_name, display_name)")
      .eq("load_id", resolvedRow.load_id);

    console.log("[planSlots] load_lines:", lineRows?.map((l: any) => ({ comp: l.comp_number, pid: l.product_id, un: l.products?.un_number })), "err:", lineErr?.message);
    if (lineErr || !lineRows) return null;
    if (lineRows.length === 0) { console.log("[planSlots] load_lines empty — RLS may be blocking or load has no lines"); }

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

    console.log("[planSlots] final lines:", lines);
    return {
      v: 1,
      savedAt: resolvedRow.started_at ? new Date(resolvedRow.started_at).getTime() : Date.now(),
      terminalId: String((resolvedRow as any).terminal_id ?? selectedTerminalId ?? ""),
      tempF: 60,
      cgSlider: 0.5,
      compPlan,
      lastLoadLines: lines,
      lastLoadId: resolvedRow.load_id,
    };
  }

  // ── Snapshot build/apply ──────────────────────────────────────────────────

  const buildSnapshot = useCallback(
    (terminalId: string): PlanSnapshot => ({
      v: 1, savedAt: Date.now(), terminalId,
      tempF: Number(tempF) || 60,
      cgSlider: Number(cgSlider) || 0.25,
      compPlan,
    }),
    [tempF, cgSlider, compPlan]
  );

  const applySnapshot = useCallback((snap: PlanSnapshot) => {
    // NOTE: tempF is intentionally NOT restored from any snapshot.
    // The fuel temp prediction always owns tempF. Restoring it from saved state
    // would override the prediction every time a slot is switched or the page reloads.
    setCgSlider(Number(snap.cgSlider) || 0.25);
    setCompPlan(snap.compPlan || {});
  }, [setCgSlider, setCompPlan]);

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
        const server = await serverFetchSlots();
        for (const s of [0, 1, 2, 3, 4, 5]) {
          const sp = server[s];
          if (!sp) continue;
          const localRaw = typeof window !== "undefined" ? localStorage.getItem(planStoreKey(s)) : null;
          const lp = parsePlanPayload(localRaw, selectedTerminalId, selectedComboId);
          if (!lp || compareSavedAt(sp, lp) > 0) {
            try { localStorage.setItem(planStoreKey(s), JSON.stringify(sp)); setSlotBump((v) => v + 1); } catch {}
          }
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
            if (typeof local0.cgSlider === "number") setCgSlider(local0.cgSlider);
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

      // Only restore the plan (compPlan/temp/CG) if slot 0 is empty — i.e. fresh page load
      // with no autosaved state. If slot 0 has data the driver is mid-plan; don't clobber it.
      const localRaw = safeRead(planStoreKey(0));
      const slotIsEmpty = !localRaw || !localRaw.savedAt;
      if (slotIsEmpty) {
        safeWrite(planStoreKey(0), dbPayload);
        applySnapshot(dbPayload);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId]);

  // ── Restore slot 0 on terminal change ─────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    const raw = safeRead(planStoreKey(0)) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;
    if (raw && raw.v === 1 && String(raw.terminalId) === String(selectedTerminalId)) {
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
  }, [selectedTerminalId, tempF, cgSlider, compPlan]);

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
  }, [selectedTerminalId, tempF, cgSlider, compPlan, buildSnapshot, planStoreKey, safeWrite, refreshSlotHas]);

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

  const saveToSlot = useCallback((slot: number) => {
    if (!selectedTerminalId) return;
    const snap = buildSnapshot(String(selectedTerminalId));
    safeWrite(planStoreKey(slot), snap);
    refreshSlotHas();
    afterLocalSlotWrite(slot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, buildSnapshot, safeWrite, planStoreKey, refreshSlotHas]);

  const loadFromSlot = useCallback((slot: number) => {
    if (!selectedTerminalId) return;
    const raw = safeRead(planStoreKey(slot)) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return;
    if (String(raw.terminalId) !== String(selectedTerminalId)) return;
    planRestoreReadyRef.current = planScopeKey;
    applySnapshot(raw);
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
  }, [selectedTerminalId, planStoreKey, safeRead, applySnapshot, planScopeKey]);

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

  return {
    PLAN_SLOTS,
    slotHas,
    lastLoadLines,
    fetchLastProductPerComp,
    saveToSlot,
    loadFromSlot,
    refreshLastLoad,
  };
}
