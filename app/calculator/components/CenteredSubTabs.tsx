"use client";
// app/calculator/components/CenteredSubTabs.tsx
//
// Generic "selected item scrolls to center" tab row -- the same scroll-snap
// mechanic CalculatorLayoutClient's TabBar and sections/PresetDial each
// already implement independently, extracted here since this is now the
// third place that needs it (role-tab subtabs: Dashboard/Tasks/Ledger for
// Lead, and the same shape for Dispatch/Admin later). Deliberately simpler
// than PresetDial -- no long-press/save-slot semantics, just tap-to-select
// plus scroll-to-center.

import React, { useEffect, useRef } from "react";

export type CenteredSubTab = { id: string; label: string };

type Props = {
  tabs: CenteredSubTab[];
  activeId: string;
  onChange: (id: string) => void;
  accentColor?: string;
};

export default function CenteredSubTabs({ tabs, activeId, onChange, accentColor = "#67e8f9" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressScrollNavRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const centerTab = (id: string, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressScrollNavRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressScrollNavRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerTab(activeId, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { centerTab(activeId, true); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    if (suppressScrollNavRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let best = 0, bestDist = Infinity;
      Array.from(container.children).forEach((child, i) => {
        const r = (child as HTMLElement).getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - centerX);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      const id = tabs[best]?.id;
      if (id && id !== activeId) onChange(id);
    }, 80);
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="pt-tabscroll"
      style={{
        display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory",
        padding: "0 calc(50% - 60px)", WebkitOverflowScrolling: "touch",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <div
            key={t.id}
            onClick={() => { if (t.id !== activeId) onChange(t.id); else centerTab(t.id, true); }}
            style={{ flex: "0 0 120px", scrollSnapAlign: "center", display: "flex", justifyContent: "center", cursor: "pointer" }}
          >
            <div style={{
              padding: "10px 2px",
              font: isActive ? "600 15px Outfit" : "400 14px Outfit",
              color: isActive ? accentColor : "rgba(255,255,255,0.4)",
              transition: "all 150ms ease",
            }}>
              {t.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
