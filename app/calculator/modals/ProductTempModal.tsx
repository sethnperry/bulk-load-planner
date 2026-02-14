"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

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

export default function ProductTempModal(props: {
  open: boolean;
  onClose: () => void;

  styles: Styles;

  selectedCity: string;
  selectedState: string;

  ambientTempLoading: boolean;
  ambientTempF: number | null;

  tempF: number;
  setTempF: React.Dispatch<React.SetStateAction<number>>;

  TempDial: React.ComponentType<TempDialProps>;
}) {
  const {
    open,
    onClose,
    styles,
    selectedCity,
    selectedState,
    ambientTempLoading,
    ambientTempF,
    tempF,
    setTempF,
    TempDial,
  } = props;

  return (
    <FullscreenModal open={open} title="Product Temp" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            textAlign: "center",
            fontWeight: 800,
            letterSpacing: 0.2,
            userSelect: "none",
          }}
        >
          <span style={{ color: "white" }}>
            {selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : "City, ST"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.50)" }}>{" "} - {" "}</span>
          <span style={{ color: "rgb(0,194,216)" }}>
            {ambientTempLoading ? "Loading…" : ambientTempF == null ? "—" : `${Math.round(ambientTempF)}°F`}
          </span>
        </div>

        <TempDial value={tempF} min={-20} max={140} step={0.1} onChange={(v) => setTempF(v)} />

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.5) * 10) / 10)}
          >
            −0.5
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.1) * 10) / 10)}
          >
            −0.1
          </button>
          <button type="button" style={styles.smallBtn} onClick={() => setTempF(60)} title="Snap back to 60°F">
            60°
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.1) * 10) / 10)}
          >
            +0.1
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.5) * 10) / 10)}
          >
            +0.5
          </button>
        </div>

        {/* Quick reference (time-of-day guidance) */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Quick reference</div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Daylight (sun / warm tanks)</div>
              <div style={{ ...styles.help, marginTop: 0 }}>
                Start near <strong>Ambient + 5°F</strong>. If you’re loading mid-afternoon in full sun,{" "}
                <strong>+8–10°F</strong> is often a better proxy.
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Night (cooldown / shaded)</div>
              <div style={{ ...styles.help, marginTop: 0 }}>
                Start near <strong>Ambient − 2°F</strong> (or simply Ambient). If tanks are cold-soaked,{" "}
                <strong>−3–5°F</strong> can be reasonable.
              </div>
            </div>
          </div>

          <div style={{ ...styles.help, marginTop: 0 }}>
            If unsure: use <strong>Ambient</strong>, then adjust based on how the product has been stored (sun vs shade,
            recent loading cycles, etc.).
          </div>
        </div>
      </div>
    </FullscreenModal>
  );
}
