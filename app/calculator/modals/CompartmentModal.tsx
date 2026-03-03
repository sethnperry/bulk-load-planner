"use client";
// app/calculator/modals/CompartmentModal.tsx
// Standalone compartment headspace + product selection modal.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export default function CompartmentModal({
  open,
  compNumber,
  compartments,
  headspacePctForComp,
  effectiveMaxGallonsForComp,
  compPlan,
  plannedGallonsByComp,
  terminalProducts,
  styles,
  setCompHeadspacePct,
  setCompPlan,
  onClose,
}: {
  open: boolean;
  compNumber: number | null;
  compartments: any[];
  headspacePctForComp: (n: number) => number;
  effectiveMaxGallonsForComp: (n: number, max: number) => number;
  compPlan: any;
  plannedGallonsByComp: any;
  terminalProducts: any[];
  styles: any;
  setCompHeadspacePct: (fn: any) => void;
  setCompPlan: (fn: any) => void;
  onClose: () => void;
}) {
  const [capInputVal, setCapInputVal] = useState<number | null>(null);

  if (compNumber == null) return null;

  const c = compartments.find((x: any) => Number(x.comp_number) === compNumber);
  const trueMax = Number(c?.max_gallons ?? 0);
  const headPct = headspacePctForComp(compNumber);
  const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
  const sel = compPlan?.[compNumber];
  const isEmpty = !!sel?.empty || !sel?.productId;
  const planned = plannedGallonsByComp?.[compNumber] ?? 0;
  const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
  const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
  const visualTopGap = 0.08;
  const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

  return (
    <FullscreenModal open={open} title={`Compartment ${compNumber}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>

        {/* ── Top section: tank + vertical slider side by side ── */}
        {/* This row uses a fixed height so the slider never wraps below the tank */}
        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "stretch",
          height: "min(220px, 52vw)",
        }}>

          {/* Tank visual */}
          <div style={{
            flex: "0 0 auto",
            width: "min(120px, 30vw)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            padding: 8,
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>Max</div>
              <div style={{ fontSize: 11, fontWeight: 800 }}>{Math.round(trueMax)}</div>
            </div>
            <div style={{ flex: 1, borderRadius: 10, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
              {headPct > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: 0,
                  height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                  background: "rgba(255,160,0,0.18)",
                  borderBottom: "1px dashed rgba(255,160,0,0.4)" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
                height: `${fillPct * 100}%`, background: "rgba(185,245,250,0.85)" }} />
              {fillPct > 0 && (
                <svg width="100%" height="14" viewBox="0 0 100 14" preserveAspectRatio="none"
                  style={{ position: "absolute", left: 0, right: 0, bottom: `calc(${fillPct * 100}% - 7px)`, opacity: 0.9 }}>
                  <path d="M0,7 C10,1 20,13 30,7 C40,1 50,13 60,7 C70,1 80,13 90,7 C95,5 98,5 100,7"
                    fill="none" stroke="rgba(120,210,220,0.95)" strokeWidth="2" />
                </svg>
              )}
              {headPct > 0.06 && (
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0,
                  transform: `translateY(calc(-50% + ${(headPct * -0.5) * 100}%))`,
                  textAlign: "center", fontSize: 9, fontWeight: 800,
                  color: "rgba(255,160,0,0.9)", pointerEvents: "none" }}>
                  {Math.round(headPct * 100)}%
                </div>
              )}
            </div>
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 9, opacity: 0.55 }}>Cap</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: headPct > 0 ? "#fbbf24" : "rgba(255,255,255,0.8)" }}>
                {Math.round(effMax)}
              </div>
            </div>
          </div>

          {/* Vertical slider — same height as tank, never wraps */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            paddingTop: 4,
            paddingBottom: 4,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: headPct > 0 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
              {Math.round(headPct * 100)}%
            </div>
            <input
              type="range"
              min={0} max={30} step={1}
              value={Math.round(headPct * 100)}
              onChange={(e) => {
                const pct = Number(e.target.value) / 100;
                setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
              }}
              style={{
                flex: 1,
                writingMode: "vertical-lr" as const,
                direction: "rtl" as const,
                WebkitAppearance: "slider-vertical",
                width: 36,
                accentColor: "#fbbf24",
                cursor: "pointer",
              } as React.CSSProperties}
            />
            <div style={{ fontSize: 9, opacity: 0.4 }}>0%</div>
          </div>

          {/* Right column: cap input + Max + hint */}
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingTop: 4,
            minWidth: 0,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Headspace</div>
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Cap (gallons)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                inputMode="numeric"
                value={capInputVal !== null ? capInputVal : Math.round(effMax)}
                onFocus={(e) => {
                  setCapInputVal(Math.round(effMax));
                  setTimeout(() => (e.target as HTMLInputElement).select(), 0);
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  const v = Number(raw);
                  setCapInputVal(raw === "" ? 0 : v);
                  if (!Number.isFinite(v) || trueMax <= 0 || raw === "") return;
                  const capped = Math.max(0, Math.min(trueMax, v));
                  const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                  setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
                }}
                onBlur={() => setCapInputVal(null)}
                style={{ ...styles.input, flex: 1, minWidth: 0 }}
              />
              <button
                style={{ ...styles.smallBtn, flexShrink: 0 }}
                onClick={() => {
                  setCapInputVal(null);
                  setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: 0 }));
                }}
              >
                Max
              </button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.4, marginTop: 4 }}>
              Set headspace to load safely below the top probe.{"\n"}0% fills to compartment max.
            </div>
          </div>
        </div>

        {/* ── Product selection ── */}
        <div style={{ display: "grid", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>Product for Comp {compNumber}</strong>
          <div style={{ display: "grid", gap: 8 }}>

            {/* MT / Empty */}
            <button
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.14)",
                background: isEmpty ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                color: "white", cursor: "pointer",
              }}
              onClick={() => {
                setCompPlan((prev: any) => ({ ...prev, [compNumber]: { empty: true, productId: "" } }));
                onClose();
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 52, height: 42, borderRadius: 11, flexShrink: 0,
                  border: "1px solid rgba(180,220,255,0.9)", background: "rgba(0,0,0,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: "rgba(180,220,255,0.9)",
                }}>MT</div>
                <div>
                  <div style={{ fontWeight: 800 }}>MT (Empty)</div>
                  <div style={{ opacity: 0.6, fontSize: 13 }}>Leave this compartment empty</div>
                </div>
              </div>
            </button>

            {terminalProducts.map((p: any) => {
              const selected = !isEmpty && sel?.productId === p.product_id;
              const btnCode = ((p.button_code ?? p.product_code ?? "").trim() || "PRD").toUpperCase();
              const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
              const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
              const sub = (p.description ?? "").trim();
              return (
                <button
                  key={p.product_id}
                  style={{
                    textAlign: "left", padding: "12px 14px", borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                    color: "white", cursor: "pointer",
                  }}
                  onClick={() => {
                    setCompPlan((prev: any) => ({ ...prev, [compNumber]: { empty: false, productId: p.product_id } }));
                    onClose();
                  }}
                  title={name}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 52, height: 42, borderRadius: 11, flexShrink: 0,
                      backgroundColor: "transparent", border: `2px solid ${btnColor}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 13, letterSpacing: 0.5, color: btnColor,
                    }}>
                      {btnCode}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ opacity: 0.6, fontSize: 13, lineHeight: 1.3 }}>{sub || "\u00A0"}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </FullscreenModal>
  );
}
