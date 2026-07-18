"use client";
// app/superadmin/page.tsx
//
// Internal ProTankr-operator tool (not a per-company admin page -- that's
// /admin, gated by company role). Gated by is_super_admin(), which already
// exists and already has Seth's user_id seeded in super_admins. Minimal
// "help desk" surface: list every company, toggle is_solo, rename.
//
// Companies has no write RLS policy at all (SELECT-only), so edits go
// through the super_admin_update_company() SECURITY DEFINER RPC rather than
// a raw table write -- matches the existing pattern (delete_truck,
// couple_combo, provision_solo_company are all RPCs, not RLS writes).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavMenu from "@/lib/ui/NavMenu";
import { supabase } from "@/lib/supabase/client";

type CompanyRow = {
  company_id: string;
  company_name: string;
  is_solo: boolean;
  owner_user_id: string | null;
  created_at: string;
  memberCount: number;
  ownerName: string | null;
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: co, error: coErr }, { data: memberships, error: memErr }] = await Promise.all([
        supabase.from("companies").select("company_id, company_name, is_solo, owner_user_id, created_at").order("created_at"),
        supabase.from("user_companies").select("company_id"),
      ]);
      if (coErr) throw coErr;
      if (memErr) throw memErr;

      const counts: Record<string, number> = {};
      for (const m of memberships ?? []) {
        const cid = String((m as any).company_id);
        counts[cid] = (counts[cid] ?? 0) + 1;
      }

      const ownerIds = Array.from(new Set((co ?? []).map((c: any) => c.owner_user_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: names } = await supabase.rpc("get_display_names", { p_user_ids: ownerIds });
        for (const row of names ?? []) {
          if ((row as any).user_id) nameMap[String((row as any).user_id)] = (row as any).display_name ?? "Unknown";
        }
      }

      const rows: CompanyRow[] = (co ?? []).map((c: any) => ({
        company_id: String(c.company_id),
        company_name: c.company_name,
        is_solo: Boolean(c.is_solo),
        owner_user_id: c.owner_user_id ?? null,
        created_at: c.created_at,
        memberCount: counts[String(c.company_id)] ?? 0,
        ownerName: c.owner_user_id ? (nameMap[String(c.owner_user_id)] ?? "Unknown") : null,
      }));

      setCompanies(rows);
      setNameDrafts(Object.fromEntries(rows.map((r) => [r.company_id, r.company_name])));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc("is_super_admin");
      if (rpcErr || !data) {
        setAuthorized(false);
        setChecking(false);
        return;
      }
      setAuthorized(true);
      setChecking(false);
      await loadCompanies();
    })();
  }, [loadCompanies]);

  async function toggleSolo(row: CompanyRow) {
    setBusyId(row.company_id);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("super_admin_update_company", {
        p_company_id: row.company_id,
        p_company_name: row.company_name,
        p_is_solo: !row.is_solo,
      });
      if (rpcErr) throw rpcErr;
      await loadCompanies();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update company.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveName(row: CompanyRow) {
    const draft = (nameDrafts[row.company_id] ?? "").trim();
    if (!draft || draft === row.company_name) return;
    setBusyId(row.company_id);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("super_admin_update_company", {
        p_company_id: row.company_id,
        p_company_name: draft,
        p_is_solo: row.is_solo,
      });
      if (rpcErr) throw rpcErr;
      await loadCompanies();
    } catch (e: any) {
      setError(e?.message ?? "Failed to rename company.");
    } finally {
      setBusyId(null);
    }
  }

  const base = {
    minHeight: "100dvh", background: "#111111", color: "rgba(255,255,255,0.9)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "24px 20px",
  } as React.CSSProperties;

  if (checking) {
    return <div style={base}>Checking access…</div>;
  }

  if (!authorized) {
    return (
      <div style={base}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <NavMenu />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Not authorized</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
          This tool is restricted to ProTankr super admins.
        </div>
        <button
          type="button"
          onClick={() => router.push("/calculator")}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}
        >
          Back to Planner
        </button>
      </div>
    );
  }

  return (
    <div style={base}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Companies</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            Super-admin tool. Toggling Solo changes which UI a company's members see immediately.
          </div>
        </div>
        <NavMenu />
      </div>

      {error && (
        <div style={{ borderRadius: 12, padding: 12, marginBottom: 16, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.45)" }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {companies.map((row) => (
            <div
              key={row.company_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto auto",
                alignItems: "center",
                gap: 16,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <input
                value={nameDrafts[row.company_id] ?? row.company_name}
                onChange={(e) => setNameDrafts((prev) => ({ ...prev, [row.company_id]: e.target.value }))}
                onBlur={() => saveName(row)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{
                  background: "transparent", border: "none", color: "#fff", fontWeight: 800, fontSize: 15,
                  outline: "none", padding: "4px 0", minWidth: 0,
                }}
              />

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>
                {row.ownerName ? `Owner: ${row.ownerName}` : "No owner"}
              </div>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>
                {row.memberCount} member{row.memberCount !== 1 ? "s" : ""}
              </div>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                {new Date(row.created_at).toLocaleDateString()}
              </div>

              <button
                type="button"
                onClick={() => toggleSolo(row)}
                disabled={busyId === row.company_id}
                title={row.is_solo ? "Solo -- click to make Fleet" : "Fleet -- click to make Solo"}
                style={{
                  padding: "6px 12px", borderRadius: 10, fontWeight: 800, fontSize: 12,
                  whiteSpace: "nowrap", cursor: busyId === row.company_id ? "not-allowed" : "pointer",
                  opacity: busyId === row.company_id ? 0.5 : 1,
                  border: row.is_solo ? "1px solid rgba(103,232,249,0.4)" : "1px solid rgba(255,255,255,0.16)",
                  background: row.is_solo ? "rgba(103,232,249,0.12)" : "rgba(255,255,255,0.06)",
                  color: row.is_solo ? "#67e8f9" : "rgba(255,255,255,0.7)",
                }}
              >
                {busyId === row.company_id ? "…" : row.is_solo ? "Solo" : "Fleet"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
