"use client";
// hooks/useExpirations.ts

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export type ExpirationItem = {
  id: string;
  label: string;
  entityName: string;      // truck name, trailer name, or terminal name
  entitySubtitle: string;  // doc type for equipment, city/state for terminals
  entityType: "truck" | "trailer" | "terminal";
  entityId: string;
  expiresISO: string;
  daysLeft: number;
  expired: boolean;
};

const TRUCK_EXP_COLS: Record<string, string> = {
  fleet_ins_expiration_date:    "Fleet Insurance",
  hazmat_lic_expiration_date:   "Hazmat License",
  ifta_expiration_date:         "IFTA",
  inner_bridge_expiration_date: "Inner Bridge",
  inspection_expiration_date:   "Inspection",
  phmsa_expiration_date:        "PHMSA",
  reg_expiration_date:          "Registration",
  alliance_expiration_date:     "Alliance",
};

const TRAILER_EXP_COLS: Record<string, string> = {
  tank_i_expiration_date:             "Tank I",
  tank_k_expiration_date:             "Tank K",
  tank_l_expiration_date:             "Tank L",
  tank_p_expiration_date:             "Tank P",
  tank_t_expiration_date:             "Tank T",
  tank_uc_expiration_date:            "Tank UC",
  tank_v_expiration_date:             "Tank V",
  trailer_inspection_expiration_date: "Trailer Inspection",
  trailer_reg_expiration_date:        "Trailer Registration",
};

const TRUCK_WARN_DAYS    = 30;
const TRAILER_WARN_DAYS  = 30;
const TERMINAL_WARN_DAYS = 7;

const DEFER_KEY = "protankr_exp_deferred_v1";

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(isoDate + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function loadDeferred(): Set<string> {
  try {
    const raw = localStorage.getItem(DEFER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

function saveDeferred(set: Set<string>) {
  try { localStorage.setItem(DEFER_KEY, JSON.stringify(Array.from(set))); } catch {}
}

export function useExpirations(opts: {
  truckId: string | null;
  trailerId: string | null;
  truckName: string;
  trailerName: string;
  accessDateByTerminalId: Record<string, string | undefined>;
  terminals: any[];
  addDaysISO_: (iso: string, days: number) => string;
}) {
  const { truckId, trailerId, truckName, trailerName, accessDateByTerminalId, terminals, addDaysISO_ } = opts;

  const [truckRow,   setTruckRow]   = useState<Record<string, any> | null>(null);
  const [trailerRow, setTrailerRow] = useState<Record<string, any> | null>(null);
  const [truckLoaded,   setTruckLoaded]   = useState(false);
  const [trailerLoaded, setTrailerLoaded] = useState(false);
  const [deferred,   setDeferred]   = useState<Set<string>>(() => loadDeferred());

  // Fetch truck
  useEffect(() => {
    if (!truckId) { setTruckRow(null); setTruckLoaded(true); return; }
    (async () => {
      const cols = Object.keys(TRUCK_EXP_COLS).join(", ");
      const { data } = await supabase
        .from("trucks")
        .select(`truck_id, truck_name, ${cols}`)
        .eq("truck_id", truckId)
        .maybeSingle();
      setTruckRow(data ?? null);
      setTruckLoaded(true);
    })();
  }, [truckId]);

  // Fetch trailer
  useEffect(() => {
    if (!trailerId) { setTrailerRow(null); setTrailerLoaded(true); return; }
    (async () => {
      const cols = Object.keys(TRAILER_EXP_COLS).join(", ");
      const { data } = await supabase
        .from("trailers")
        .select(`trailer_id, trailer_name, ${cols}`)
        .eq("trailer_id", trailerId)
        .maybeSingle();
      setTrailerRow(data ?? null);
      setTrailerLoaded(true);
    })();
  }, [trailerId]);

  // Build item list
  const items = useMemo<ExpirationItem[]>(() => {
    const out: ExpirationItem[] = [];

    if (truckRow) {
      const name = truckRow.truck_name ? String(truckRow.truck_name) : truckName || "Truck";
      for (const [col, label] of Object.entries(TRUCK_EXP_COLS)) {
        const iso = truckRow[col];
        if (!iso || typeof iso !== "string") continue;
        const days = daysUntil(iso);
        if (days <= TRUCK_WARN_DAYS) {
          out.push({ id: `truck-${truckId}-${col}`, label, entityName: name, entitySubtitle: label, entityType: "truck", entityId: String(truckId), expiresISO: iso, daysLeft: days, expired: days < 0 });
        }
      }
    }

    if (trailerRow) {
      const name = trailerRow.trailer_name ? String(trailerRow.trailer_name) : trailerName || "Trailer";
      for (const [col, label] of Object.entries(TRAILER_EXP_COLS)) {
        const iso = trailerRow[col];
        if (!iso || typeof iso !== "string") continue;
        const days = daysUntil(iso);
        if (days <= TRAILER_WARN_DAYS) {
          out.push({ id: `trailer-${trailerId}-${col}`, label, entityName: name, entitySubtitle: label, entityType: "trailer", entityId: String(trailerId), expiresISO: iso, daysLeft: days, expired: days < 0 });
        }
      }
    }

    for (const [terminalId, lastVisitISO] of Object.entries(accessDateByTerminalId)) {
      if (!lastVisitISO) continue;
      const terminal = terminals.find((t: any) => String(t.terminal_id) === terminalId);
      const renewalDays = Number(terminal?.renewal_days ?? terminal?.renewalDays ?? 90) || 90;
      const expiresISO = addDaysISO_(lastVisitISO, renewalDays);
      const days = daysUntil(expiresISO);
      if (days <= TERMINAL_WARN_DAYS) {
        const city  = terminal?.city  ? String(terminal.city)  : "";
        const state = terminal?.state ? String(terminal.state) : "";
        const subtitle = city && state ? `${city}, ${state}` : city || state || "Terminal Card";
        out.push({
          id: `terminal-${terminalId}`,
          label: subtitle,
          entityName: terminal?.terminal_name ?? `Terminal ${terminalId}`,
          entitySubtitle: subtitle,
          entityType: "terminal",
          entityId: terminalId,
          expiresISO,
          daysLeft: days,
          expired: days < 0,
        });
      }
    }

    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [truckRow, trailerRow, truckId, trailerId, truckName, trailerName, accessDateByTerminalId, terminals, addDaysISO_]);

  // Auto-remove deferred IDs only for equipment items (truck/trailer) whose expiration
  // has genuinely resolved — i.e. the item no longer appears in the list because the
  // date was updated past the warning window. Terminal items are never auto-cleaned
  // because their presence in `items` depends on accessDateByTerminalId loading timing
  // and can cause a race condition that wipes deferred state on refresh.
  const dataLoaded = truckLoaded && trailerLoaded;

  useEffect(() => {
    if (!dataLoaded) return;
    const activeIds = new Set(items.map(i => i.id));
    setDeferred(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        // Only auto-remove equipment items — never terminals
        if (id.startsWith("terminal-")) continue;
        if (!activeIds.has(id)) { next.delete(id); changed = true; }
      }
      if (changed) saveDeferred(next);
      return changed ? next : prev;
    });
  }, [items, dataLoaded]);

  const toggleDefer = useCallback((id: string) => {
    setDeferred(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveDeferred(next);
      return next;
    });
  }, []);

  const activeItems   = useMemo(() => items.filter(i => !deferred.has(i.id)), [items, deferred]);
  const deferredItems = useMemo(() => items.filter(i =>  deferred.has(i.id)), [items, deferred]);

  const expiredCount  = useMemo(() => activeItems.filter(i => i.expired).length,  [activeItems]);
  const warningCount  = useMemo(() => activeItems.filter(i => !i.expired).length, [activeItems]);
  const mostUrgent    = activeItems[0] ?? null;
  const allDeferred   = items.length > 0 && activeItems.length === 0;

  return { items, activeItems, deferredItems, expiredCount, warningCount, mostUrgent, allDeferred, toggleDefer };
}
