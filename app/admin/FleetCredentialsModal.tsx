"use client";
// app/admin/FleetCredentialsModal.tsx
//
// Fleet Tier Section 1.3, part 2: fleet-wide read-only view of driver
// credential status (license / medical card / TWIC) for admin+dispatch --
// completes what FleetCardsModal.tsx already does for terminal cards.
// Needs supabase/migrations/20260806000000_dispatch_credential_visibility.sql
// applied first (new admin+dispatch SELECT policies on the three
// credential tables) or this will only ever show the current user's own
// row for anyone who isn't a super admin.
//
// Deliberately excludes driver_port_ids -- that table is the freeform,
// multi-row "Badges" list (Cards tab), a different shape entirely from the
// singular license/medical/TWIC credentials this mirrors. The existing
// single-driver CredentialsReportModal.tsx (the only prior "Credentials"
// UI in the app) has the same scope for the same reason -- not a new
// omission introduced here.
//
// Status-only, like FleetCardsModal: shows expiration + computed state,
// not the underlying license/card field data (number, class, examiner,
// etc.) -- dispatch needs to know *who's about to lapse*, not the full
// record.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { cardStateFor, type CardState } from "@/app/calculator/cards/cardTheme";
import { formatMDYWithCountdown_ } from "@/app/calculator/utils/dates";

// Same override FleetCardsModal.tsx uses -- cardTheme.ts's EXP_COLOR is
// calibrated for the light/pearl Cards-tab background; "valid" there reads
// as near-black, unreadable on this modal's dark surface.
const DARK_EXP_COLOR: Record<CardState, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

type DriverCreds = {
  user_id: string;
  display_name: string;
  licenseExp: string | null;
  medicalExp: string | null;
  twicExp: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

function StatusChip({ label, iso }: { label: string; iso: string | null }) {
  const state = cardStateFor(iso);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: DARK_EXP_COLOR[state], marginTop: 2, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
        {iso ? formatMDYWithCountdown_(iso) : "Not on file"}
      </div>
    </div>
  );
}

export default function FleetCredentialsModal({ open, onClose, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<DriverCreds[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: memberRows } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId);
        const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
        if (memberIds.length === 0) { if (!cancelled) setDrivers([]); return; }

        const [{ data: profileRows }, { data: licRows }, { data: medRows }, { data: twicRows }] = await Promise.all([
          supabase.rpc("get_display_names_full", { p_user_ids: memberIds }),
          supabase.from("driver_licenses").select("user_id, expiration_date").eq("company_id", companyId).in("user_id", memberIds),
          supabase.from("driver_medical_cards").select("user_id, expiration_date").eq("company_id", companyId).in("user_id", memberIds),
          supabase.from("driver_twic_cards").select("user_id, expiration_date").eq("company_id", companyId).in("user_id", memberIds),
        ]);
        const nameById = Object.fromEntries(((profileRows ?? []) as any[]).map((p) => [p.user_id, p.display_name ?? "Unknown"]));
        const licById = Object.fromEntries(((licRows ?? []) as any[]).map((r) => [r.user_id, r.expiration_date ?? null]));
        const medById = Object.fromEntries(((medRows ?? []) as any[]).map((r) => [r.user_id, r.expiration_date ?? null]));
        const twicById = Object.fromEntries(((twicRows ?? []) as any[]).map((r) => [r.user_id, r.expiration_date ?? null]));

        const rows: DriverCreds[] = memberIds.map((uid: string) => ({
          user_id: uid,
          display_name: nameById[uid] ?? "Unknown",
          licenseExp: licById[uid] ?? null,
          medicalExp: medById[uid] ?? null,
          twicExp: twicById[uid] ?? null,
        })).sort((a, b) => a.display_name.localeCompare(b.display_name));
        if (!cancelled) setDrivers(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Fleet Credentials</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : drivers.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>No drivers in this company.</div>
          ) : (
            drivers.map((d) => (
              <div key={d.user_id} style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>{d.display_name}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <StatusChip label="License" iso={d.licenseExp} />
                  <StatusChip label="Medical" iso={d.medicalExp} />
                  <StatusChip label="TWIC" iso={d.twicExp} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
