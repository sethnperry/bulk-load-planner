"use client";

import React, { useMemo, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

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

function isApiStale(lastApiUpdatedAt?: string | null, thresholdDays = 7): boolean {
  if (!lastApiUpdatedAt) return false; // no timestamp = unknown, don't warn
  const d = new Date(lastApiUpdatedAt);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) > thresholdDays * 24 * 60 * 60 * 1000;
}

// Structured, "print-out" API-history line -- replaces the old single
// pre-formatted string (fmtLastApiLine_) so the date/time portion can be
// rendered bold/white while the rest of the line stays quiet, per explicit
// direction ("the warning... should be bigger with the date/time part in
// white and bold"). The live numeric API value itself is no longer restated
// here -- it's already shown directly in the compartment row now (see the
// compartment-row redesign below), so this line is purely about freshness.
type ApiLineParts = {
  state: "missing" | "stale" | "fresh";
  leading: string;
  dateTime: string | null; // bolded/white when present
  trailing: string;
};

function apiLineParts(args: {
  lastApi?: number | null;
  lastApiUpdatedAt?: string | null;
  timeZone?: string | null;
}): ApiLineParts {
  const api = args.lastApi;
  const ts = args.lastApiUpdatedAt;
  const tz = args.timeZone;

  if (api == null || !Number.isFinite(Number(api))) {
    return { state: "missing", leading: "No API on file", dateTime: null, trailing: "" };
  }
  if (!ts) return { state: "fresh", leading: "API on file", dateTime: null, trailing: "" };

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { state: "fresh", leading: "API on file", dateTime: null, trailing: "" };

  // MM/DD @ HH:mm (24h) in terminal timezone (if provided)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? undefined,
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month"), dd = get("day"), hh = get("hour"), mi = get("minute");
  const dateTime = mm && dd && hh && mi ? `${mm}/${dd} @ ${hh}:${mi} hrs` : null;

  const stale = isApiStale(ts, 7);
  return {
    state: stale ? "stale" : "fresh",
    leading: "API last updated ",
    dateTime,
    trailing: stale ? " — may be stale" : "",
  };
}

const API_LINE_COLOR: Record<ApiLineParts["state"], string> = {
  missing: "#f87171",
  stale: "#fb923c",
  fresh: "rgba(255,255,255,0.45)",
};

function fmtSignedLbs(v: number): string {
  const rounded = Math.round(v);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export default function LoadingModal(props: {
  open: boolean;
  onClose: () => void;

  styles: any;

  // Reflects any Phase-1 gallons overrides already applied -- this modal is
  // a pure "Plan Review" phase now, so what's shown here IS the plan that
  // begin_load already snapshotted, adjusted live by whatever's been tapped
  // in this session.
  planRows: PlanRowLike[];
  productNameById: Map<string, string>;

  // Optional: product styling overrides from catalog
  productHexCodeById?: Record<string, string>;
  // Short button-code per product ("D2"/"93"/"87") -- compartment rows show
  // this instead of the full product name now (see part 2 of the 2026-09-05
  // redesign: "C1-D2, C2-93, C3-87" next to the colored dot).
  productCodeById?: Record<string, string>;

  productInputs: ProductInputs;
  setProductApi: (productId: string, api: string) => void;
  setProductTemp: (productId: string, tempF: number) => void;

  // Commits an isolated Phase-1 gallons override for one compartment --
  // never redistributes to siblings (see CLAUDE.md / plan doc: this is
  // deliberately NOT the compartment-cap-slider's binary-search reallocation).
  onSetCompartmentGallons: (comp: number, gallons: number) => void;
  // The compartment's real configured ceiling (same bound the cap-slider's
  // own blown-up entry uses) -- null/undefined means no cap is known, in
  // which case the override is left unbounded.
  persistedCapForComp?: (comp: number) => number | null;

  // Live weight preview -- same math complete_load will actually submit
  // (computeActualLbsForLine), so this can never disagree with the recap.
  livePreviewGrossLbs?: number | null;
  livePreviewDiffLbs?: number | null;
  targetWeight?: number;

  onOpenTempDial?: (productId: string) => void;
  // Fired by the bottom button (and, via FullscreenModal's onClose, by
  // backdrop-click/Escape too -- see page.tsx). No longer submits directly;
  // opens a 3-way confirmation (Log the Load / Update Card Only / Keep
  // Editing) so there's a single, deliberate exit point instead of a
  // silent header Close button plus a separate submit button.
  onLoaded: () => void;

  // A direct, always-visible way out -- per explicit user direction ("we
  // always want a way out regardless of the screen"), not buried behind
  // tapping Complete first to reach CancelLoadSheet's own Back to Planner
  // row (that path still exists too, via backdrop-click/Escape/Complete).
  // Genuinely undoes the load + re-card, same as CancelLoadSheet's own
  // button -- see handleBackToPlannerNoUpdate in page.tsx.
  onBackToPlanner: () => void;

  loadedDisabled?: boolean;
  loadedLabel?: string;

  // NEW: for “API was …” and terminal-local formatting
  lastProductInfoById?: Record<string, LastProductInfo>;
  terminalTimeZone?: string | null;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;

  // Safety-confirmation block -- equipment/location identification shown
  // before a driver commits to a load. Previously absent from this modal
  // entirely (confirmed by reading the whole file before this was added --
  // no truck/trailer/terminal identification appeared anywhere), a real
  // gap flagged in the icon-rail design conversation: "we should add
  // details in the loading modal for equipment numbers, location just to
  // give a visual confirmation before logging a load after forgetting to
  // change locations or equipment." Both optional/plain strings -- page.tsx
  // already holds them for its own icon row (equipment.equipmentLabel,
  // the top-level terminalLabel), passed straight through, no new fetch.
  equipmentLabel?: string | null;
  terminalLabel?: string | null;
  // Tapping the terminal name in the safety-confirmation row opens the
  // shared location/terminal picker without leaving this modal -- see
  // page.tsx's handleTapTerminalInLoadingModal for the mid-load switch
  // flow this kicks off. Optional so this modal degrades gracefully
  // (plain, non-interactive text) if a future caller doesn't wire it.
  onTapTerminal?: () => void;
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
    productNameById,
    productHexCodeById,
    productCodeById,
    productInputs,
    setProductApi,
    setProductTemp,
    onSetCompartmentGallons,
    persistedCapForComp,
    livePreviewGrossLbs,
    livePreviewDiffLbs,
    targetWeight,
    onOpenTempDial,
    onLoaded,
    onBackToPlanner,
    loadedDisabled,
    loadedLabel,
    lastProductInfoById,
    terminalTimeZone,
    errorMessage,
    equipmentLabel,
    terminalLabel,
    onTapTerminal,
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

  // ── Phase-1 tap-to-adjust overlays ──────────────────────────────────────
  const [gallonsTarget, setGallonsTarget] = useState<{ comp: number; productId: string } | null>(null);
  const [gallonsInput, setGallonsInput] = useState("");
  const gallonsCap = gallonsTarget ? persistedCapForComp?.(gallonsTarget.comp) ?? null : null;

  const [apiTempTarget, setApiTempTarget] = useState<string | null>(null); // productId
  const [apiInput, setApiInput] = useState("");
  const [tempInput, setTempInput] = useState("");

  function openGallonsOverlay(comp: number, productId: string, currentGallons: number) {
    setGallonsTarget({ comp, productId });
    setGallonsInput(String(Math.round(currentGallons)));
  }
  function commitGallonsOverlay() {
    if (!gallonsTarget) return;
    const n = parseInt(gallonsInput, 10);
    if (Number.isFinite(n)) {
      const clamped = gallonsCap != null ? Math.max(0, Math.min(gallonsCap, n)) : Math.max(0, n);
      onSetCompartmentGallons(gallonsTarget.comp, clamped);
    }
    setGallonsTarget(null);
  }

  function openApiTempOverlay(productId: string, currentApi: string, currentTemp?: number) {
    setApiTempTarget(productId);
    setApiInput(currentApi ?? "");
    setTempInput(currentTemp == null ? "" : currentTemp.toFixed(1));
  }
  function commitApiTempOverlay() {
    if (!apiTempTarget) return;
    const apiN = parseFloat(apiInput);
    if (Number.isFinite(apiN)) setProductApi(apiTempTarget, apiN.toFixed(1));
    const tempN = parseFloat(tempInput);
    if (Number.isFinite(tempN)) setProductTemp(apiTempTarget, parseFloat(tempN.toFixed(1)));
    setApiTempTarget(null);
  }

  const showLivePreview = livePreviewGrossLbs != null;
  const overTarget = livePreviewDiffLbs != null && livePreviewDiffLbs > 0;

  const totalPlannedGallons = useMemo(
    () => plannedLines.reduce((sum, x) => sum + x.gallons, 0),
    [plannedLines]
  );

  return (
    <FullscreenModal open={open} title="Plan Review" onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* Safety-confirmation block -- Terminal left (white/bold, tappable
            when onTapTerminal is wired -- opens the shared location/
            terminal picker without leaving this modal, see page.tsx's
            handleTapTerminalInLoadingModal), Equipment right (unchanged
            muted tone). Swapped order + bigger font per explicit direction
            ("shift Terminal to the left and Equipment to the right,
            increase the font size, switch the terminal text only to
            white"). */}
        {(equipmentLabel || terminalLabel) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {terminalLabel && (
              onTapTerminal ? (
                <button
                  type="button"
                  onClick={onTapTerminal}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0,
                    cursor: "pointer", minWidth: 0, fontSize: 15, fontWeight: 800, color: "#fff",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 700, flexShrink: 0 }}>›</span>
                </button>
              ) : (
                <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
              )
            )}
            {equipmentLabel && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, textAlign: "right" as const, flexShrink: 0 }}>
                {equipmentLabel}
              </span>
            )}
          </div>
        )}

        {/* A) Compartments -- redesigned per explicit direction: product
            names dropped in favor of just the short code next to the dot
            ("C1-D2, C2-93, C3-87"), which frees up room to bring API/Temp
            inline with gallons on the same row instead of a second,
            separate section below. Each value is its own tap target now
            (not the whole row) -- gallons opens the per-compartment
            gallons overlay (unchanged, siblings never move); API/Temp both
            open the per-PRODUCT API+Temp overlay (unchanged data model --
            two compartments carrying the same product still correctly
            show/edit the same shared value, just from either row). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>Planned compartments</div>

          {plannedLines.length === 0 ? (
            <div style={styles.help}>No filled compartments in the plan.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {plannedLines.map((x) => {
                const dotColor = (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
                const code = (productCodeById?.[x.productId] && String(productCodeById[x.productId]).trim()) || (productNameById.get(x.productId) ?? x.productId);
                const apiVal = productInputs[x.productId]?.api ?? "";
                const tempVal = productInputs[x.productId]?.tempF;
                return (
                  <div
                    key={`${x.comp}-${x.productId}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "9px 10px", borderRadius: 10,
                      border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        C{x.comp}-{code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGallonsOverlay(x.comp, x.productId, x.gallons)}
                      style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", textAlign: "center" as const, flexShrink: 0 }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>GAL</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{Math.round(x.gallons)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openApiTempOverlay(x.productId, apiVal, tempVal)}
                      style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", textAlign: "center" as const, flexShrink: 0 }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>API</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: apiVal ? "#fff" : "rgba(255,255,255,0.30)" }}>{apiVal || "—"}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openApiTempOverlay(x.productId, apiVal, tempVal)}
                      style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", textAlign: "center" as const, flexShrink: 0 }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>°F</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: tempVal != null ? "#fff" : "rgba(255,255,255,0.30)" }}>{tempVal != null ? tempVal.toFixed(1) : "—"}</div>
                    </button>
                  </div>
                );
              })}

              {/* Total -- deliberately transparent (no card fill/border)
                  so it reads as a plain summary line, not another
                  compartment. */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>{Math.round(totalPlannedGallons)} gal</span>
              </div>
            </div>
          )}
        </div>

        {/* Ghost line */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" }} />

        {/* B) API history -- per explicit direction, no longer its own
            card-list section (API/Temp itself moved inline into the
            compartment rows above); this is now just a quiet "print-out"
            of when each product's API was last observed, one line per
            product, no card/background. The date/time portion is bolded
            white so it's the one thing that stands out on an otherwise
            plain line. */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>API History</div>

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
            <div style={{ display: "grid", gap: 6 }}>
              {productGroups.map((g) => {
                const code = (productCodeById?.[g.productId] && String(productCodeById[g.productId]).trim()) || (productNameById.get(g.productId) ?? g.productId);
                const lastInfo: LastProductInfo | undefined = lastProductInfoById?.[g.productId];
                const parts = apiLineParts({
                  lastApi: lastInfo?.last_api,
                  lastApiUpdatedAt: lastInfo?.last_api_updated_at,
                  timeZone: terminalTimeZone ?? null,
                });
                return (
                  <div key={g.productId} style={{ fontSize: 14, lineHeight: 1.5, color: API_LINE_COLOR[parts.state] }}>
                    {parts.state === "missing" && "⚠ "}
                    <span style={{ fontWeight: 700 }}>{code}:</span>{" "}
                    {parts.leading}
                    {parts.dateTime && <span style={{ color: "#fff", fontWeight: 800 }}>{parts.dateTime}</span>}
                    {parts.trailing}
                  </div>
                );
              })}
            </div>
          )}

          {/* C) Live weight / diff-vs-target preview -- same math the final
              submission uses, so this can never disagree with the recap. */}
          {showLivePreview && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Live Weight</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{Math.round(livePreviewGrossLbs!).toLocaleString()} lbs</div>
              </div>
              {livePreviewDiffLbs != null && (
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>vs. Target</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: overTarget ? "#f87171" : "#4ade80" }}>
                    {fmtSignedLbs(livePreviewDiffLbs)} lbs
                  </div>
                </div>
              )}
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
              {loadedLabel ?? "Complete"}
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToPlanner}
            style={{
              width: "100%", padding: "10px 0",
              borderRadius: 6, border: "none", background: "transparent",
              color: "rgba(255,255,255,0.40)", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Back to Planner
          </button>
        </div>
      </div>

      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `C${gallonsTarget.comp} Gallons` : "Gallons"}
        fields={[{ key: "gallons", label: "Gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Max ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

      <ValueEntryOverlay
        open={apiTempTarget != null}
        title={apiTempTarget ? productNameById.get(apiTempTarget) ?? "Product" : "Product"}
        fields={[
          { key: "api", label: "API", value: apiInput, onChange: setApiInput, decimal: true },
          { key: "temp", label: "Temp", value: tempInput, onChange: setTempInput, suffix: "°F", decimal: true },
        ]}
        onCancel={() => setApiTempTarget(null)}
        onSubmit={commitApiTempOverlay}
      />
    </FullscreenModal>
  );
}
