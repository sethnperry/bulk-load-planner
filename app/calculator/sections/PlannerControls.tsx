"use client";

import React, { useState } from "react";

/**
 * PlannerControls - compartment strip.
 * Tall thin bars, product color fill from bottom, product code outside/
 * below bar, gallons darker grey, comp number above. Each bar has a drag
 * handle sitting at its configured cap line -- dragging temporarily lowers
 * the effective ceiling for this load only (bounded to the compartment's
 * real cap_gallons, set in Binder's Compartments section; never above it).
 * A small reset control clears the override back to the full cap. Tapping
 * the bar body selects it (highlighted ring) and surfaces an "Edit Comp N
 * Product" button in the action row above -- it does not open the product
 * picker directly, so the tap never conflicts with the drag gesture.
 */
export default function PlannerControls(props: any) {
  const {
    styles, selectedTrailerId, compLoading, compartments, compError,
    persistedCapForComp, effectiveMaxGallonsForComp, plannedGallonsByComp,
    compPlan, setCompPlan, terminalProducts, selectedComp, onSelectComp,
    onTourAdvance, selectedTerminalId,
  } = props;

  const [draggingComp, setDraggingComp] = useState<number | null>(null);
  const [dragGallonsText, setDragGallonsText] = useState<number | null>(null);

  return (
    <section style={{ border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}

      {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
        <div id="tour-comp-area" style={{ marginTop: 6, marginBottom: 2, position: "relative" as const, opacity: selectedTerminalId ? 1 : 0.45, transition: "opacity 200ms" }}>
          {!selectedTerminalId && (
            <div style={{ position: "absolute" as const, inset: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" as const }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 10px" }}>
                Select a terminal first
              </div>
            </div>
          )}
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
              const barH = n >= 5 ? "min(110px, 20vw)" : n >= 4 ? "min(120px, 22vw)" : "min(130px, 25vw)";

              const ordered = [...compartments]
                .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
                .reverse(); // right-to-left display (5,4,3,2,1)

              // Total physical capacity for proportional widths -- widths
              // reflect the compartment's real size on the trailer, not a
              // temporarily-adjusted cap.
              const totalCap = ordered.reduce((sum: number, c: any) => sum + Number(c.max_gallons ?? 0), 0);
              const gapPx = 12;

              return ordered.map((c: any) => {
                const trueMax = Number(c.max_gallons ?? 0);
                const capFraction = totalCap > 0 ? trueMax / totalCap : 1 / n;
                const barW = `calc(${(capFraction * 100).toFixed(4)}% - ${((n - 1) * gapPx / n).toFixed(2)}px)`;
                const compNumber = Number(c.comp_number);
                const persistedCap: number = persistedCapForComp(compNumber);
                const effMax = effectiveMaxGallonsForComp(compNumber, persistedCap);
                const hasOverride = compPlan?.[compNumber]?.capOverride != null;
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

                const capLineTopPct = (1 - capPct) * 100;
                const isDragging = draggingComp === compNumber;

                function updateFromClientY(clientY: number, barEl: HTMLElement) {
                  const rect = barEl.getBoundingClientRect();
                  const relY = (clientY - rect.top) / rect.height;
                  const frac = Math.max(0, Math.min(1, 1 - relY));
                  const gallons = Math.max(0, Math.min(persistedCap, Math.round(frac * trueMax)));
                  setDragGallonsText(gallons);
                  setCompPlan((prev: any) => ({
                    ...prev,
                    [compNumber]: { ...(prev[compNumber] ?? { empty: false, productId: "" }), capOverride: gallons },
                  }));
                }

                const isSelected = selectedComp === compNumber;

                return (
                  <div
                    key={String(c.comp_number)}
                    onClick={() => {
                      if (!selectedTerminalId) return;
                      onSelectComp?.(compNumber);
                    }}
                    title={!selectedTerminalId ? "Select a terminal first" : `Comp ${compNumber}`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: "pointer", userSelect: "none",
                      width: barW, flexShrink: 0, flexGrow: 0,
                    }}
                  >
                    {/* Comp number above, with a reset control when a temporary
                        override is active */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <div style={{
                        fontSize: "clamp(11px, 2.4vw, 13px)", fontWeight: 700,
                        color: hasOverride ? "#ffb020" : "rgba(255,255,255,0.45)",
                        letterSpacing: 0.2,
                      }}>
                        {compNumber}
                      </div>
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompPlan((prev: any) => ({
                              ...prev,
                              [compNumber]: { ...(prev[compNumber] ?? { empty: false, productId: "" }), capOverride: null },
                            }));
                          }}
                          title="Reset to full cap"
                          style={{
                            border: "none", background: "none", cursor: "pointer", padding: 0,
                            fontSize: 11, color: "#ffb020", lineHeight: 1,
                          }}
                        >
                          ↺
                        </button>
                      )}
                    </div>

                    {/* Bar — no border, rounded top, flat bottom. A ring
                        highlights the selected comp (surfaces "Edit Comp N
                        Product" in the action row above). */}
                    <div style={{
                      width: "100%", height: barH,
                      borderRadius: "10px 10px 6px 6px",
                      background: "rgba(255,255,255,0.06)",
                      position: "relative", overflow: "visible",
                      boxShadow: isSelected ? "0 0 0 2px rgba(255,255,255,0.55)" : "none",
                      transition: "box-shadow 150ms ease",
                    }}>
                      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "10px 10px 6px 6px" }}>
                        {/* Dimmer above the cap line -- unusable for this load */}
                        {capPct < 0.999 && (
                          <div style={{
                            position: "absolute", left: 0, right: 0, top: 0,
                            height: `${Math.max(0, (1 - capPct)) * 100}%`,
                            background: "rgba(0,0,0,0.22)",
                            borderBottom: "1px dashed rgba(255,160,0,0.4)",
                          }} />
                        )}

                        {/* Product fill — from bottom, full bar width */}
                        <div style={{
                          position: "absolute", left: 0, right: 0, bottom: 0,
                          height: `${fillPct * 100}%`,
                          background: fillColor,
                          transition: isDragging ? "none" : "height 300ms ease",
                        }} />
                      </div>

                      {/* Cap drag handle -- separate hit target from the bar
                          body, stopPropagation so a drag never also opens the
                          product picker */}
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDraggingComp(compNumber);
                          updateFromClientY(e.clientY, e.currentTarget.parentElement as HTMLElement);
                        }}
                        onPointerMove={(e) => {
                          if (draggingComp !== compNumber) return;
                          e.stopPropagation();
                          updateFromClientY(e.clientY, e.currentTarget.parentElement as HTMLElement);
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          setDraggingComp(null);
                          setDragGallonsText(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute", left: "50%", transform: "translate(-50%,-50%)",
                          top: `${capLineTopPct}%`, width: 36, height: 14,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "ns-resize", touchAction: "none", zIndex: 3,
                        }}
                      >
                        <div style={{ width: 30, height: 5, borderRadius: 3, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }} />
                      </div>

                      {isDragging && dragGallonsText != null && (
                        <div style={{
                          position: "absolute", left: "50%", transform: "translateX(-50%)",
                          top: `calc(${capLineTopPct}% - 26px)`,
                          background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7,
                          padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "#fff",
                          whiteSpace: "nowrap" as const, boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 4,
                        }}>
                          {dragGallonsText.toLocaleString()} gal
                        </div>
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

      {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
        <div style={styles.help}>No compartments found for this trailer.</div>
      )}
    </section>
  );
}
