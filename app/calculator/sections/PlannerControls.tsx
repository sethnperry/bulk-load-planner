"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/**
 * PlannerControls
 * - Owns NO state.
 * - Receives everything via props from page.tsx
 * - Only compartment strip cards are customized per your spec.
 * - Modal structure/layout preserved; only modal fluid color set to match teal.
 */
export default function PlannerControls(props: any) {
  const {
    styles,

    // compartments data
    selectedTrailerId,
    compLoading,
    compartments,
    compError,

    // computed helpers + plan state
    headspacePctForComp,
    effectiveMaxGallonsForComp,
    plannedGallonsByComp,
    compPlan,
    terminalProducts,

    // setters for modal + plan
    setCompModalComp,
    setCompModalOpen,
    setCompPlan,
    setCompHeadspacePct,

    // modal state
    compModalOpen,
    compModalComp,

    // plan slots UI (built in page.tsx)
    snapshotSlots,
  } = props;

  // ---- Helpers (must exist; used across strip + modal) ----

  const getProd = (productId: any) => {
    const pid = String(productId ?? "").trim();
    if (!pid) return null;

    const list = Array.isArray(terminalProducts) ? terminalProducts : [];

    return (
      list.find((p: any) => String(p?.product_id ?? "") === pid) ??
      list.find((p: any) => String(p?.id ?? "") === pid) ??
      list.find((p: any) => String(p?.products?.id ?? "") === pid) ??
      list.find((p: any) => String(p?.product?.id ?? "") === pid) ??
      null
    );
  };

  const getBtnCode = (p: any) => {
    const raw = (
      p?.button_code ??
      p?.product_code ??
      p?.code ??
      p?.products?.button_code ??
      p?.products?.product_code ??
      p?.product?.button_code ??
      ""
    )
      .toString()
      .trim();
    return raw ? raw.toUpperCase() : "PRD";
  };

  const getHex = (p: any) => {
    const raw = (
      p?.hex_code ??
      p?.color ??
      p?.products?.hex_code ??
      p?.products?.color ??
      p?.product?.hex_code ??
      p?.product?.color ??
      ""
    )
      .toString()
      .trim();
    return raw ? raw : "rgba(255,255,255,0.88)";
  };

  const getName = (p: any) =>
    (
      p?.product_name ??
      p?.display_name ??
      p?.name ??
      p?.products?.product_name ??
      p?.products?.display_name ??
      p?.product?.product_name ??
      p?.product?.display_name ??
      ""
    )
      .toString()
      .trim() || "Product";

  const getSub = (p: any) =>
    (p?.description ?? p?.products?.description ?? p?.product?.description ?? "").toString().trim();

  // ---- Compartment strip cards (ONLY UI we modify) ----

  const renderCompStrip = () => {
    const list = Array.isArray(compartments) ? compartments : [];
    const n = list.length;

    const h = n >= 5 ? "min(280px, 40vw)" : n >= 4 ? "min(300px, 50vw)" : "min(320px, 55vw)";

    const ordered = [...list]
      .slice()
      .sort((a: any, b: any) => Number(a?.comp_number ?? a?.compNumber ?? 0) - Number(b?.comp_number ?? b?.compNumber ?? 0))
      .reverse();

    // Must match plan-slot teal (no light cyan)
    const fluidFill = "rgba(45, 212, 191, 0.84)";
    const fluidWave = "rgba(45, 212, 191, 0.95)";

    // Headspace tint (so it shows in main planner too)
    const headTint = "rgba(245, 158, 11, 0.20)";
    const headLine = "rgba(245, 158, 11, 0.55)";

    return ordered.map((c: any) => {
      const compNumber = Number(c?.comp_number ?? c?.compNumber ?? 0);
      const trueMax = Number(c?.max_gallons ?? 0);

      const headPctRaw = Number(headspacePctForComp?.(compNumber) ?? 0);
      const headPct = Math.max(0, Math.min(0.95, Number.isFinite(headPctRaw) ? headPctRaw : 0));

      const effMax = Number(effectiveMaxGallonsForComp?.(compNumber, trueMax) ?? trueMax);
      const planned = Number(plannedGallonsByComp?.[compNumber] ?? 0);

      const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
      const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;

      // visual breathing room at the very top so level doesn't "kiss" border
      const visualTopGap = 0.06;
      const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

      const sel = compPlan?.[compNumber];
      const isEmpty = !!sel?.empty || !sel?.productId;

      const prod = !isEmpty ? getProd(sel?.productId) : null;
      const code = isEmpty ? "MT" : getBtnCode(prod);

      const atMax = headPct <= 0.000001;

      const codeColor = isEmpty ? "rgba(180, 220, 255, 0.92)" : getHex(prod);
      const compNumColor = atMax ? "#fbbf24" : "rgba(255,255,255,0.92)";

      // Badge is a full-width bottom tab.
      const badgeH = 74;
      const badgeBg = "rgba(0,0,0,0.78)";

      // IMPORTANT:
      // The fluid/headspace region is only the area ABOVE the badge.
      // So all level math must be applied to (100% - badgeH) — same behavior as modal.
      const vars: React.CSSProperties = {
        // CSS variables for calc math
        ["--fillPct" as any]: String(fillPct),
        ["--headPct" as any]: String(headPct),
      };

      return (
        <div
          key={String(c?.id ?? compNumber)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flex: "1 1 0",
            minWidth: 0,
          }}
        >
          <div
            onClick={() => {
              setCompModalComp?.(String(compNumber));
              setCompModalOpen?.(true);
            }}
            style={{
              width: "100%",
              maxWidth: 180,
              height: h,
              borderRadius: 10,
              background: "rgba(0,0,0,0.32)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {/* Comp number: smaller, tight to top; orange only at max capacity */}
            <div
              style={{
                paddingTop: 2,
                paddingBottom: 4,
                textAlign: "center",
                fontSize: "clamp(12px, 1.8vw, 14px)",
                fontWeight: 900,
                color: compNumColor,
                lineHeight: 1,
              }}
            >
              {c?.comp_number ?? c?.compNumber ?? compNumber}
            </div>

            {/* Fluid area (no inner capsule). Badge is OVERLAID at bottom; levels computed ABOVE badge. */}
            <div
              style={{
                ...vars,
                flex: "1 1 auto",
                minHeight: 0,
                position: "relative",
                overflow: "hidden",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              {/* Headspace (applies only to area above badge) */}
              {headPct > 0 && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 0,
                      height: `calc((100% - ${badgeH}px) * var(--headPct))`,
                      background: headTint,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `calc((100% - ${badgeH}px) * var(--headPct))`,
                      borderTop: `1px dashed ${headLine}`,
                      pointerEvents: "none",
                    }}
                  />
                </>
              )}

              {/* Fill: height computed against area above badge, bottom anchored to badge top */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: badgeH,
                  height: `calc((100% - ${badgeH}px) * var(--fillPct))`,
                  background: fluidFill,
                  borderRadius: "0 0 8px 8px",
                }}
              />

              {/* Surface highlight + wave positioned at true fluid top (like modal) */}
              {fillPct > 0 && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: 6,
                      bottom: `calc(${badgeH}px + (100% - ${badgeH}px) * var(--fillPct) - 3px)`,
                      background: "linear-gradient(to bottom, rgba(0,0,0,0.22), rgba(0,0,0,0))",
                      pointerEvents: "none",
                    }}
                  />
                  <svg
                    width="100%"
                    height="14"
                    viewBox="0 0 100 14"
                    preserveAspectRatio="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: `calc(${badgeH}px + (100% - ${badgeH}px) * var(--fillPct) - 7px)`,
                      opacity: 0.95,
                      pointerEvents: "none",
                    }}
                  >
                    {/* under-stroke (contrast) */}
                    <path
                      d="M0,7 C10,4 20,10 30,7 C40,4 50,10 60,7 C70,4 80,10 90,7 C95,6 98,6 100,7"
                      fill="none"
                      stroke="rgba(0,0,0,0.35)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    {/* teal stroke */}
                    <path
                      d="M0,7 C10,4 20,10 30,7 C40,4 50,10 60,7 C70,4 80,10 90,7 C95,6 98,6 100,7"
                      fill="none"
                      stroke={fluidWave}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}

              {/* Bottom Badge: full width tab */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: badgeH,
                  background: badgeBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(18px, 3.6vw, 26px)",
                    fontWeight: 900,
                    letterSpacing: 0.6,
                    color: codeColor,
                    lineHeight: 1,
                  }}
                >
                  {code}
                </div>
              </div>
            </div>
          </div>

          {/* Planned gallons (outside, under the card) */}
          <div style={{ marginTop: 10, fontSize: 28, color: "rgba(220,220,220,0.85)" }}>
            {planned > 0 ? Math.round(planned).toString() : ""}
          </div>
        </div>
      );
    });
  };

  // ---- Modal (structure/layout preserved; only fluid color set to teal) ----

  const renderCompModal = () => {
    const compNumber = Number(compModalComp);
    if (!Number.isFinite(compNumber)) {
      return <div style={{ ...(styles?.help ?? {}) }}>Select a compartment.</div>;
    }

    const list = Array.isArray(compartments) ? compartments : [];
    const c = list.find((x: any) => Number(x?.comp_number ?? x?.compNumber ?? 0) === compNumber);
    const trueMax = Number(c?.max_gallons ?? 0);

    const headPctRaw = Number(headspacePctForComp?.(compNumber) ?? 0);
    const headPct = Math.max(0, Math.min(0.95, Number.isFinite(headPctRaw) ? headPctRaw : 0));

    const effMax = Number(effectiveMaxGallonsForComp?.(compNumber, trueMax) ?? trueMax);

    const sel = compPlan?.[compNumber];
    const isEmpty = !!sel?.empty || !sel?.productId;

    const planned = Number(plannedGallonsByComp?.[compNumber] ?? 0);
    const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
    const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;

    const visualTopGap = 0.08;
    const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

    // Slider is 0..30 (%)
    const headPctClamped = Math.max(0, Math.min(0.3, Number.isFinite(headPct) ? headPct : 0));
    const headPctDisplay = Math.round(headPctClamped * 100);

    // ONLY allowed modal change: fluid color (match teal)
    const modalFluidFill = "rgba(45, 212, 191, 0.84)";
    const modalFluidWave = "rgba(45, 212, 191, 0.95)";

    return (
      <div style={{ display: "grid", gap: 16 }}>
        {/* Tank + headspace side by side - always, on all screen sizes */}
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 84px",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* Tank visual */}
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              borderRadius: 16,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Max</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{Math.round(trueMax)} gal</div>
            </div>

            <div
              style={{
                marginTop: 10,
                height: "min(260px, 52vw)",
                borderRadius: 14,
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

              {/* Fill (teal) */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${fillPct * 100}%`,
                  background: modalFluidFill,
                }}
              />

              {/* Wave (teal) */}
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
                    stroke={modalFluidWave}
                    strokeWidth="2"
                  />
                </svg>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>Set cap (gallons)</div>
            <input
              type="number"
              inputMode="numeric"
              value={Math.round(effMax)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || trueMax <= 0) return;
                const capped = Math.max(0, Math.min(trueMax, v));
                const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                setCompHeadspacePct?.((prev: any) => ({ ...prev, [compNumber]: pct }));
              }}
              style={{
                ...(styles?.input ?? {}),
                width: "100%",
                height: 46,
                marginTop: 8,
                borderRadius: 12,
              }}
            />

            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85 }}>Capped</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{Math.round(effMax)} gal</div>
            </div>
          </div>

          {/* Vertical slider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.82 }}>Headspace</div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={headPctDisplay}
              onChange={(e) => {
                const pct = Number(e.target.value) / 100;
                setCompHeadspacePct?.((prev: any) => ({ ...prev, [compNumber]: pct }));
              }}
              style={{
                height: 260,
                width: 34,
                writingMode: "bt-lr" as any,
                WebkitAppearance: "slider-vertical" as any,
                accentColor: "#59d7ff",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                ...(styles?.badge ?? {}),
                minWidth: 52,
                textAlign: "center",
                borderRadius: 999,
              }}
            >
              {headPctDisplay}%
            </div>
            <button
              style={{
                ...(styles?.smallBtn ?? {}),
                height: 40,
                padding: "0 10px",
                borderRadius: 12,
                width: "100%",
              }}
              onClick={() => setCompHeadspacePct?.((prev: any) => ({ ...prev, [compNumber]: 0 }))}
            >
              Max
            </button>
          </div>
        </div>

        {/* Product selection */}
        <div style={{ display: "grid", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>Product for Comp {compNumber}</strong>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 10 }}>
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
              onClick={() => {
                setCompPlan?.((prev: any) => ({
                  ...prev,
                  [compNumber]: { empty: true, productId: "" },
                }));
                setCompModalOpen?.(false);
                setCompModalComp?.(null);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 54,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid rgba(180,220,255,0.9)",
                    background: "rgba(0,0,0,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    letterSpacing: 0.5,
                    color: "rgba(180,220,255,0.9)",
                    flex: "0 0 auto",
                  }}
                >
                  MT
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 800 }}>MT (Empty)</div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
                </div>
              </div>
            </button>

            {(Array.isArray(terminalProducts) ? terminalProducts : []).map((p: any) => {
              const pid = String(p?.product_id ?? p?.id ?? "");
              const selected = !isEmpty && String(sel?.productId ?? "") === pid;

              const btnCode = getBtnCode(p);
              const btnColor = getHex(p);
              const name = getName(p);
              const sub = getSub(p);

              return (
                <button
                  key={pid || name}
                  style={{
                    textAlign: "left",
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setCompPlan?.((prev: any) => ({
                      ...prev,
                      [compNumber]: { empty: false, productId: p?.product_id ?? p?.id },
                    }));
                    setCompModalOpen?.(false);
                    setCompModalComp?.(null);
                  }}
                  title={name}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 54,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: "transparent",
                        border: `1.5px solid ${btnColor}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        letterSpacing: 0.5,
                        color: btnColor,
                        flex: "0 0 auto",
                      }}
                    >
                      {btnCode.toUpperCase()}
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
      </div>
    );
  };

  const hasComps = Array.isArray(compartments) && compartments.length > 0;

  return (
    <section style={{ ...(styles?.section ?? {}), border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles?.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles?.error}>Error loading compartments: {compError}</div>}

      {/* Plan slots (centered above compartments) */}
      {selectedTrailerId && snapshotSlots ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8, marginBottom: 10 }}>{snapshotSlots}</div>
      ) : null}

      {/* Compartment strip */}
      {selectedTrailerId && !compLoading && !compError && hasComps && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: (compartments?.length ?? 0) >= 5 ? 6 : 10,
              flexWrap: "nowrap",
              width: "100%",
            }}
          >
            {renderCompStrip()}
          </div>
        </div>
      )}

      {selectedTrailerId && !compLoading && !compError && !hasComps && <div style={styles?.help}>No compartments found for this trailer.</div>}

      <FullscreenModal
        open={!!compModalOpen}
        title={compModalComp != null ? `Compartment ${compModalComp}` : "Compartment"}
        onClose={() => {
          setCompModalOpen?.(false);
          setCompModalComp?.(null);
        }}
      >
        {renderCompModal()}
      </FullscreenModal>
    </section>
  );
}