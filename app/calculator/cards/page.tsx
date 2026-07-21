"use client";
// app/calculator/cards/page.tsx
//
// Phase 6 of the "ProTankr mobile app design" handoff: city-grouped terminal
// card wallet, built against the same `my_terminals_with_status` data
// (shell.terminals.terminals) and `user_terminal_cards` data
// (shell.cardDataByTerminalId) the Planner tab already uses -- both are
// shared via CalculatorShellContext so there's no second, independently
// hydrated copy of either.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { formatMDYWithCountdown_, isPastISO_ } from "../utils/dates";

// ── Gradient + masking helpers ─────────────────────────────────────────────

const GRADIENTS: [string, string][] = [
  ["#1a3a5c", "#2f6aa8"], ["#1a3a2a", "#2f8a54"], ["#3a1a2a", "#a03a5a"],
  ["#2a2a1a", "#a58a2a"], ["#2a1a3a", "#5a3aa0"], ["#1a3a3a", "#2f9aa8"],
  ["#3a2a1a", "#a86a2a"], ["#2a1a1a", "#a03a3a"],
];

function gradientFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function maskCardNumber(num: string): string {
  const digits = num.replace(/\s+/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return `•••• ${digits}`;
  return `•••• ${digits.slice(-4)}`;
}

// ── City selector — same centered-dial carousel pattern as the tab bar ────

function CitySelector({ cities, selected, onSelect }: { cities: string[]; selected: string; onSelect: (c: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const centerCity = (city: string, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = cities.indexOf(city);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerCity(selected, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { centerCity(selected, true); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    if (suppressRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let best = 0, bestDist = Infinity;
      Array.from(container.children).forEach((child, i) => {
        const r = (child as HTMLElement).getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - centerX);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      const city = cities[best];
      if (city && city !== selected) onSelect(city);
    }, 80);
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="pt-tabscroll"
      style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 calc(50% - 50px)", WebkitOverflowScrolling: "touch" }}
    >
      {cities.map((c) => {
        const isActive = c === selected;
        return (
          <div
            key={c}
            onClick={() => { if (c !== selected) onSelect(c); else centerCity(c, true); }}
            style={{ flex: "0 0 100px", scrollSnapAlign: "center", display: "flex", justifyContent: "center", cursor: "pointer" }}
          >
            <div style={{
              padding: "8px 2px",
              font: isActive ? "500 13px Outfit" : "400 11px Outfit",
              color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
              transition: "all 150ms ease", whiteSpace: "nowrap" as const,
            }}>
              {c}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Cards tab ───────────────────────────────────────────────────────────────

export default function CardsPage() {
  const shell = useCalculatorShell();
  const { terminals, location, cardDataByTerminalId } = shell;

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const t of terminals.terminals ?? []) {
      if ((t as any).city) set.add(String((t as any).city));
    }
    return Array.from(set).sort();
  }, [terminals.terminals]);

  const [selectedCity, setSelectedCity] = useState("");

  useEffect(() => {
    if (selectedCity && cities.includes(selectedCity)) return;
    const initial = (location.selectedCity && cities.includes(location.selectedCity)) ? location.selectedCity : (cities[0] ?? "");
    setSelectedCity(initial);
  }, [cities]); // eslint-disable-line react-hooks/exhaustive-deps

  const terminalsInCity = useMemo(
    () => (terminals.terminals ?? []).filter((t: any) => String(t.city ?? "") === selectedCity),
    [terminals.terminals, selectedCity]
  );

  if (cities.length === 0) {
    return (
      <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px", lineHeight: 1.5 }}>
        No starred terminals yet.<br />Star a terminal from the Planner to see its card here.
      </div>
    );
  }

  return (
    <div>
      <CitySelector cities={cities} selected={selectedCity} onSelect={setSelectedCity} />

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {terminalsInCity.map((t: any) => {
          const tid = String(t.terminal_id);
          const card = cardDataByTerminalId[tid];
          const [g1, g2] = gradientFor(String(t.terminal_name ?? tid));

          const statusColor = t.status === "valid" ? "#4ade80" : t.status === "expired" ? "#ef4444" : "rgba(255,255,255,0.55)";
          const statusLabel = t.status === "valid" ? "Active" : t.status === "expired" ? "Expired" : "Not carded";

          const expiresISO = terminals.terminalDisplayInfo(t, tid);
          const expiryText = expiresISO
            ? (isPastISO_(expiresISO) ? "Expired" : formatMDYWithCountdown_(expiresISO))
            : "—";

          return (
            <div key={tid} style={{
              borderRadius: 18, padding: 16,
              background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
              boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {t.terminal_name ?? "Terminal"}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: statusColor,
                  background: "rgba(0,0,0,0.28)", borderRadius: 999, padding: "3px 9px",
                  textTransform: "uppercase" as const, letterSpacing: 0.4, flexShrink: 0,
                }}>
                  {statusLabel}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                {t.city}{t.state ? `, ${t.state}` : ""}
              </div>

              <div style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 1.5, fontFamily: "monospace" }}>
                {card?.cardNumber ? maskCardNumber(card.cardNumber) : "No card on file"}
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>PIN</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>{card?.pin || "—"}</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Expires</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>{expiryText}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
