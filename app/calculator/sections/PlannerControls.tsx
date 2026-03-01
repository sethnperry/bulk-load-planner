"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/**
 * PlannerControls
 * - Receives state + setters from parent (page.tsx)
 * - Keeps this file build-safe (Turbopack friendly)
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

    // headspace setter (optional, used by slider + cap input)
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
    const h = (p?.hex_code ?? "").toString().trim();
    return h || "rgba(255,255,255,0.9)";
  };

  const renderCompStrip = () => {
    const n = Array.isArray(compartments) ? compartments.length : 0;

    // Height scales with number of compartments - fewer comps = taller
    const h = n >= 5 ? "min(280px, 40vw)" : n >= 4 ? "min(300px, 50vw)" : "min(320px, 55vw)";
    const ordered = [...(compartments ?? [])]
      .slice()
      .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
      .reverse();

    return ordered.map((c: any) => {
      const compNumber = Number(c.comp_number);
      const trueMax = Number(c.max_gallons ?? 0);
      const headPct = headspacePctForComp?.(compNumber) ?? 0;
      const effMax = effectiveMaxGallonsForComp?.(compNumber, trueMax) ?? trueMax;
      const planned = plannedGallonsByComp?.[compNumber] ?? 0;

      const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
      const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
      const visualTopGap = 0.08;
      const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

      const sel = compPlan?.[compNumber];
      const isEmpty = !!sel?.empty || !sel?.productId;

      const prod = !isEmpty ? getProd(sel?.productId) : null;
      const code = isEmpty ? "MT" : getBtnCode(prod);
      // Color selection (safe fallback)
      const codeColor = isEmpty ? "rgba(180,220,255,0.92)" : getHex(prod);

      const atMax = headPct <= 0.000001;

      return (
        <div
          key={String(compNumber)}
          onClick={() => {
            setCompModalComp?.(compNumber);
            setCompModalOpen?.(true);
          }}
          style={{
            flex: "1 1 0",
            minWidth: 0,
            height: h,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            padding: "10px 6px 10px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            userSelect: "none",
          }}
          title={`Comp ${compNumber}`}
        >
          <div
            style={{
              fontSize: "clamp(16px, 3.5vw, 22px)",
              fontWeight: 800,
              letterSpacing: 0.2,
              marginBottom: 8,
              color: atMax ? "#ffb020" : "rgba(255,255,255,0.92)",
            }}
          >
            {compNumber}
          </div>

          {/* Tank */}
          <div
            style={{
              position: "relative",
              width: "80%",
              flex: 1,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            {/* Fill */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: `${Math.round(fillPct * 100)}%`,
                background: "rgba(90,180,255,0.35)",
              }}
            />
          </div>

          {/* Product button */}
          <div
            style={{
              marginTop: 8,
              width: "80%",
              minWidth: 0,
              height: 44,
              borderRadius: 12,
              backgroundColor: "transparent",
              border: `1.5px solid ${isEmpty ? "rgba(180,220,255,0.60)" : codeColor}`,
              boxShadow: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "clamp(13px, 3.5vw, 20px)",
              color: isEmpty ? "rgba(180,220,255,0.92)" : codeColor,
            }}
          >
            {code}
          </div>

          {/* Planned gallons */}
          <div style={{ marginTop: 8, fontSize: 16, color: "rgba(220,220,220,0.85)" }}>
            {planned > 0 ? Math.round(planned).toString() : ""}
          </div>
        </div>
      );
    });
  };

  const renderCompModal = () => {
    if (compModalComp == null) return null;

    const compNumber = Number(compModalComp);
    const c = (compartments ?? []).find((x: any) => Number(x?.comp_number) === compNumber);
    const trueMax = Number(c?.max_gallons ?? 0);
    const headPct = headspacePctForComp?.(compNumber) ?? 0;
    const effMax = effectiveMaxGallonsForComp?.(compNumber, trueMax) ?? trueMax;
    const sel = compPlan?.[compNumber];
    const isEmpty = !!sel?.empty || !sel?.productId;
    const planned = plannedGallonsByComp?.[compNumber] ?? 0;
    const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
    const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
    const visualTopGap = 0.08;
    const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

    const headPctDisplay = Math.round(headPct * 100);

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.82, lineHeight: 1.35 }}>
          Adjust headspace to stay safely below the top probe and set the product for compartment {compNumber}.
        </div>

        {/* Tank + vertical headspace slider (never stacks) */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "stretch",
            flexWrap: "nowrap",
            width: "100%",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          {/* Tank card */}
          <div
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              borderRadius: 18,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Max Volume</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{Math.round(trueMax)} gal</div>
            </div>

            <div
              style={{
                marginTop: 10,
                height: "min(260px, 52vw)",
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
                  background: "rgba(185,245,250,0.85)",
                }}
              />
              {/* Simple wave */}
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
                    stroke="rgba(120,210,220,0.95)"
                    strokeWidth="2"
                  />
                </svg>
              )}
              {/* Headspace % label */}
              {headPct > 0.04 && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    right: 0,
                    transform: "translateY(-50%)",
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
                  const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                  setCompHeadspacePct?.((prev: any) => ({ ...prev, [compNumber]: pct }));
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
                onClick={() => setCompHeadspacePct?.((prev: any) => ({ ...prev, [compNumber]: 0 }))}
              >
                Return to max
              </button>
            </div>
          </div>

          {/* Vertical slider */}
          <div style={{ flex: "0 0 86px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
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
                height: 240,
                width: 36,
                writingMode: "bt-lr" as any,
                WebkitAppearance: "slider-vertical" as any,
                accentColor: "#59d7ff",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                ...(styles?.badge ?? {}),
                minWidth: 48,
                textAlign: "center",
                borderRadius: 999,
              }}
            >
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
          onClick={() => {
            setCompPlan?.((prev: any) => ({
              ...prev,
              [compNumber]: { empty: true, productId: "" },
            }));
            setCompModalOpen?.(false);
            setCompModalComp?.(null);
          }}
        >
          <div style={{ fontWeight: 800 }}>MT (Empty)</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
        </button>

        <div style={{ display: "grid", gap: 10 }}>
          {(terminalProducts ?? []).map((p: any) => {
            const selected = !isEmpty && sel?.productId === p.product_id;
            const name = (p.product_name ?? p.display_name ?? p.product_code ?? "Product").toString();
            const sub = (p.description ?? "").toString();
            const btnCode = ((p.button_code ?? p.product_code ?? "PRD").toString().trim() || "PRD").toUpperCase();

            return (
              <button
                key={p.product_id}
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
                    [compNumber]: { empty: false, productId: p.product_id },
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
                      border: `1.5px solid ${getHex(p)}`,
                      background: "rgba(0,0,0,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      letterSpacing: 0.5,
                      color: getHex(p),
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
  };

  return (
    <section style={{ ...(styles?.section ?? {}), border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles?.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles?.error}>Error loading compartments: {compError}</div>}

      {/* Plan slots (centered above compartments) */}
      {snapshotSlots ? (
        <div style={{ marginTop: 8, marginBottom: 10 }}>
          {snapshotSlots}
        </div>
      ) : null}

      {/* Driver compartment strip (primary interface) */}
      {selectedTrailerId && !compLoading && !compError && (compartments?.length ?? 0) > 0 && (
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

      {selectedTrailerId && !compLoading && !compError && (compartments?.length ?? 0) === 0 && (
        <div style={styles?.help}>No compartments found for this trailer.</div>
      )}

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
