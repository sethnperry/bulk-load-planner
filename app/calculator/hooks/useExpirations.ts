"use client";
// hooks/useExpirations.ts
// Fetches expiration dates for the selected truck + trailer.
// Returns a sorted list of expiring/expired items for the alert bar and modal.

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";

export type ExpirationItem = {
  id: string;              // unique key
  label: string;           // e.g. "Fleet Insurance"
  entityName: string;      // e.g. "25184" (truck) or "3151" (trailer)
  entityType: "truck" | "trailer" | "terminal";
  entityId: string;        // truck_id / trailer_id / terminal_id
  expiresISO: string;      // YYYY-MM-DD
  daysLeft: number;        // negative = expired
  expired: boolean;
};

// Truck expiration columns → human labels
const TRUCK_EXP_COLS: Record<string, string> = {
  fleet_ins_expiration_date:     "Fleet Insurance",
  hazmat_lic_expiration_date:    "Hazmat License",
  ifta_expiration_date:          "IFTA",
  inner_bridge_expiration_date:  "Inner Bridge",
  inspection_expiration_date:    "Inspection",
  phmsa_expiration_date:         "PHMSA",
  reg_expiration_date:           "Registration",
  alliance_expiration_date:      "Alliance",
};

// Trailer expiration columns → human labels
const TRAILER_EXP_COLS: Record<string, string> = {
  tank_i_expiration_date:                "Tank I",
  tank_k_expiration_date:                "Tank K",
  tank_l_expiration_date:                "Tank L",
  tank_p_expiration_date:                "Tank P",
  tank_t_expiration_date:                "Tank T",
  tank_uc_expiration_date:               "Tank UC",
  tank_v_expiration_date:                "Tank V",
  trailer_inspection_expiration_date:    "Trailer Inspection",
  trailer_reg_expiration_date:           "Trailer Registration",
};

const TRUCK_WARN_DAYS    = 30;
const TRAILER_WARN_DAYS  = 30;
const TERMINAL_WARN_DAYS = 7;

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(isoDate + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

export function useExpirations(opts: {
  truckId: string | null;
  trailerId: string | null;
  truckName: string;
  trailerName: string;
  // terminal access dates keyed by terminal_id
  accessDateByTerminalId: Record<string, string | undefined>;
  // terminal list for names
  terminals: any[];
  addDaysISO_: (iso: string, days: number) => string;
}) {
  const { truckId, trailerId, truckName, trailerName, accessDateByTerminalId, terminals, addDaysISO_ } = opts;

  const [truckRow, setTruckRow] = useState<Record<string, any> | null>(null);
  const [trailerRow, setTrailerRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch truck row
  useEffect(() => {
    if (!truckId) { setTruckRow(null); return; }
    (async () => {
      setLoading(true);
      const cols = Object.keys(TRUCK_EXP_COLS).join(", ");
      const { data } = await supabase
        .from("trucks")
        .select(`truck_id, truck_name, ${cols}`)
        .eq("truck_id", truckId)
        .maybeSingle();
      setTruckRow(data ?? null);
      setLoading(false);
    })();
  }, [truckId]);

  // Fetch trailer row
  useEffect(() => {
    if (!trailerId) { setTrailerRow(null); return; }
    (async () => {
      setLoading(true);
      const cols = Object.keys(TRAILER_EXP_COLS).join(", ");
      const { data } = await supabase
        .from("trailers")
        .select(`trailer_id, trailer_name, ${cols}`)
        .eq("trailer_id", trailerId)
        .maybeSingle();
      setTrailerRow(data ?? null);
      setLoading(false);
    })();
  }, [trailerId]);

  // Build full expiration list
  const items = useMemo<ExpirationItem[]>(() => {
    const out: ExpirationItem[] = [];

    // Truck docs
    if (truckRow) {
      const name = truckRow.truck_name
        ? String(truckRow.truck_name)
        : truckName || String(truckId ?? "Truck");
      for (const [col, label] of Object.entries(TRUCK_EXP_COLS)) {
        const iso = truckRow[col];
        if (!iso || typeof iso !== "string") continue;
        const days = daysUntil(iso);
        if (days <= TRUCK_WARN_DAYS) {
          out.push({
            id: `truck-${truckId}-${col}`,
            label,
            entityName: name,
            entityType: "truck",
            entityId: String(truckId),
            expiresISO: iso,
            daysLeft: days,
            expired: days < 0,
          });
        }
      }
    }

    // Trailer docs
    if (trailerRow) {
      const name = trailerRow.trailer_name
        ? String(trailerRow.trailer_name)
        : trailerName || String(trailerId ?? "Trailer");
      for (const [col, label] of Object.entries(TRAILER_EXP_COLS)) {
        const iso = trailerRow[col];
        if (!iso || typeof iso !== "string") continue;
        const days = daysUntil(iso);
        if (days <= TRAILER_WARN_DAYS) {
          out.push({
            id: `trailer-${trailerId}-${col}`,
            label,
            entityName: name,
            entityType: "trailer",
            entityId: String(trailerId),
            expiresISO: iso,
            daysLeft: days,
            expired: days < 0,
          });
        }
      }
    }

    // Terminal cards
    for (const [terminalId, lastVisitISO] of Object.entries(accessDateByTerminalId)) {
      if (!lastVisitISO) continue;
      const terminal = terminals.find((t: any) => String(t.terminal_id) === terminalId);
      const renewalDays = Number(terminal?.renewal_days ?? terminal?.renewalDays ?? 90) || 90;
      const expiresISO = addDaysISO_(lastVisitISO, renewalDays);
      const days = daysUntil(expiresISO);
      if (days <= TERMINAL_WARN_DAYS) {
        out.push({
          id: `terminal-${terminalId}`,
          label: "Terminal Card",
          entityName: terminal?.terminal_name ?? `Terminal ${terminalId}`,
          entityType: "terminal",
          entityId: terminalId,
          expiresISO,
          daysLeft: days,
          expired: days < 0,
        });
      }
    }

    // Sort: expired first, then soonest expiring
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [truckRow, trailerRow, truckId, trailerId, truckName, trailerName, accessDateByTerminalId, terminals, addDaysISO_]);

  const expiredCount  = useMemo(() => items.filter(i => i.expired).length, [items]);
  const warningCount  = useMemo(() => items.filter(i => !i.expired).length, [items]);
  const mostUrgent    = items[0] ?? null;

  return { items, expiredCount, warningCount, mostUrgent, loading };
}
