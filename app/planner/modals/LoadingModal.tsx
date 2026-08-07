"use client";

import React, { useMemo, useEffect } from "react";
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

function fmtUpdatedOnLine(args: { updatedAt?: string | null; timeZone?: string | null }): string | null {
  const ts = args.updatedAt;
  if (!ts) return null;

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const tz = args.timeZone || "UTC";

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

  if (mm && dd && hh && mi) return `Updated on ${mm}/${dd} at ${hh}:${mi} hrs`;
  return null;
}

function fmtLastApiLine_(args: {
  lastApi?: number | null;
  lastApiUpdatedAt?: string | null;
  timeZone?: string | null;
}): string | null {
  const api = args.lastApi;
  const ts = args.lastApiUpdatedAt;
  const tz = args.timeZone;

  if (api == null || !Number.isFinite(Number(api))) return null;

  // If we have an API but no timestamp, still show something.
  if (!ts) return `API was ${api}`;

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return `API was ${api}`;

  // MM/DD @ HH:mm (24h) in terminal timezone (if provided)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? undefined,
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

function isApiStale(lastApiUpdatedAt?: string | null, thresholdDays = 7): boolean {
  if (!lastApiUpdatedAt) return false; // no timestamp = unknown, don't warn
  const d = new Date(lastApiUpdatedAt);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) > thresholdDays * 24 * 60 * 60 * 1000;
}

export default function LoadingModal(props: {
  open: boolean;
  onClose: () => void;

  styles: any;

  planRows: PlanRowLike[];
  productNameById: Map<string, string>;

  // Optional: product styling overrides from catalog
  productHexCodeById?: Record<string, string>;

  productInputs: ProductInputs;
  setProductApi: (productId: string, api: string) => void;
  setProductTemp: (productId: string, tempF: number) => void;

  onOpenTempDial?: (productId: string) => void;
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
    productHexCodeById,
    productInputs,
    setProductApi,
    setProductTemp,
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

useEffect(() => {
  if (!open) return;

  for (const g of productGroups) {
    const pid = String(g.productId ?? "");
    if (!pid) continue;

    const last = lastProductInfoById?.[pid]?.last_api;
    const current = (productInputs?.[pid]?.api ?? "").toString().trim();

    // Only prefill if empty and we actually have a previous API
    if (!current && last != null && Number.isFinite(Number(last))) {
      setProductApi(pid, String(last));
    }
  }
}, [open, productGroups, lastProductInfoById, productInputs, setProductApi]);

  return (
    <FullscreenModal open={open} title="Loading" onClose={onClose} footer={null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* A) Compartments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>Planned compartments</div>

          {plannedLines.length === 0 ? (
            <div style={styles.help}>No filled compartments in the plan.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {plannedLines.map((x) => {
                const dotColor = (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
                return (
                  <div
                    key={`${x.comp}-${x.productId}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        C{x.comp} — {productNameById.get(x.productId) ?? x.productId}
                      </span>
                    </div>
                    <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                      {Math.round(x.gallons)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ghost line */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" }} />

        {/* B) Product groups */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>API + Temperature</div>

          {errorMessage ? (
            <div
              style={{
                borderRadius: 6,
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
                const dotColor = (productHexCodeById?.[g.productId] && String(productHexCodeById[g.productId]).trim()) || "rgba(255,255,255,0.5)";
                const apiVal = productInputs[g.productId]?.api ?? "";
                const tempVal = productInputs[g.productId]?.tempF;

                const lastInfo: LastProductInfo | undefined = lastProductInfoById?.[g.productId];
                const apiLine = fmtLastApiLine_({
                  lastApi: lastInfo?.last_api,
                  lastApiUpdatedAt: lastInfo?.last_api_updated_at,
                  timeZone: terminalTimeZone ?? null,
                });
                const stale = isApiStale(lastInfo?.last_api_updated_at, 7);
                const missing = lastInfo?.last_api == null || !Number.isFinite(Number(lastInfo?.last_api));
                const warn = stale || missing;

                return (
                  <div
                    key={g.productId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Top row: dot + name + gallons */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {name}
                      </span>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{Math.round(g.gallons)}</div>
                    </div>

                    {/* API status -- a quiet line when fresh, a bold highlighted
                        chip when stale/missing so a driver glancing quickly
                        can't miss it. */}
                    {warn ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px", borderRadius: 6,
                        background: missing ? "rgba(248,113,113,0.14)" : "rgba(251,146,60,0.16)",
                        border: `1px solid ${missing ? "rgba(248,113,113,0.40)" : "rgba(251,146,60,0.45)"}`,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: missing ? "#f87171" : "#fb923c", lineHeight: 1.3 }}>
                          ⚠ {missing ? "No API recorded — enter manually" : `${apiLine} — may be stale`}
                        </span>
                      </div>
                    ) : apiLine ? (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{apiLine}</div>
                    ) : null}

                    {/* Stacked inputs — uncontrolled while typing, normalized on blur */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* API */}
                      <div style={{ position: "relative" }}>
                        <input
                          key={`api-${g.productId}-${open ? "open" : "closed"}`}
                          defaultValue={apiVal}
                          onChange={(e) => {
                            let v = e.target.value.replace(/[^0-9.]/g, "");
                            const parts = v.split(".");
                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                            e.target.value = v;
                          }}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const n = parseFloat(e.target.value);
                            if (Number.isFinite(n)) setProductApi(g.productId, n.toFixed(1));
                            else setProductApi(g.productId, apiVal);
                          }}
                          inputMode="decimal"
                          placeholder="37.9"
                          style={{ ...styles.input, width: "100%", height: 48, borderRadius: 6, fontWeight: 800, fontSize: 18, textAlign: "center", boxSizing: "border-box" as const }}
                        />
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}>API</span>
                      </div>
                      {/* Temp */}
                      <div style={{ position: "relative" }}>
                        <input
                          key={`temp-${g.productId}-${open ? "open" : "closed"}`}
                          defaultValue={tempVal == null ? "" : tempVal.toFixed(1)}
                          onChange={(e) => {
                            let v = e.target.value.replace(/[^0-9.]/g, "");
                            const parts = v.split(".");
                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                            e.target.value = v;
                          }}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const n = parseFloat(e.target.value);
                            if (Number.isFinite(n)) setProductTemp(g.productId, parseFloat(n.toFixed(1)));
                          }}
                          inputMode="decimal"
                          placeholder="79.0"
                          style={{ ...styles.input, width: "100%", height: 48, borderRadius: 6, fontWeight: 800, fontSize: 18, textAlign: "center", boxSizing: "border-box" as const }}
                        />
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", pointerEvents: "none" }}>TEMP</span>
                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.30)", pointerEvents: "none" }}>°F</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", width: "100%", marginTop: 6 }}>
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
