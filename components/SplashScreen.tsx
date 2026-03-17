// components/SplashScreen.tsx
// Full-screen animated splash shown while app is loading.
// Usage: render conditionally until your auth/data is ready.
//
// <SplashScreen />

"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"spin" | "settle" | "fade">("spin");

  useEffect(() => {
    // Spin for 900ms, then settle, then fade out
    const t1 = setTimeout(() => setPhase("settle"), 900);
    const t2 = setTimeout(() => setPhase("fade"), 1300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#111111",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        transition: phase === "fade" ? "opacity 0.4s ease" : "none",
        opacity: phase === "fade" ? 0 : 1,
        pointerEvents: phase === "fade" ? "none" : "all",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          animation:
            phase === "spin"
              ? "pt-flip 0.9s ease-in-out"
              : "none",
        }}
      >
        <svg
          viewBox="0 0 100 92.1"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "100%", height: "100%" }}
        >
          <path
            d="M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z"
            fill="white"
          />
        </svg>
      </div>

      <div
        style={{
          marginTop: 20,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "rgba(255,255,255,0.30)",
          textTransform: "uppercase",
          opacity: phase === "spin" ? 0 : 1,
          transition: "opacity 0.3s ease 0.1s",
        }}
      >
        ProTankr
      </div>

      <style>{`
        @keyframes pt-flip {
          0%   { transform: perspective(400px) rotateY(0deg); }
          40%  { transform: perspective(400px) rotateY(-180deg) scaleX(0.85); }
          70%  { transform: perspective(400px) rotateY(-340deg) scaleX(1.05); }
          100% { transform: perspective(400px) rotateY(-360deg) scaleX(1); }
        }
      `}</style>
    </div>
  );
}
