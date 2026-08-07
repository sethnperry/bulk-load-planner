"use client";
// app/admin/IncentiveSettingsModal.tsx
//
// Fleet Tier Section 2: Incentive system ("Recovered Gallons") -- admin-only
// setup. Off by default; admin enables it, sets the GVW cap, and sets a
// benchmark gallons figure per product the company actually runs (search +
// add, not a picker over the full granular catalog -- most companies only
// benchmark a handful of products). See CLAUDE.md "Incentive system" for
// the full spec and calculate_load_points (in the queued incentive_system
// migration) for how these feed the actual per-load calc.
//
// reference_density is computed here from products.api_60/alpha_per_f (same
// formula as planMath.ts's lbsPerGallonAtTemp at T=60) purely so the admin
// sees an approximate weight while entering gallons -- it's a snapshot,
// informational only, never read back by the live calc engine.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { lbsPerGallonAtTemp } from "@/app/planner/utils/planMath";

type ProductRow = {
  product_id: string;
  product_name: string | null;
  display_name: string | null;
  button_code: string | null;
  api_60: number | null;
  alpha_per_f: number | null;
};

type BenchmarkRow = {
  product_id: string;
  benchmark_gallons: number;
  reference_density: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

const INPUT: React.CSSProperties = {
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 14, padding: "9px 12px", boxSizing: "border-box" as const,
};

export default function IncentiveSettingsModal({ open, onClose, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [weightCapLbs, setWeightCapLbs] = useState("80000");
  const [payPeriodType, setPayPeriodType] = useState("biweekly");
  const [payPeriodAnchorDate, setPayPeriodAnchorDate] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkRow>>({});
  const [removedProductIds, setRemovedProductIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setError(null);
    setRemovedProductIds(new Set());
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: settings }, { data: prods }, { data: existing }] = await Promise.all([
        supabase.from("incentive_settings").select("enabled, weight_cap_lbs, pay_period_type, pay_period_anchor_date").eq("company_id", companyId).maybeSingle(),
        supabase.from("products").select("product_id, product_name, display_name, button_code, api_60, alpha_per_f").order("product_name"),
        supabase.from("product_benchmarks").select("product_id, benchmark_gallons, reference_density").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      setEnabled(Boolean(settings?.enabled));
      setWeightCapLbs(String(settings?.weight_cap_lbs ?? 80000));
      setPayPeriodType(settings?.pay_period_type ?? "biweekly");
      setPayPeriodAnchorDate(settings?.pay_period_anchor_date ?? new Date().toISOString().slice(0, 10));
      setProducts((prods ?? []) as ProductRow[]);
      const map: Record<string, BenchmarkRow> = {};
      for (const row of (existing ?? []) as BenchmarkRow[]) map[row.product_id] = row;
      setBenchmarks(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  const addedList = useMemo(
    () => Object.values(benchmarks).filter((b) => !removedProductIds.has(b.product_id)),
    [benchmarks, removedProductIds]
  );

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.product_id, p])), [products]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => !benchmarks[p.product_id] || removedProductIds.has(p.product_id))
      .filter((p) => `${p.display_name ?? ""} ${p.product_name ?? ""} ${p.button_code ?? ""}`.toLowerCase().includes(q))
      .slice(0, 25);
  }, [products, search, benchmarks, removedProductIds]);

  function addProduct(p: ProductRow) {
    const density = p.api_60 != null && p.alpha_per_f != null ? lbsPerGallonAtTemp(p.api_60, p.alpha_per_f, 60) : null;
    setBenchmarks((prev) => ({ ...prev, [p.product_id]: { product_id: p.product_id, benchmark_gallons: 0, reference_density: density } }));
    setRemovedProductIds((prev) => { const n = new Set(prev); n.delete(p.product_id); return n; });
    setSearch("");
  }

  function setGallons(productId: string, val: string) {
    const n = Number(val);
    setBenchmarks((prev) => ({ ...prev, [productId]: { ...prev[productId], benchmark_gallons: Number.isFinite(n) ? n : 0 } }));
  }

  function removeProduct(productId: string) {
    setRemovedProductIds((prev) => new Set(prev).add(productId));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const cap = Number(weightCapLbs);
      const { error: settingsErr } = await supabase.from("incentive_settings").upsert({
        company_id: companyId,
        enabled,
        weight_cap_lbs: Number.isFinite(cap) && cap > 0 ? cap : 80000,
        pay_period_type: payPeriodType,
        pay_period_anchor_date: payPeriodAnchorDate || null,
        updated_at: new Date().toISOString(),
      });
      if (settingsErr) throw settingsErr;

      const toUpsert = addedList.filter((b) => b.benchmark_gallons > 0);
      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase.from("product_benchmarks").upsert(
          toUpsert.map((b) => ({
            company_id: companyId,
            product_id: b.product_id,
            benchmark_gallons: b.benchmark_gallons,
            reference_density: b.reference_density,
            updated_at: new Date().toISOString(),
          }))
        );
        if (upsertErr) throw upsertErr;
      }

      if (removedProductIds.size > 0) {
        const { error: delErr } = await supabase.from("product_benchmarks")
          .delete()
          .eq("company_id", companyId)
          .in("product_id", Array.from(removedProductIds));
        if (delErr) throw delErr;
      }

      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Incentive Settings</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>Enable Recovered Gallons</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Drivers earn points for loading closer to legal capacity</div>
                </div>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
              </label>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>WEIGHT CAP (GVW, lbs)</div>
                <input type="number" value={weightCapLbs} onChange={(e) => setWeightCapLbs(e.target.value)} style={{ ...INPUT, width: "100%" }} />
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>PAY PERIOD</div>
                  <select value={payPeriodType} onChange={(e) => setPayPeriodType(e.target.value)} style={{ ...INPUT, width: "100%" }}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semi_monthly">Semi-monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>ANCHOR DATE</div>
                  <input type="date" value={payPeriodAnchorDate} onChange={(e) => setPayPeriodAnchorDate(e.target.value)} style={{ ...INPUT, width: "100%" }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, lineHeight: 1.5 }}>
                Anchor date fixes the start of a period (day-of-week for weekly/biweekly, day-of-month for semi-monthly/monthly). Drives the period dropdown in the Payroll Report.
              </div>

              <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>PRODUCT BENCHMARKS (gallons)</div>

              {addedList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {addedList.map((b) => {
                    const p = productById[b.product_id];
                    const label = p?.display_name ?? p?.product_name ?? b.product_id;
                    return (
                      <div key={b.product_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</div>
                        <input
                          type="number"
                          value={b.benchmark_gallons || ""}
                          onChange={(e) => setGallons(b.product_id, e.target.value)}
                          placeholder="gallons"
                          style={{ ...INPUT, width: 100, padding: "6px 8px" }}
                        />
                        <button type="button" onClick={() => removeProduct(b.product_id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product to add…"
                style={{ ...INPUT, width: "100%" }}
              />
              {searchResults.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {searchResults.map((p) => (
                    <div key={p.product_id} role="button" tabIndex={0} onClick={() => addProduct(p)}
                      style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                      {p.display_name ?? p.product_name}
                    </div>
                  ))}
                </div>
              )}

              {error && <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{error}</div>}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button type="button" onClick={handleSave} disabled={saving || loading}
            style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: "rgba(74,222,128,0.15)", color: "#4ade80", fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
