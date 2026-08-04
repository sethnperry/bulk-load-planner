"use client";
// app/calculator/cards/DriverCardsReadOnly.tsx
//
// Cards tab, contextual for dispatch/admin viewing a selected driver
// (shell.selectedDriverId) -- status-only, same scope-down FleetCardsModal.tsx
// already established for this exact class of feature ("doesn't read/show
// card_number/PIN"). RLS backing this (user_terminal_cards_admin_dispatch_read,
// terminal_access_admin_dispatch_read) is read-only by design -- see the
// 20260812000000 migration's own comment for why full read/write parity
// ("same controls as the driver") was deliberately not built this pass.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { cardStateFor } from "./cardTheme";
import { addDaysISO_, formatMDYWithCountdown_ } from "../utils/dates";

const DARK_EXP_COLOR: Record<string, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

type Row = { terminal_id: string; terminal_name: string; city: string | null; state: string | null; expiresISO: string | null; hasCard: boolean };

export default function DriverCardsReadOnly({ driverId }: { driverId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [driverName, setDriverName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: nameRows }, { data: accessRows }, { data: cardRows }] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: [driverId] }),
        supabase.from("terminal_access").select("terminal_id, carded_on").eq("user_id", driverId),
        supabase.from("user_terminal_cards").select("terminal_id").eq("user_id", driverId),
      ]);
      if (!cancelled) setDriverName((nameRows ?? [])[0]?.display_name ?? "this driver");
      if (cancelled) return;
      const cardIdSet = new Set(((cardRows ?? []) as any[]).map((r) => String(r.terminal_id)));
      const accessByTerminal = new Map<string, string>();
      for (const r of (accessRows ?? []) as any[]) accessByTerminal.set(String(r.terminal_id), r.carded_on);
      const terminalIds = Array.from(new Set([...accessByTerminal.keys(), ...cardIdSet]));

      let termRows: any[] = [];
      if (terminalIds.length > 0) {
        const { data } = await supabase.from("terminals").select("terminal_id, terminal_name, city, state, renewal_days").in("terminal_id", terminalIds);
        termRows = data ?? [];
      }
      if (cancelled) return;
      const built: Row[] = termRows.map((t) => {
        const tid = String(t.terminal_id);
        const cardedOn = accessByTerminal.get(tid) ?? null;
        const renewalDays = t.renewal_days ?? 90;
        return {
          terminal_id: tid, terminal_name: t.terminal_name, city: t.city, state: t.state,
          expiresISO: cardedOn ? addDaysISO_(cardedOn, renewalDays) : null,
          hasCard: cardIdSet.has(tid),
        };
      });
      setRows(built);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [driverId]);

  const cityGroups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const city = r.city ?? "Unknown";
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(r);
    }
    return Array.from(map.keys()).sort().map((city) => ({
      city, items: map.get(city)!.sort((a, b) => a.terminal_name.localeCompare(b.terminal_name)),
    }));
  }, [rows]);

  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
        Viewing <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{driverName}</span>'s terminal cards — status only.
      </div>

      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "40px 20px" }}>No terminal cards on file.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {cityGroups.map(({ city, items }) => (
          <div key={city}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>{city}</div>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((r) => {
                const state = cardStateFor(r.expiresISO);
                return (
                  <div key={r.terminal_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{r.terminal_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
                      {r.expiresISO ? formatMDYWithCountdown_(r.expiresISO) : r.hasCard ? "No visit on file" : "Not Carded"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
