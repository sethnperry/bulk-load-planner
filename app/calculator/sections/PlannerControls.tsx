"use client";

import React from "react";

/**
 * PlannerControls - compartment strip.
 * Redesigned: tall thin bars, product color fill from bottom,
 * product code outside/below bar, gallons darker grey, comp number above.
 */
export default function PlannerControls(props: any) {
  const {
    styles, selectedTrailerId, compLoading, compartments, compError,
    headspacePctForComp, effectiveMaxGallonsForComp, plannedGallonsByComp,
    compPlan, terminalProducts, setCompModalComp, setCompModalOpen, snapshotSlots,
    onTourAdvance,
  } = props;

  return (
    <section style={{ border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}

      {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
        <div style={{ marginTop: 14, marginBottom: 4 }}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "nowrap",
            width: "100%",
            alignItems: "flex-end",
          }}>
            {(() => {
              const n = compartments.length;
              const barH = n >= 5 ? "min(110px, 20vw)" : n >= 4 ? "min(120px, 23vw)" : "min(130px, 25vw)";

              const ordered = [...compartments]
                .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
                .reverse(); // right-to-left display (5,4,3,2,1)

              // Total capacity for proportional widths
              const totalCap = ordered.reduce((sum: number, c: any) => sum + Number(c.max_gallons ?? 0), 0);
              const gapPx = 12;

              return ordered.map((c: any) => {
                const trueMax = Number(c.max_gallons ?? 0);
                const capFraction = totalCap > 0 ? trueMax / totalCap : 1 / n;
                const barW = `calc(${(capFraction * 100).toFixed(4)}% - ${((n - 1) * gapPx / n).toFixed(2)}px)`;
                const compNumber = Number(c.comp_number);
                const headPct = headspacePctForComp(compNumber);
                const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
                const planned = plannedGallonsByComp?.[compNumber] ?? 0;
                const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;

                // Fill % — small gap at top so bar never looks 100% full
                const visualTopGap = 0.04;
                const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

                const sel = compPlan?.[compNumber];
                const isEmpty = !!sel?.empty || !sel?.productId;
                const prod = !isEmpty ? terminalProducts.find((p: any) => p.product_id === sel?.productId) : null;
                const productName = isEmpty ? "" : ((prod?.display_name ?? prod?.product_name ?? "").trim() || "Product");
                const code = isEmpty
                  ? "MT"
                  : String(prod?.button_code ?? prod?.product_code ?? (productName.split(" ")[0] || "PRD")).trim().toUpperCase();

                // Product fill color — use hex_code if available
                const hexColor = typeof prod?.hex_code === "string" && prod.hex_code.trim() ? prod.hex_code.trim() : null;
                const fillColor = isEmpty ? "rgba(255,255,255,0.08)" : (hexColor ?? "rgba(64,220,200,0.82)");
                const codeColor = isEmpty ? "rgba(255,255,255,0.30)" : (hexColor ?? "rgba(255,255,255,0.85)");

                const atMax = headPct <= 0.000001;
                const capLineTop = `${(1 - capPct) * 100}%`;

                return (
                  <div
                    key={String(c.comp_number)}
                    id={ordered.indexOf(c) === ordered.length - 1 ? "tour-comp-bar-first" : undefined}
                    onClick={() => { setCompModalComp(compNumber); setCompModalOpen(true); onTourAdvance?.("tour-comp-bar-first"); }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: "pointer", userSelect: "none",
                      width: barW, flexShrink: 0, flexGrow: 0,
                    }}
                    title={`Comp ${compNumber}`}
                  >
                    {/* Comp number above */}
                    <div style={{
                      fontSize: "clamp(11px, 2.4vw, 13px)", fontWeight: 700,
                      color: atMax ? "#ffb020" : "rgba(255,255,255,0.45)",
                      marginBottom: 4, letterSpacing: 0.2,
                    }}>
                      {compNumber}
                    </div>

                    {/* Bar — no border, rounded top, flat bottom */}
                    <div style={{
                      width: "100%", height: barH,
                      borderRadius: "10px 10px 6px 6px",
                      background: "rgba(255,255,255,0.06)",
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Headspace dimmer at top */}
                      {headPct > 0 && (
                        <div style={{
                          position: "absolute", left: 0, right: 0, top: 0,
                          height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                          background: "rgba(0,0,0,0.22)",
                          borderBottom: "1px dashed rgba(255,160,0,0.4)",
                        }} />
                      )}

                      {/* Capacity limit line */}
                      {capPct < 0.999 && (
                        <div style={{
                          position: "absolute", left: 0, right: 0,
                          top: capLineTop, height: 1,
                          background: "rgba(255,160,0,0.45)",
                        }} />
                      )}

                      {/* Product fill — from bottom, thinner/tighter look */}
                      <div style={{
                        position: "absolute", left: "12%", right: "12%", bottom: 0,
                        height: `${fillPct * 100}%`,
                        background: fillColor,
                        borderRadius: "3px 3px 0 0",
                        transition: "height 300ms ease",
                      }} />

                      {/* Wave on top of fill */}
                      {fillPct > 0.02 && (
                        <svg
                          width="100%" height="10"
                          viewBox="0 0 100 10" preserveAspectRatio="none"
                          style={{
                            position: "absolute", left: "12%", right: "12%", width: "76%",
                            bottom: `calc(${fillPct * 100}% - 5px)`,
                            opacity: 0.7,
                          }}
                        >
                          <path d="M0,5 C20,1 40,9 60,5 C80,1 90,8 100,5"
                            fill="none" stroke={fillColor} strokeWidth="2" />
                        </svg>
                      )}
                    </div>

                    {/* Product code — outside bar, below, colored */}
                    <div style={{
                      marginTop: 5,
                      fontSize: "clamp(11px, 2.8vw, 14px)", fontWeight: 800,
                      color: codeColor,
                      letterSpacing: 0.3,
                    }}>
                      {code}
                    </div>

                    {/* Gallons — darker grey */}
                    <div style={{
                      marginTop: 2,
                      fontSize: "clamp(10px, 2.4vw, 13px)", fontWeight: 600,
                      color: planned > 0 ? "rgba(140,140,140,0.9)" : "rgba(255,255,255,0.12)",
                      letterSpacing: -0.2,
                    }}>
                      {planned > 0 ? Math.round(planned).toLocaleString() : "—"}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Plan slots below compartments */}
      {selectedTrailerId && snapshotSlots && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12, marginBottom: 2 }}>
          {snapshotSlots}
        </div>
      )}

      {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
        <div style={styles.help}>No compartments found for this trailer.</div>
      )}
    </section>
  );
}
