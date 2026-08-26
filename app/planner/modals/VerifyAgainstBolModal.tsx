"use client";
// app/planner/modals/VerifyAgainstBolModal.tsx
//
// Phase 2 of the Loading flow (see LoadingModal.tsx's own "Plan Review"
// framing) -- opened only when the driver taps "Log the Load" in
// CancelLoadSheet. Per COMPARTMENT (not per product -- two compartments of
// the same product are allowed to end up with genuinely different
// BOL-corrected values here), a driver corrects Gallons/Temp/API against
// the real bill of lading / scale ticket before the load actually submits.
// Everything is pre-filled from the finalized Phase-1 plan, so a driver who
// loaded exactly per plan can just tap Confirm with no corrections.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import type { VerifiedLoadLine } from "../hooks/useLoadWorkflow";

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

type ProductInputs = Record<string, { api?: string; tempF?: number }>;

type CompDraft = { gallons: string; tempF: string; api: string };

export default function VerifyAgainstBolModal(props: {
  open: boolean;
  onClose: () => void;
  styles: any;

  planRows: PlanRowLike[];
  productNameById: Map<string, string>;
  productHexCodeById?: Record<string, string>;
  productInputs: ProductInputs;

  onConfirm: (verifiedByComp: Record<number, VerifiedLoadLine>) => void;
  // Always-visible way out from this screen too -- per explicit user
  // direction ("we always want a way out regardless of the screen").
  // Genuinely undoes the load + re-card, same handler LoadingModal's own
  // Back to Planner button and CancelLoadSheet's row both use.
  onBackToPlanner: () => void;
  busy?: boolean;
}) {
  const { open, onClose, styles, planRows, productNameById, productHexCodeById, productInputs, onConfirm, onBackToPlanner, busy } = props;

  const compLines = useMemo(() => {
    return (planRows ?? [])
      .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
      .map((r) => ({
        comp: Number(r.comp_number),
        productId: String(r.productId),
        gallons: Number(r.planned_gallons ?? 0),
      }))
      .filter((x) => Number.isFinite(x.comp) && x.comp > 0)
      .sort((a, b) => a.comp - b.comp);
  }, [planRows]);

  const [drafts, setDrafts] = useState<Record<number, CompDraft>>({});

  // Re-seed from the finalized Phase-1 plan every time this modal opens --
  // never once at mount, since the plan can have changed since the last
  // time it was opened (e.g. driver backed out via Keep Editing).
  useEffect(() => {
    if (!open) return;
    const next: Record<number, CompDraft> = {};
    for (const line of compLines) {
      const pi = productInputs[line.productId];
      next[line.comp] = {
        gallons: String(Math.round(line.gallons)),
        tempF: pi?.tempF != null ? pi.tempF.toFixed(1) : "",
        api: pi?.api ?? "",
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [editingComp, setEditingComp] = useState<number | null>(null);
  const [gallonsInput, setGallonsInput] = useState("");
  const [tempInput, setTempInput] = useState("");
  const [apiInput, setApiInput] = useState("");

  function openRow(comp: number) {
    const d = drafts[comp];
    setEditingComp(comp);
    setGallonsInput(d?.gallons ?? "");
    setTempInput(d?.tempF ?? "");
    setApiInput(d?.api ?? "");
  }
  function commitRow() {
    if (editingComp == null) return;
    setDrafts((prev) => ({ ...prev, [editingComp]: { gallons: gallonsInput, tempF: tempInput, api: apiInput } }));
    setEditingComp(null);
  }

  function isValidDraft(d: CompDraft | undefined): boolean {
    if (!d) return false;
    const g = parseFloat(d.gallons);
    const t = parseFloat(d.tempF);
    const a = parseFloat(d.api);
    return Number.isFinite(g) && g > 0 && Number.isFinite(t) && Number.isFinite(a);
  }

  const allValid = compLines.length > 0 && compLines.every((l) => isValidDraft(drafts[l.comp]));

  function handleConfirm() {
    if (!allValid) return;
    const verifiedByComp: Record<number, VerifiedLoadLine> = {};
    for (const line of compLines) {
      const d = drafts[line.comp];
      verifiedByComp[line.comp] = {
        gallons: parseFloat(d.gallons),
        tempF: parseFloat(d.tempF),
        api: parseFloat(d.api),
      };
    }
    onConfirm(verifiedByComp);
  }

  return (
    <FullscreenModal open={open} title="Verify Against BOL" onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
          Confirm each compartment matches the bill of lading. Tap a row to correct gallons, temp, or API.
        </div>

        {compLines.length === 0 ? (
          <div style={styles.help}>No filled compartments in the plan.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {compLines.map((x) => {
              const dotColor = (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
              const d = drafts[x.comp];
              const valid = isValidDraft(d);
              return (
                <button
                  type="button"
                  key={x.comp}
                  onClick={() => openRow(x.comp)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: `1px solid ${valid ? "rgba(255,255,255,0.10)" : "rgba(248,113,113,0.40)"}`,
                    background: valid ? "rgba(255,255,255,0.04)" : "rgba(248,113,113,0.08)",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left" as const,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      C{x.comp} — {productNameById.get(x.productId) ?? x.productId}
                    </span>
                    {!valid && <span style={{ fontSize: 11, fontWeight: 800, color: "#f87171" }}>⚠ Needs values</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, padding: "8px 0", borderRadius: 6, background: "rgba(255,255,255,0.05)", textAlign: "center" as const }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>GALLONS</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{d?.gallons || "—"}</div>
                    </div>
                    <div style={{ flex: 1, padding: "8px 0", borderRadius: 6, background: "rgba(255,255,255,0.05)", textAlign: "center" as const }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>TEMP °F</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{d?.tempF || "—"}</div>
                    </div>
                    <div style={{ flex: 1, padding: "8px 0", borderRadius: 6, background: "rgba(255,255,255,0.05)", textAlign: "center" as const }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>API</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{d?.api || "—"}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", width: "100%", marginTop: 6 }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allValid || Boolean(busy)}
            style={{
              ...(styles as any).doneBtn,
              opacity: !allValid || busy ? 0.55 : 1,
              width: "100%",
            }}
          >
            {busy ? "Saving…" : "Confirm & Log Load"}
          </button>
        </div>

        <button
          type="button"
          onClick={onBackToPlanner}
          disabled={Boolean(busy)}
          style={{
            width: "100%", padding: "10px 0",
            borderRadius: 6, border: "none", background: "transparent",
            color: "rgba(255,255,255,0.40)", fontSize: 13, fontWeight: 700, cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Back to Planner
        </button>
      </div>

      <ValueEntryOverlay
        open={editingComp != null}
        title={editingComp != null ? `C${editingComp} — Verify Against BOL` : "Verify"}
        fields={[
          { key: "gallons", label: "Gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" },
          { key: "temp", label: "Temp", value: tempInput, onChange: setTempInput, suffix: "°F", decimal: true },
          { key: "api", label: "API", value: apiInput, onChange: setApiInput, decimal: true },
        ]}
        onCancel={() => setEditingComp(null)}
        onSubmit={commitRow}
      />
    </FullscreenModal>
  );
}
