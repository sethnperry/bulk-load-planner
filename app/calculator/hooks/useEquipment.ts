"use client";
// hooks/useEquipment.ts
// Owns: equipment_combos fetch, selectedComboId, derived name maps, localStorage persistence.
// When setupSession is active, primary equipment reads/writes go through /api/admin/setup
// so they operate as targetUserId rather than the logged-in admin.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { SetupSession } from "@/lib/setupSession";
import type { ComboRow } from "../types";
import {
  getPrimaryEquipment,
  setPrimaryTruck,
  removePrimaryTruck,
  setPrimaryTrailer,
  removePrimaryTrailer,
} from "@/lib/adminSetupClient";

// ─── Storage helpers (module-level, pure) ─────────────────────────────────────

function equipKey(userId: string) {
  return `protankr_equip_v1:${userId || "anon"}`;
}

function readPersistedEquip(key: string): { comboId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const comboId = String((parsed as any)?.comboId || "");
    return comboId ? { comboId } : null;
  } catch {
    return null;
  }
}

function writePersistedEquip(key: string, comboId: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ comboId }));
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEquipment(authUserId: string, setupSession?: SetupSession | null) {
  const effectiveUserId = setupSession?.targetUserId ?? authUserId;
  const isSetup = !!setupSession?.targetUserId;

  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState<string | null>(null);
  const [selectedComboId, setSelectedComboId] = useState("");

  const hydratedForKeyRef = useRef("");
  const hydratingRef = useRef(false);

  const anonKey = useMemo(() => equipKey("anon"), []);
  // Key off effectiveUserId so admin's selection is stored separately from target's
  const userKey = useMemo(() => equipKey(effectiveUserId), [effectiveUserId]);
  const effectiveKey = effectiveUserId ? userKey : anonKey;

  // ── Primary equipment (starred trucks/trailers) ───────────────────────────

  const [primaryTruckIds, setPrimaryTruckIds] = useState<Set<string>>(new Set());
  const [primaryTrailerIds, setPrimaryTrailerIds] = useState<Set<string>>(new Set());
  const primaryTruckIdsRef   = useRef<Set<string>>(new Set());
  const primaryTrailerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { primaryTruckIdsRef.current   = primaryTruckIds;   }, [primaryTruckIds]);
  useEffect(() => { primaryTrailerIdsRef.current = primaryTrailerIds; }, [primaryTrailerIds]);

  const loadPrimaryEquipment = useCallback(async () => {
    if (!effectiveUserId) return;
    if (isSetup) {
      // Route through service role proxy
      try {
        const { primaryTruckIds: tIds, primaryTrailerIds: trIds } =
          await getPrimaryEquipment(effectiveUserId);
        setPrimaryTruckIds(new Set(tIds));
        setPrimaryTrailerIds(new Set(trIds));
      } catch (e: any) {
        console.error("loadPrimaryEquipment (setup):", e?.message);
      }
    } else {
      const [{ data: pt }, { data: ptr }] = await Promise.all([
        supabase.from("user_primary_trucks").select("truck_id").eq("user_id", effectiveUserId),
        supabase.from("user_primary_trailers").select("trailer_id").eq("user_id", effectiveUserId),
      ]);
      setPrimaryTruckIds(new Set((pt ?? []).map((r: any) => String(r.truck_id))));
      setPrimaryTrailerIds(new Set((ptr ?? []).map((r: any) => String(r.trailer_id))));
    }
  }, [effectiveUserId, isSetup]);

  const togglePrimaryTruck = useCallback(async (truckId: string) => {
    if (!effectiveUserId) return;
    const isStarred = primaryTruckIdsRef.current.has(truckId);
    setPrimaryTruckIds((prev) => { const n = new Set(prev); isStarred ? n.delete(truckId) : n.add(truckId); return n; });
    if (isSetup) {
      try {
        if (isStarred) await removePrimaryTruck(effectiveUserId, truckId);
        else           await setPrimaryTruck(effectiveUserId, truckId);
      } catch (e: any) { console.error("togglePrimaryTruck (setup):", e?.message); }
    } else {
      if (isStarred) {
        await supabase.from("user_primary_trucks").delete().eq("user_id", effectiveUserId).eq("truck_id", truckId);
      } else {
        await supabase.from("user_primary_trucks").upsert({ user_id: effectiveUserId, truck_id: truckId }, { onConflict: "user_id,truck_id" });
      }
    }
  }, [effectiveUserId, isSetup]);

  const togglePrimaryTrailer = useCallback(async (trailerId: string) => {
    if (!effectiveUserId) return;
    const isStarred = primaryTrailerIdsRef.current.has(trailerId);
    setPrimaryTrailerIds((prev) => { const n = new Set(prev); isStarred ? n.delete(trailerId) : n.add(trailerId); return n; });
    if (isSetup) {
      try {
        if (isStarred) await removePrimaryTrailer(effectiveUserId, trailerId);
        else           await setPrimaryTrailer(effectiveUserId, trailerId);
      } catch (e: any) { console.error("togglePrimaryTrailer (setup):", e?.message); }
    } else {
      if (isStarred) {
        await supabase.from("user_primary_trailers").delete().eq("user_id", effectiveUserId).eq("trailer_id", trailerId);
      } else {
        await supabase.from("user_primary_trailers").upsert({ user_id: effectiveUserId, trailer_id: trailerId }, { onConflict: "user_id,trailer_id" });
      }
    }
  }, [effectiveUserId, isSetup]);

  // ── Fetch combos ──────────────────────────────────────────────────────────

  const fetchCombos = useCallback(async () => {
    setCombosLoading(true);
    setCombosError(null);

    const res = await supabase
      .from("equipment_combos")
      .select(
        "combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, claimed_at, company_id"
      )
      .order("combo_name", { ascending: true })
      .order("combo_id",   { ascending: true })
      .limit(200);

    if (res.error) {
      setCombosError(res.error.message);
      setCombos([]);
    } else {
      setCombos(
        ((res.data ?? []) as any[]).filter((r) => r.active !== false) as ComboRow[]
      );
    }
    setCombosLoading(false);
  }, []);

  useEffect(() => { fetchCombos(); }, [fetchCombos]);

  // Load primary equipment whenever effectiveUserId is ready
  useEffect(() => {
    if (effectiveUserId) loadPrimaryEquipment();
  }, [effectiveUserId, loadPrimaryEquipment]);

  // ── Restore persisted selection (after combos load) ───────────────────────

  useEffect(() => {
    if (combosLoading) return;
    if (hydratedForKeyRef.current === effectiveKey) return;

    hydratingRef.current = true;

    const fromUser = effectiveUserId ? readPersistedEquip(userKey) : null;
    const fromAnon = readPersistedEquip(anonKey);
    const saved = fromUser ?? fromAnon;

    if (saved?.comboId) {
      const exists = combos.some(
        (c) => String(c.combo_id) === String(saved.comboId) && c.active !== false
      );
      setSelectedComboId(exists ? String(saved.comboId) : "");

      if (effectiveUserId && !fromUser && fromAnon) {
        writePersistedEquip(userKey, fromAnon.comboId);
      }
    }

    hydratedForKeyRef.current = effectiveKey;
    hydratingRef.current = false;
  }, [effectiveUserId, effectiveKey, userKey, anonKey, combosLoading, combos]);

  // ── Persist on change ─────────────────────────────────────────────────────

  useEffect(() => {
    if (hydratedForKeyRef.current !== effectiveKey) return;
    if (hydratingRef.current) return;
    writePersistedEquip(anonKey, selectedComboId);
    if (effectiveUserId) writePersistedEquip(userKey, selectedComboId);
  }, [effectiveUserId, effectiveKey, userKey, anonKey, selectedComboId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  const truckNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of combos) {
      const tid = String(c.truck_id ?? "").trim();
      if (!tid || out[tid]) continue;
      const name = String(c.combo_name ?? "").trim();
      out[tid] = name ? (name.split("/")[0]?.trim() || `Truck …${tid.slice(-6)}`) : `Truck …${tid.slice(-6)}`;
    }
    return out;
  }, [combos]);

  const trailerNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of combos) {
      const tid = String(c.trailer_id ?? "").trim();
      if (!tid || out[tid]) continue;
      const name = String(c.combo_name ?? "").trim();
      out[tid] = name ? (name.split("/")[1]?.trim() || `Trailer …${tid.slice(-6)}`) : `Trailer …${tid.slice(-6)}`;
    }
    return out;
  }, [combos]);

  const equipmentLabel = useMemo(() => {
    if (!selectedCombo) return undefined;
    const name = String(selectedCombo.combo_name ?? "").trim();
    if (name) return name;
    const t  = truckNameById[selectedCombo.truck_id  ?? ""] ?? selectedCombo.truck_id  ?? "?";
    const tr = trailerNameById[selectedCombo.trailer_id ?? ""] ?? selectedCombo.trailer_id ?? "?";
    return `${t} / ${tr}`;
  }, [selectedCombo, truckNameById, trailerNameById]);

  return {
    combos,
    combosLoading,
    combosError,
    selectedComboId,
    setSelectedComboId,
    selectedCombo,
    truckNameById,
    trailerNameById,
    equipmentLabel,
    fetchCombos,
    primaryTruckIds,
    primaryTrailerIds,
    loadPrimaryEquipment,
    togglePrimaryTruck,
    togglePrimaryTrailer,
  };
}
