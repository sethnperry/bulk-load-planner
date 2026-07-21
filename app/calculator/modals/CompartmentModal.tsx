"use client";
// app/calculator/modals/CompartmentModal.tsx
// Product-selection-only. Headspace/cap editing moved to Binder's
// Compartments section (per-trailer, persisted cap_gallons) -- the
// planner's drag handle on each bar now handles temporary per-load
// adjustments directly, so there's no longer a "settings" concern here.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export default function CompartmentModal({
  open,
  compNumber,
  compartments,
  compPlan,
  terminalProducts,
  styles,
  setCompPlan,
  onClose,
}: {
  open: boolean;
  compNumber: number | null;
  compartments: any[];
  compPlan: any;
  terminalProducts: any[];
  styles: any;
  setCompPlan: (fn: any) => void;
  onClose: () => void;
}) {
  if (compNumber == null) return null;

  const sel = compPlan?.[compNumber];
  const isEmpty = !!sel?.empty || !sel?.productId;

  return (
    <FullscreenModal open={open} title={`Compartment ${compNumber}`} onClose={onClose}>
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
              width: "100%", boxSizing: "border-box" as const, overflow: "hidden",
            }}
            onClick={() => {
              setCompPlan((prev: any) => ({ ...prev, [compNumber]: { ...(prev[compNumber] ?? {}), empty: true, productId: "" } }));
              onClose();
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div style={{
                width: 52, height: 42, borderRadius: 11, flexShrink: 0,
                border: "1px solid rgba(180,220,255,0.9)", background: "rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: "rgba(180,220,255,0.9)",
              }}>MT</div>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>MT (Empty)</div>
                <div style={{ opacity: 0.6, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Leave this compartment empty</div>
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
                  width: "100%", boxSizing: "border-box" as const, overflow: "hidden",
                }}
                onClick={() => {
                  setCompPlan((prev: any) => ({ ...prev, [compNumber]: { ...(prev[compNumber] ?? {}), empty: false, productId: p.product_id } }));
                  onClose();
                }}
                title={name}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 52, height: 42, borderRadius: 11, flexShrink: 0,
                    backgroundColor: "transparent", border: `2px solid ${btnColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 13, letterSpacing: 0.5, color: btnColor,
                  }}>
                    {btnCode}
                  </div>
                  <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                    <div style={{ opacity: 0.6, fontSize: 13, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub || " "}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </FullscreenModal>
  );
}
