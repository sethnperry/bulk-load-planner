"use client";

import React, { useMemo } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

export type ProductInputs = Record<
  string,
  {
    api?: string; // keep string for partial typing
    tempF?: number;
  }
>;

type LastProductInfo = {
  last_api?: number | null;
  last_api_updated_at?: string | null; // timestamptz string from Supabase
};

function badgeFromName_(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "—";
  const parts = s.split(/\s+/g).filter(Boolean);
  const first = parts[0] ?? "";
  if (parts.length >= 2) return (first[0] + (parts[1]?.[0] ?? "")).toUpperCase();
  const alnum = first.replace(/[^a-zA-Z0-9]/g, "");
  return (alnum.slice(0, 2) || first.slice(0, 2)).toUpperCase();
}

function fmtLastApiLine_(args: {
  lastApi?: number | null;
  lastApiUpdatedAt?: string | null;
  timeZone?: string | null;
}): string | null {
  const api = args.lastApi;
  const ts = args.lastApiUpdatedAt;
  if (api == null || !Number.isFinite(Number(api)) || !ts) return null;

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return `API was ${api}`;

  const tz = args.timeZone || "UTC";

  // MM/DD @ HH:mm (24h) in terminal timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const hh = get("hour");
  const mi = get("minute");

  if (mm && dd && hh && mi) {
    return `API was ${api} on ${mm}/${dd} @ ${hh}:${mi} hrs`;
  }
  return `API was ${api}`;
}

export default function LoadingModal(props: {
  open: boolean;
  onClose: () => void;

  styles: any;

  planRows: PlanRowLike[];
  productNameById: Map<string, string>;

  // Optional: product styling overrides from catalog
  productButtonCodeById?: Record<string, string>;
  productHexCodeById?: Record<string, string>;

  productInputs: ProductInputs;
  setProductApi: (productId: string, api: string) => void;

  onOpenTempDial: (productId: string) => void;
  onLoaded: () => void;

  loadedDisabled?: boolean;
  loadedLabel?: string;

  // NEW: for “API was …” and terminal-local formatting
  lastProductInfoById?: Record<string, LastProductInfo>;
  terminalTimeZone?: string | null;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
    productNameById,
    productButtonCodeById,
    productHexCodeById,
    productInputs,
    setProductApi,
    onOpenTempDial,
    onLoaded,
    loadedDisabled,
    loadedLabel,
    lastProductInfoById,
    terminalTimeZone,
    errorMessage,
  } = props;

  const plannedLines = useMemo(() => {
    return (planRows ?? [])
      .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
      .map((r) => ({
        comp: Number(r.comp_number),
        productId: String(r.productId),
        gallons: Number(r.planned_gallons ?? 0),
      }))
      .filter((x) => Number.isFinite(x.comp) && x.comp > 0 && Number.isFinite(x.gallons) && x.gallons > 0);
  }, [planRows]);

  const productGroups = useMemo(() => {
    const m = new Map<string, { productId: string; gallons: number }>();
    for (const line of plannedLines) {
      const prev = m.get(line.productId);
      if (!prev) m.set(line.productId, { productId: line.productId, gallons: line.gallons });
      else prev.gallons += line.gallons;
    }
    return Array.from(m.values()).sort((a, b) => {
      const an = productNameById.get(a.productId) ?? a.productId;
      const bn = productNameById.get(b.productId) ?? b.productId;
      return String(an).localeCompare(String(bn));
    });
  }, [plannedLines, productNameById]);

  return (
    <FullscreenModal open={open} title="Loading" onClose={onClose}>
      <div style={{ display: "grid", gap: 14 }}>
        {/* A) Compartments */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Planned compartments</div>

          {plannedLines.length === 0 ? (
            <div style={styles.help}>No filled compartments in the plan.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {plannedLines.map((x) => (
                <div
                  key={`${x.comp}-${x.productId}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    Comp {x.comp} — {productNameById.get(x.productId) ?? x.productId}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 800 }}>{Math.round(x.gallons)} gal</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ghost line */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" }} />

        {/* B) Product groups */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Enter API + Temp (per product)</div>

          {errorMessage ? (
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,80,80,0.35)",
                background: "rgba(255,80,80,0.10)",
                padding: "10px 12px",
                color: "rgba(255,210,210,0.95)",
                fontWeight: 850,
                lineHeight: 1.25,
              }}
            >
              {errorMessage}
            </div>
          ) : null}

          {productGroups.length === 0 ? (
            <div style={styles.help}>No products to enter.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {productGroups.map((g) => {
                const name = productNameById.get(g.productId) ?? g.productId;
                const badgeText =
                  (productButtonCodeById?.[g.productId] && String(productButtonCodeById[g.productId]).trim()) ||
                  badgeFromName_(name);
                const badgeHex =
                  (productHexCodeById?.[g.productId] && String(productHexCodeById[g.productId]).trim()) || null;
                const apiVal = productInputs[g.productId]?.api ?? "";
                const tempVal = productInputs[g.productId]?.tempF;

                const lastInfo: LastProductInfo | undefined = lastProductInfoById?.[g.productId];

                return (
                  <div
                    key={g.productId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* Left: badge + name + previous API line */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 16,
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 950,
                          fontSize: 20,
                          letterSpacing: 0.5,
                          color: badgeHex ? badgeHex : "rgba(255,220,92,0.95)",
                          border: badgeHex ? `2px solid ${badgeHex}` : "2px solid rgba(255,220,92,0.75)",
                          background: "rgba(0,0,0,0.22)",
                          flex: "0 0 auto",
                        }}
                        aria-hidden
                      >
                        {badgeText}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 950,
                            fontSize: 18,
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </div>

                        <div style={{ marginTop: 4, color: "rgba(255,255,255,0.70)", fontWeight: 750, fontSize: 13 }}>
                          {fmtLastApiLine_({
                            lastApi: lastInfo?.last_api,
                            lastApiUpdatedAt: lastInfo?.last_api_updated_at,
                            timeZone: terminalTimeZone ?? null,
                          }) ?? "No previous API recorded"}
                        </div>
                      </div>
                    </div>

                    {/* Right: gallons + inputs */}
                    <div style={{ display: "grid", justifyItems: "end", gap: 10, flex: "0 1 auto", minWidth: 0 }}>
                      <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 900 }}>{Math.round(g.gallons)} gal</div>

                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <input
                          value={apiVal}
                          onChange={(e) => setProductApi(g.productId, e.target.value)}
                          inputMode="decimal"
                          placeholder="API"
                          style={{
                            ...styles.input,
                            width: 120,
                            maxWidth: "38vw",
                            height: 44,
                            borderRadius: 16,
                            fontWeight: 950,
                            textAlign: "center",
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => onOpenTempDial(g.productId)}
                          style={{
                            ...styles.smallBtn,
                            width: 120,
                            maxWidth: "38vw",
                            height: 44,
                            borderRadius: 16,
                            fontWeight: 950,
                          }}
                        >
                          {tempVal == null ? "60°F" : `${Math.round(tempVal)}°F`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", width: "100%", marginTop: 10 }}>
            <button
              type="button"
              onClick={onLoaded}
              disabled={Boolean(loadedDisabled)}
              style={{
                ...(styles as any).doneBtn,
                opacity: loadedDisabled ? 0.55 : 1,
                width: "100%",
              }}
            >
              {loadedLabel ?? "LOADED"}
            </button>
          </div>
        </div>
      </div>
    </FullscreenModal>
  );
}
