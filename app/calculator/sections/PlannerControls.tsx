"use client";

import React from "react";

/**
 * PlannerControls - compartment strip only.
 * Modal lives in modals/CompartmentModal.tsx
 */
export default function PlannerControls(props: any) {
  const {
    styles, selectedTrailerId, compLoading, compartments, compError,
    headspacePctForComp, effectiveMaxGallonsForComp, plannedGallonsByComp,
    compPlan, terminalProducts, setCompModalComp, setCompModalOpen, snapshotSlots,
  } = props;

  return (
    <section style={{ border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}

      {selectedTrailerId && snapshotSlots ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8, marginBottom: 10 }}>
          {snapshotSlots}
        </div>
      ) : null}

      {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: compartments.length >= 5 ? 5 : 8,
            flexWrap: "nowrap",
            width: "100%",
          }}>
            {(() => {
              const n = compartments.length;
              const h = n >= 5 ? "min(260px, 38vw)" : n >= 4 ? "min(280px, 46vw)" : "min(300px, 52vw)";
              const ordered = [...compartments]
                .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
                .reverse();

              return ordered.map((c: any) => {
                const compNumber = Number(c.comp_number);
                const trueMax = Number(c.max_gallons ?? 0);
                const headPct = headspacePctForComp(compNumber);
                const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
                const planned = plannedGallonsByComp?.[compNumber] ?? 0;
                const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
                const visualTopGap = 0.08;
                const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));
                const sel = compPlan?.[compNumber];
                const isEmpty = !!sel?.empty || !sel?.productId;
                const prod = !isEmpty ? terminalProducts.find((p: any) => p.product_id === sel?.productId) : null;
                const productName = isEmpty ? "" : ((prod?.display_name ?? prod?.product_name ?? "").trim() || "Product");
                const code = isEmpty
                  ? "MT"
                  : String(prod?.button_code ?? prod?.product_code ?? (productName.split(" ")[0] || "PRD")).trim().toUpperCase();
                const codeColor = isEmpty
                  ? "rgba(180,220,255,0.9)"
                  : (typeof prod?.hex_code === "string" && prod.hex_code.trim()) ? prod.hex_code.trim() : "rgba(255,255,255,0.9)";
                const atMax = headPct <= 0.000001;

                return (
                  <div
                    key={String(c.comp_number)}
                    onClick={() => { setCompModalComp(compNumber); setCompModalOpen(true); }}
                    style={{
                      flex: "1 1 0", minWidth: 0,
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: "pointer", userSelect: "none",
                    }}
                    title={`Comp ${compNumber}`}
                  >
                    {/* Comp number - small, tight to top */}
                    <div style={{
                      fontSize: "clamp(11px, 2.5vw, 14px)", fontWeight: 700,
                      letterSpacing: 0.2, marginBottom: 3,
                      color: atMax ? "#ffb020" : "rgba(255,255,255,0.5)",
                    }}>
                      {compNumber}
                    </div>

                    {/* Tank card */}
                    <div style={{
                      width: "100%", height: h, borderRadius: 16,
                      background: "rgba(255,255,255,0.07)",
                      position: "relative", overflow: "hidden",
                    }}>
                      {headPct > 0 && (
                        <div style={{ position: "absolute", left: 0, right: 0, top: 0,
                          height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                          background: "rgba(0,0,0,0.22)",
                          borderBottom: "1px dashed rgba(255,160,0,0.5)" }} />
                      )}
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
                        height: `${fillPct * 100}%`, background: "rgba(64,220,200,0.82)" }} />
                      {fillPct > 0 && (
                        <svg width="100%" height="16" viewBox="0 0 100 16" preserveAspectRatio="none"
                          style={{ position: "absolute", left: 0, right: 0, bottom: `calc(${fillPct * 100}% - 8px)`, opacity: 0.9 }}>
                          <path d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                            fill="none" stroke="rgba(100,240,220,0.95)" strokeWidth="2.5" />
                        </svg>
                      )}
                      {/* Product badge inside card, bottom */}
                      <div style={{
                        position: "absolute", bottom: 8, left: "50%",
                        transform: "translateX(-50%)", width: "72%", minWidth: 0,
                        height: 36, borderRadius: 10,
                        backgroundColor: "rgba(0,0,0,0.30)",
                        border: `2px solid ${isEmpty ? "rgba(180,220,255,0.45)" : codeColor}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: "clamp(11px, 3vw, 17px)",
                        color: isEmpty ? "rgba(180,220,255,0.85)" : codeColor,
                      }}>
                        {code}
                      </div>
                    </div>

                    {/* Gallons outside/below card */}
                    <div style={{
                      marginTop: 6,
                      fontSize: "clamp(14px, 3.2vw, 20px)", fontWeight: 600,
                      color: planned > 0 ? "rgba(210,210,210,0.9)" : "rgba(255,255,255,0.15)",
                      letterSpacing: -0.3,
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

      {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
        <div style={styles.help}>No compartments found for this trailer.</div>
      )}
    </section>
  );
}
