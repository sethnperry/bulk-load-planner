"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/**
 * PlannerControls (bulletproof)
 * - Pure UI: receives data + setters from parent (page.tsx)
 * - Avoids fragile inline parsing patterns that can trip Turbopack
 */
export default function PlannerControls(props: any) {
  const {
    styles,

    // compartments data
    selectedTrailerId,
    compLoading,
    compartments = [],
    compError,

    // computed helpers + plan state
    headspacePctForComp,
    effectiveMaxGallonsForComp,
    plannedGallonsByComp = {},
    compPlan = {},
    terminalProducts = [],

    // headspace setter (optional)
    setCompHeadspacePct,

    // setters for modal + plan
    setCompModalComp,
    setCompModalOpen,
    setCompPlan,

    // modal state
    compModalOpen,
    compModalComp,

    // plan slots UI (built in page.tsx)
    snapshotSlots,
  } = props;

  const productsById = React.useMemo(() => {
    const map = new Map<string, any>();
    (terminalProducts ?? []).forEach((p: any) => {
      if (p?.product_id != null) map.set(String(p.product_id), p);
    });
    return map;
  }, [terminalProducts]);

  const getProd = (productId: any) => productsById.get(String(productId ?? ""));
  const getBtnCode = (p: any) => {
    const v = (p?.button_code ?? p?.product_code ?? p?.code ?? "PRD").toString().trim();
    return (v || "PRD").toUpperCase();
  };
  const getHex = (p: any) => {
    const raw =
      p?.hex_code ??
      p?.hex ??
      p?.color_hex ??
      p?.products?.hex_code ??
      p?.product?.hex_code ??
      p?.products?.hex ??
      p?.product?.hex;
    const hex = String(raw ?? "").trim();
    if (!hex) return "rgba(255,255,255,0.45)";
    return hex.startsWith("#") ? hex : `#${hex}`;
  };

  // Match the cyan/teal used in the plan slot pills (and keep it consistent everywhere).
  // (Opacity is intentional so it reads like "liquid" on the dark UI.)
  const PLAN_LIQUID = "rgba(89,215,255,0.62)";
  const PLAN_WAVE = "rgba(89,215,255,0.95)";

  const sortedCompartments = React.useMemo(() => {
    const arr = Array.isArray(compartments) ? [...compartments] : [];
    arr.sort((a: any, b: any) => Number(a?.comp_number ?? 0) - Number(b?.comp_number ?? 0));
    // UI shows 3,2,1 left->right like your screenshot (reverse)
    return arr.reverse();
  }, [compartments]);

  function computeFillPct(trueMax: number, planned: number, effMax: number) {
    const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
    const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
    const visualTopGap = 0.08;
    return Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));
  }

  function CompCard({
    comp,
  }: {
    comp: any;
  }) {
    const compNumber = Number(comp?.comp_number ?? comp?.compNumber ?? 0);
    const trueMax = Number(comp?.max_gallons ?? 0);

    const headPct =
      typeof headspacePctForComp === "function" ? Number(headspacePctForComp(compNumber) ?? 0) : 0;

    const effMax =
      typeof effectiveMaxGallonsForComp === "function"
        ? Number(effectiveMaxGallonsForComp(compNumber, trueMax) ?? trueMax)
        : trueMax;

    const planned = Number(plannedGallonsByComp?.[compNumber] ?? 0);
    const fillPct = computeFillPct(trueMax, planned, effMax);

    const sel = compPlan?.[compNumber] ?? {};
    const isEmpty = !!sel?.empty || !sel?.productId;
    const prod = !isEmpty ? getProd(sel?.productId) : null;

    const code = isEmpty ? "MT" : getBtnCode(prod);
    const codeColor = isEmpty ? "rgba(180,220,255,0.92)" : getHex(prod);

    const atMax = headPct <= 0.000001; // max capacity when headspace is 0
    const compNumberColor = atMax ? "rgba(255,170,30,0.95)" : "rgba(255,255,255,0.90)";

    const n = sortedCompartments.length;
    const cardHeight = n >= 5 ? "min(280px, 40vw)" : n >= 4 ? "min(300px, 50vw)" : "min(320px, 55vw)";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 0", minWidth: 0 }}>
        <div
          onClick={() => {
            setCompModalComp?.(compNumber);
            setCompModalOpen?.(true);
          }}
          style={{
            width: "100%",
            maxWidth: 180,
            height: cardHeight,
            borderRadius: 16,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: 12,
            boxSizing: "border-box",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          {/* Comp number */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: -2 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: compNumberColor, lineHeight: 1 }}>{compNumber}</div>
          </div>

          {/* Tank area */}
          <div style={{ flex: "1 1 auto", minHeight: 0, marginTop: 6, display: "flex" }}>
            <div
              style={{
                width: "100%",
                height: "min(170px, 44vw)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.10)",
                marginTop: 6,
              }}
            >
              {/* Headspace tint */}
              {headPct > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                    background: "rgba(255,160,0,0.18)",
                    borderBottom: "1px dashed rgba(255,160,0,0.40)",
                  }}
                />
              )}

              {/* Fill */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${fillPct * 100}%`,
                  background: PLAN_LIQUID,
                }}
              />

              {/* Wave */}
              {fillPct > 0 && (
                <svg
                  width="100%"
                  height="16"
                  viewBox="0 0 100 16"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `calc(${fillPct * 100}% - 8px)`,
                    opacity: 0.9,
                  }}
                >
                  <path
                    d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                    fill="none"
                    stroke={PLAN_WAVE}
                    strokeWidth="2"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Product button pinned to bottom (like terminal cards) */}
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: "min(140px, 86%)",
                height: 44,
                borderRadius: 14,
                // no product-colored border here; color is carried by text only (cleaner like terminal cards)
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.42)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                letterSpacing: 0.5,
                color: codeColor,
              }}
            >
              {code}
            </div>
          </div>
        </div>

        {/* Planned gallons (outside / under the card) */}
        <div style={{ marginTop: 8, fontSize: 18, color: "rgba(220,220,220,0.85)" }}>
          {planned > 0 ? Math.round(planned).toString() : ""}
        </div>
      </div>
    );
  }

  function CompModalBody({ compNumber }: { compNumber: number }) {
    const c = (Array.isArray(compartments) ? compartments : []).find((x: any) => Number(x?.comp_number ?? 0) === compNumber);
    const trueMax = Number(c?.max_gallons ?? 0);

    const headPct =
      typeof headspacePctForComp === "function" ? Number(headspacePctForComp(compNumber) ?? 0) : 0;

    const effMax =
      typeof effectiveMaxGallonsForComp === "function"
        ? Number(effectiveMaxGallonsForComp(compNumber, trueMax) ?? trueMax)
        : trueMax;

    const planned = Number(plannedGallonsByComp?.[compNumber] ?? 0);
    const fillPct = computeFillPct(trueMax, planned, effMax);

    const sel = compPlan?.[compNumber] ?? {};
    const isEmpty = !!sel?.empty || !sel?.productId;

    const headPctDisplay = Math.round(headPct * 100);

    const close = () => {
      setCompModalOpen?.(false);
      setCompModalComp?.(null);
    };

    const setHeadPct = (pct: number) => {
      const p = Math.max(0, Math.min(0.95, pct));
      setCompHeadspacePct?.((prev: any) => ({ ...(prev ?? {}), [compNumber]: p }));
    };

    const setProduct = (productId: any) => {
      setCompPlan?.((prev: any) => ({
        ...(prev ?? {}),
        [compNumber]: { empty: false, productId },
      }));
      close();
    };

    const setEmpty = () => {
      setCompPlan?.((prev: any) => ({
        ...(prev ?? {}),
        [compNumber]: { empty: true, productId: "" },
      }));
      close();
    };

    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ fontSize: 14, opacity: 0.82, lineHeight: 1.35 }}>
          Adjust headspace to stay safely below the top probe and set the product for compartment {compNumber}.
        </div>

        {/* Tank + slider side-by-side; constrained width so it never overflows */}
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 84px",
            gap: 12,
            alignItems: "start",
          }}
        >
          {/* Tank card */}
          <div
            style={{
              minWidth: 0,
              borderRadius: 18,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Max Volume</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{Math.round(trueMax)} gal</div>
            </div>

            <div
              style={{
                marginTop: 10,
                height: "min(240px, 52vw)",
                borderRadius: 16,
                background: "rgba(255,255,255,0.08)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Headspace tint */}
              {headPct > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                    background: "rgba(255,160,0,0.18)",
                    borderBottom: "1px dashed rgba(255,160,0,0.4)",
                  }}
                />
              )}
              {/* Fill */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${fillPct * 100}%`,
                  background: PLAN_LIQUID,
                }}
              />
              {/* Wave */}
              {fillPct > 0 && (
                <svg
                  width="100%"
                  height="16"
                  viewBox="0 0 100 16"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `calc(${fillPct * 100}% - 8px)`,
                    opacity: 0.9,
                  }}
                >
                  <path
                    d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                    fill="none"
                    stroke={PLAN_WAVE}
                    strokeWidth="2"
                  />
                </svg>
              )}
              {/* headspace label */}
              {headPct > 0.04 && (
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    color: "rgba(255,160,0,0.85)",
                    pointerEvents: "none",
                  }}
                >
                  {headPctDisplay}%
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>Capped at</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                value={Math.round(effMax)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || trueMax <= 0) return;
                  const capped = Math.max(0, Math.min(trueMax, v));
                  setHeadPct(1 - capped / trueMax);
                }}
                style={{
                  ...(styles?.input ?? {}),
                  flex: 1,
                  minWidth: 0,
                  height: 46,
                  borderRadius: 12,
                }}
              />
              <button
                style={{
                  ...(styles?.smallBtn ?? {}),
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 12,
                }}
                onClick={() => setHeadPct(0)}
              >
                Return to max
              </button>
            </div>
          </div>

          {/* Vertical slider (kept in same grid col so it never drops below) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.82 }}>Headspace</div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={headPctDisplay}
              onChange={(e) => setHeadPct(Number(e.target.value) / 100)}
              style={{
                height: 220,
                width: 34,
                writingMode: "bt-lr" as any,
                WebkitAppearance: "slider-vertical" as any,
                accentColor: "#59d7ff",
                cursor: "pointer",
              }}
            />
            <div style={{ ...(styles?.badge ?? {}), minWidth: 48, textAlign: "center", borderRadius: 999 }}>
              {headPctDisplay}%
            </div>
          </div>
        </div>

        {/* MT / Empty */}
        <button
          style={{
            textAlign: "left",
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            background: isEmpty ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
          }}
          onClick={setEmpty}
        >
          <div style={{ fontWeight: 800 }}>MT (Empty)</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
        </button>

        {/* Product list (button style like terminal cards; colored border/text from hex_code) */}
        <div style={{ display: "grid", gap: 10 }}>
          {(terminalProducts ?? []).map((p: any) => {
            const selected = !isEmpty && sel?.productId === p.product_id;
            const name = (p.product_name ?? p.display_name ?? p.product_code ?? "Product").toString();
            const sub = (p.description ?? "").toString();
            const btnCode = getBtnCode(p);
            const hex = getHex(p);

            return (
              <button
                key={String(p.product_id)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
                onClick={() => setProduct(p.product_id)}
                title={name}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 54,
                      height: 44,
                      borderRadius: 12,
                      border: `1.25px solid ${hex}`,
                      background: "rgba(0,0,0,0.40)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      letterSpacing: 0.5,
                      color: hex,
                      flex: "0 0 auto",
                    }}
                  >
                    {btnCode}
                  </div>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.25 }}>{sub || "\u00A0"}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const modalCompNumber = compModalComp != null ? Number(compModalComp) : null;

  return (
    <section style={{ ...(styles?.section ?? {}), border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles?.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles?.error}>Error loading compartments: {String(compError)}</div>}

      {/* Plan slots (centered above compartments) */}
      {snapshotSlots ? <div style={{ marginTop: 8, marginBottom: 10 }}>{snapshotSlots}</div> : null}

      {/* Driver compartment strip (primary interface) */}
      {selectedTrailerId && !compLoading && !compError && sortedCompartments.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: sortedCompartments.length >= 5 ? 6 : 10,
              flexWrap: "nowrap",
              width: "100%",
            }}
          >
            {sortedCompartments.map((c: any) => (
              <CompCard key={String(c?.id ?? c?.comp_number ?? Math.random())} comp={c} />
            ))}
          </div>
        </div>
      ) : null}

      {selectedTrailerId && !compLoading && !compError && sortedCompartments.length === 0 ? (
        <div style={styles?.help}>No compartments found for this trailer.</div>
      ) : null}

      <FullscreenModal
        open={!!compModalOpen}
        title={modalCompNumber != null ? `Compartment ${modalCompNumber}` : "Compartment"}
        onClose={() => {
          setCompModalOpen?.(false);
          setCompModalComp?.(null);
        }}
      >
        {modalCompNumber != null ? <CompModalBody compNumber={modalCompNumber} /> : null}
      </FullscreenModal>
    </section>
  );
}
