"use client";
// modals/ProductTempModal.tsx

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { FuelTempConfidence } from "../hooks/useFuelTempPrediction";

type Styles = {
  smallBtn: React.CSSProperties;
  help: React.CSSProperties;
};

type TempDialProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

function ConfidenceDot({ confidence }: { confidence: FuelTempConfidence | null }) {
  if (!confidence) return null;
  const map = {
    high:   { color: "#4ade80", label: "HIGH CONFIDENCE" },
    medium: { color: "#fbbf24", label: "MEDIUM CONFIDENCE" },
    low:    { color: "#f87171", label: "LOW CONFIDENCE" },
  };
  const s = map[confidence];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: s.color, letterSpacing: 0.6 }}>{s.label}</span>
    </span>
  );
}

function PredictionBanner({
  loading, error, predictedTempF, confidence, currentTempF, onAccept,
}: {
  loading: boolean;
  error: string | null;
  predictedTempF: number | null;
  confidence: FuelTempConfidence | null;
  currentTempF: number;
  onAccept: (v: number) => void;
}) {
  const isAccepted = predictedTempF != null && Math.abs(currentTempF - predictedTempF) < 0.15;

  if (loading) {
    return (
      <div style={{
        borderRadius: 12, border: "1px solid rgba(103,232,249,0.15)",
        background: "rgba(103,232,249,0.04)", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          border: "2px solid rgba(103,232,249,0.15)", borderTopColor: "#67e8f9",
          animation: "ptSpin 0.8s linear infinite",
        }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
            Predicting product temp…
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            Fetching 30h weather · running thermal model
          </div>
        </div>
        <style>{`@keyframes ptSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || predictedTempF == null) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: isAccepted ? "1px solid rgba(74,222,128,0.25)" : "1px solid rgba(103,232,249,0.22)",
      background: isAccepted ? "rgba(74,222,128,0.06)" : "rgba(103,232,249,0.06)",
      padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 0.6 }}>
            PREDICTED PRODUCT TEMP
          </span>
          <ConfidenceDot confidence={confidence} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: isAccepted ? "#4ade80" : "#67e8f9", lineHeight: 1 }}>
            {predictedTempF.toFixed(1)}°F
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            conservative · errs cold
          </span>
        </div>
      </div>
      {isAccepted ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: "#4ade80", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>✓</span> APPLIED
        </div>
      ) : (
        <button type="button" onClick={() => onAccept(predictedTempF)} style={{
          background: "rgba(103,232,249,0.12)", border: "1px solid rgba(103,232,249,0.28)",
          borderRadius: 8, padding: "8px 16px", color: "#67e8f9",
          fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          USE THIS
        </button>
      )}
    </div>
  );
}

function HowWePredictSection({ confidence }: { confidence: FuelTempConfidence | null }) {
  const card = (emoji: string, title: string, body: React.ReactNode) => (
    <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
        {emoji}{"  "}{title}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>{body}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, color: "rgba(255,255,255,0.85)" }}>
        How this prediction works
      </div>

      {card("🌤", "30 hours of weather history",
        "We pull hourly temperature, wind speed, and cloud cover from OpenWeather for the past 24–30 hours at this terminal's location. This gives the model a full picture of how the environment has been heating or cooling the storage tank."
      )}

      {card("☀️", "Solar gain calculation",
        <>Using the terminal's exact latitude and longitude, we calculate the sun's elevation angle for every hour of the past day. Higher sun angle + clear skies = more radiant heat absorbed by the tank surface. Overcast or nighttime hours contribute zero solar gain.</>
      )}

      {card("🌬", "Wind cooling adjustment",
        "Wind accelerates how quickly product temperature chases the ambient air. Higher wind speeds increase the effective cooling rate, pulling the prediction closer to ambient on breezy days and reducing the impact of solar heating."
      )}

      {card("🛢", "Large tank model — intentionally conservative",
        <>We model a large above-ground storage tank (~1 million gallons). Large tanks have enormous thermal mass — they heat and cool very slowly, lagging well behind ambient swings. This is <strong style={{ color: "rgba(255,255,255,0.65)" }}>intentional</strong>: we'd rather predict the product is colder and denser than it turns out to be, which keeps you safely under your weight limit.</>
      )}

      {card("🌡", "Live ambient blending",
        <>The <strong style={{ color: "rgba(255,255,255,0.65)" }}>current ambient temp</strong> shown at the top is gently blended into the final result to account for the last few minutes of temperature change. This keeps the prediction current without overreacting to short-term spikes.</>
      )}

      {confidence && card(
        confidence === "high" ? "✅" : confidence === "medium" ? "⚠️" : "❗",
        "Confidence explained",
        <>
          <ConfidenceDot confidence={confidence} />
          <span style={{ marginLeft: 6 }}>
            {confidence === "high" &&
              " — Clear skies and calm winds over the past 24h. Solar gain was predictable and the model is well-constrained. This is as accurate as this approach gets."}
            {confidence === "medium" &&
              " — Partly cloudy over the past 24h. Cloud variability introduces some uncertainty in how much solar heat the tank absorbed. Solid estimate — trust your experience if conditions were unusual."}
            {confidence === "low" &&
              " — Heavy cloud cover or high winds over the past 24h. These conditions are harder to model. Use the number as a starting point but lean on what you know about this terminal."}
          </span>
        </>
      )}

      <div style={{
        fontSize: 13, fontWeight: 500, lineHeight: 1.65,
        color: "#fdba74",
        background: "rgba(251,146,60,0.08)",
        border: "1px solid rgba(251,146,60,0.22)",
        borderLeft: "3px solid #fb923c",
        borderRadius: "0 10px 10px 0",
        padding: "10px 14px",
        marginTop: 2,
      }}>
        <strong style={{ color: "#fb923c", fontWeight: 900 }}>⚠ Use your judgement.</strong> Override the prediction freely using the dial — you know your terminal better than any model. However, it is strongly recommended <strong style={{ color: "#fb923c" }}>not to set the planned product temp above ambient</strong> unless you have full confidence from a recent BOL. When in doubt, err on the side of caution and keep your planned temp colder than ambient. A colder planned temp predicts denser product, which protects you from overweight loads.
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ProductTempModal(props: {
  open: boolean;
  onClose: () => void;
  styles: Styles;
  selectedCity: string;
  selectedState: string;
  selectedTerminalId?: string | null;
  locationLat?: number | null;
  locationLon?: number | null;
  ambientTempLoading: boolean;
  ambientTempF: number | null;
  tempF: number;
  setTempF: React.Dispatch<React.SetStateAction<number>>;
  predictedFuelTempF?: number | null;
  fuelTempConfidence?: FuelTempConfidence | null;
  fuelTempLoading?: boolean;
  TempDial: React.ComponentType<TempDialProps>;
}) {
  const {
    open, onClose, styles,
    selectedCity, selectedState,
    ambientTempLoading, ambientTempF,
    tempF, setTempF, TempDial,
    predictedFuelTempF = null,
    fuelTempConfidence = null,
    fuelTempLoading = false,
  } = props;

  // Auto-apply is fully handled by page.tsx.
  // Modal just displays the current tempF (already predicted or user-set)
  // and lets the driver override with the dial.

  return (
    <FullscreenModal open={open} title="Product Temp" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>

        <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 0.2, userSelect: "none" }}>
          <span style={{ color: "white" }}>
            {selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : "City, ST"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.50)" }}>{" "} - {" "}</span>
          <span style={{ color: "rgb(0,194,216)" }}>
            {ambientTempLoading ? "Loading…" : ambientTempF == null ? "—" : `${Math.round(ambientTempF)}°F ambient`}
          </span>
        </div>

        <PredictionBanner
          loading={fuelTempLoading}
          error={null}
          predictedTempF={predictedFuelTempF}
          confidence={fuelTempConfidence}
          currentTempF={tempF}
          onAccept={(v) => setTempF(v)}
        />

        <TempDial value={tempF} min={-20} max={140} step={0.1} onChange={(v) => setTempF(v)} />

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.5) * 10) / 10)}>−0.5</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.1) * 10) / 10)}>−0.1</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF(60)} title="Snap to 60°F">60°</button>
          {predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) > 0.15 && (
            <button type="button"
              style={{ ...styles.smallBtn, color: "#67e8f9", borderColor: "rgba(103,232,249,0.3)" }}
              onClick={() => setTempF(predictedFuelTempF)}
              title="Snap to predicted temp">
              {predictedFuelTempF.toFixed(1)}°
            </button>
          )}
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.1) * 10) / 10)}>+0.1</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.5) * 10) / 10)}>+0.5</button>
        </div>

        <HowWePredictSection confidence={fuelTempConfidence} />

      </div>
    </FullscreenModal>
  );
}
