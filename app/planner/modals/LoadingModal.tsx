"use client";

import React, { useMemo, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

// ── Plan Review (redesign 2026-09-05) ──────────────────────────────────────
// Per explicit direction, this screen went back to being clean and simple:
// compartments show the product LABEL + a colored dot + gallons, and nothing
// else -- "the gallons are all the driver needs before getting out to load."
// API and temperature were removed from this screen entirely; they're now
// entered only when the driver comes back with a BOL and taps "Log the Load"
// (one product at a time, via ValueEntryOverlay with the product's colored
// dot at the top -- see the log-the-load sequence below).
//
// The "next steps" that used to live in a separate bottom sheet (CancelLoadSheet)
// are now the modal's own action buttons: Log the Load / Update Card, No Load /
// Report Terminal Issue / Back to Planner. Report Terminal Issue still hands
// off to CancelLoadSheet (opened directly in its report flow by page.tsx) so
// the multi-step outage-report UI lives in one place.

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

  // Product dot color (catalog hex_code) -- the one visual carried through
  // everywhere a product appears, to avoid cross-drops.
  productHexCodeById?: Record<string, string>;

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

  // ── Action buttons (now in the modal itself, not a separate sheet) ──
  // Log the Load: runs the per-product API/Temp entry sequence internally,
  // then fires this once every product has values -- page.tsx then submits.
  onLoaded: () => void;
  // Update Card, No Load: cancels the load, keeps today's terminal access.
  onUpdateCardOnly: () => void;
  // Report Terminal Issue: hands off to CancelLoadSheet's report flow.
  onReportTerminalIssue: () => void;
  // Back to Planner: genuinely undoes the load + re-card (page.tsx).
  onBackToPlanner: () => void;

  // Disables the action buttons + relabels Log the Load while completing.
  loadedDisabled?: boolean;
  loadedLabel?: string;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;

  // Safety-confirmation block -- equipment/location identification shown
  // before a driver commits to a load.
  equipmentLabel?: string | null;
  terminalLabel?: string | null;
  // Tapping the terminal name opens the shared location/terminal picker
  // without leaving this modal (mid-load switch flow, see page.tsx).
  onTapTerminal?: () => void;
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
    productNameById,
    productHexCodeById,
    productInputs,
    setProductApi,
    setProductTemp,
    onSetCompartmentGallons,
    persistedCapForComp,
    livePreviewGrossLbs,
    livePreviewDiffLbs,
    onLoaded,
    onUpdateCardOnly,
    onReportTerminalIssue,
    onBackToPlanner,
    loadedDisabled,
    loadedLabel,
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

  // Distinct products in the plan, in a stable order -- the Log-the-Load
  // API/Temp sequence walks these one at a time.
  const productGroups = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of plannedLines) {
      if (!seen.has(line.productId)) { seen.add(line.productId); out.push(line.productId); }
    }
    return out.sort((a, b) => {
      const an = productNameById.get(a) ?? a;
      const bn = productNameById.get(b) ?? b;
      return String(an).localeCompare(String(bn));
    });
  }, [plannedLines, productNameById]);

  // ── Phase-1 gallons tap-to-adjust overlay (unchanged) ───────────────────
  const [gallonsTarget, setGallonsTarget] = useState<{ comp: number; productId: string } | null>(null);
  const [gallonsInput, setGallonsInput] = useState("");
  const gallonsCap = gallonsTarget ? persistedCapForComp?.(gallonsTarget.comp) ?? null : null;

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

  // ── Log the Load: per-product API/Temp entry sequence ───────────────────
  const [logSeqIndex, setLogSeqIndex] = useState<number | null>(null);
  const [seqApi, setSeqApi] = useState("");
  const [seqTemp, setSeqTemp] = useState("");
  const [awaitingComplete, setAwaitingComplete] = useState(false);

  // Reset all sequence state whenever the modal closes, so a re-open never
  // resumes a half-finished sequence from a previous load.
  useEffect(() => {
    if (!open) {
      setLogSeqIndex(null);
      setAwaitingComplete(false);
      setGallonsTarget(null);
    }
  }, [open]);

  // Load the current sequence step's prefill (API from last-observed, Temp
  // from the plan's predicted temp -- both already seeded into productInputs
  // at begin_load) into the overlay inputs.
  useEffect(() => {
    if (logSeqIndex == null) return;
    const pid = productGroups[logSeqIndex];
    if (!pid) return;
    const pi = productInputs[pid];
    setSeqApi(pi?.api ? String(pi.api) : "");
    setSeqTemp(pi?.tempF != null ? Number(pi.tempF).toFixed(1) : "");
    // Intentionally keyed on the index only -- re-seeding on every
    // productInputs change would clobber what the driver is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logSeqIndex]);

  // Once the last product has been committed, wait until page.tsx's
  // productInputs prop actually reflects every entry before firing onLoaded
  // (which reads productInputs) -- avoids submitting with the final edit
  // still pending in state.
  useEffect(() => {
    if (!awaitingComplete) return;
    const allReady = productGroups.every((pid) => {
      const pi = productInputs[pid];
      return pi && String(pi.api ?? "").trim() !== "" && pi.tempF != null && Number.isFinite(Number(pi.tempF));
    });
    if (allReady) {
      setAwaitingComplete(false);
      onLoaded();
    }
  }, [awaitingComplete, productInputs, productGroups, onLoaded]);

  function startLogSequence() {
    if (productGroups.length === 0) { onLoaded(); return; }
    setLogSeqIndex(0);
  }
  function cancelLogSequence() {
    setLogSeqIndex(null);
  }
  function commitLogStep() {
    if (logSeqIndex == null) return;
    const pid = productGroups[logSeqIndex];
    if (!pid) { setLogSeqIndex(null); return; }
    const apiN = parseFloat(seqApi);
    if (Number.isFinite(apiN)) setProductApi(pid, apiN.toFixed(1));
    const tempN = parseFloat(seqTemp);
    if (Number.isFinite(tempN)) setProductTemp(pid, parseFloat(tempN.toFixed(1)));

    const isLast = logSeqIndex >= productGroups.length - 1;
    if (isLast) {
      setLogSeqIndex(null);
      setAwaitingComplete(true);
    } else {
      setLogSeqIndex(logSeqIndex + 1);
    }
  }

  const showLivePreview = livePreviewGrossLbs != null;
  const overTarget = livePreviewDiffLbs != null && livePreviewDiffLbs > 0;

  const totalPlannedGallons = useMemo(
    () => plannedLines.reduce((sum, x) => sum + x.gallons, 0),
    [plannedLines]
  );

  const seqPid = logSeqIndex != null ? productGroups[logSeqIndex] : null;
  const seqDot = seqPid ? ((productHexCodeById?.[seqPid] && String(productHexCodeById[seqPid]).trim()) || "rgba(255,255,255,0.5)") : undefined;
  const seqLabel = seqPid ? (productNameById.get(seqPid) ?? seqPid) : "";
  const seqSubmitLabel = logSeqIndex != null && logSeqIndex < productGroups.length - 1 ? "Next" : "Log Load";

  const busy = Boolean(loadedDisabled) || awaitingComplete;

  return (
    <FullscreenModal open={open} title="Plan Review" onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* Safety-confirmation block -- Terminal left (white/bold, tappable),
            Equipment right. */}
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

        {/* Compartments -- clean: dot + full product label + gallons.
            Gallons stay tap-to-adjust (react to a stale reading by loading
            one compartment light without redistributing to siblings). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>Planned compartments</div>

          {plannedLines.length === 0 ? (
            <div style={styles.help}>No filled compartments in the plan.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {plannedLines.map((x) => {
                const dotColor = (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
                const label = productNameById.get(x.productId) ?? x.productId;
                return (
                  <div
                    key={`${x.comp}-${x.productId}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 12px", borderRadius: 10,
                      border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", flexShrink: 0, width: 24 }}>C{x.comp}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {label}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGallonsOverlay(x.comp, x.productId, x.gallons)}
                      style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", textAlign: "right" as const, flexShrink: 0 }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>GAL</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{Math.round(x.gallons)}</div>
                    </button>
                  </div>
                );
              })}

              {/* Total -- plain summary line, not another compartment. */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>{Math.round(totalPlannedGallons)} gal</span>
              </div>
            </div>
          )}
        </div>

        {/* Live weight / diff-vs-target preview -- plan density (API/Temp are
            entered later at Log the Load). Same math the final submission
            uses, so it can never disagree with the recap. */}
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

        {/* Action buttons -- the "next steps" that used to live in a separate
            sheet, now directly in the modal. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={startLogSequence}
            disabled={busy}
            style={{ ...(styles as any).doneBtn, opacity: busy ? 0.55 : 1, width: "100%" }}
          >
            {awaitingComplete || loadedDisabled ? (loadedLabel ?? "Saving…") : "Log the Load"}
          </button>

          <button
            type="button"
            onClick={onUpdateCardOnly}
            disabled={busy}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 10,
              border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
              color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: busy ? 0.55 : 1,
            }}
          >
            Update Card, No Load
          </button>

          <button
            type="button"
            onClick={onReportTerminalIssue}
            disabled={busy}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 10,
              border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
              color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: busy ? 0.55 : 1,
            }}
          >
            Report Terminal Issue
          </button>

          <button
            type="button"
            onClick={onBackToPlanner}
            disabled={busy}
            style={{
              width: "100%", padding: "10px 0",
              borderRadius: 6, border: "none", background: "transparent",
              color: "rgba(255,255,255,0.40)", fontSize: 13, fontWeight: 700, cursor: "pointer",
              opacity: busy ? 0.55 : 1,
            }}
          >
            Back to Planner
          </button>
        </div>
      </div>

      {/* Gallons tap-to-adjust */}
      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `C${gallonsTarget.comp} Gallons` : "Gallons"}
        fields={[{ key: "gallons", label: "Gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Max ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

      {/* Log the Load: one product at a time, dot + label at the top. */}
      <ValueEntryOverlay
        open={logSeqIndex != null}
        title={seqLabel}
        dotColor={seqDot}
        fields={[
          { key: "api", label: "API", value: seqApi, onChange: setSeqApi, decimal: true },
          { key: "temp", label: "Temp", value: seqTemp, onChange: setSeqTemp, suffix: "°F", decimal: true },
        ]}
        hint={productGroups.length > 1 && logSeqIndex != null ? `Product ${logSeqIndex + 1} of ${productGroups.length}` : undefined}
        onCancel={cancelLogSequence}
        onSubmit={commitLogStep}
        submitLabel={seqSubmitLabel}
      />
    </FullscreenModal>
  );
}
