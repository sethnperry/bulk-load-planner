"use client";
// app/planner/cards/CardsSubTabs.tsx
//
// Cards now splits into three sub-tabs (Terminals | Badges | Credentials).
// Mirrors the main Planner/Cards/Vault TabBar in CalculatorLayoutClient.tsx
// exactly (scroll-snap carousel, active tab centered, three-segment
// underline) rather than a row of pill buttons -- this is a second-level
// tab row, not a filter/action row, so it should behave like one.

import React, { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const SUB_TABS = [
  { id: "terminals", label: "Terminals", href: "/planner/cards" },
  { id: "badges", label: "Badges", href: "/planner/cards/badges" },
  { id: "credentials", label: "Credentials", href: "/planner/cards/credentials" },
] as const;

function activeSubTabFor(pathname: string | null): typeof SUB_TABS[number]["id"] {
  if (pathname === "/planner/cards/badges") return "badges";
  if (pathname === "/planner/cards/credentials") return "credentials";
  return "terminals";
}

export default function CardsSubTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeSubTabFor(pathname);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollNavRef = useRef(false);

  const centerTab = (id: string, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = SUB_TABS.findIndex((t) => t.id === id);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressScrollNavRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressScrollNavRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerTab(active, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { centerTab(active, true); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const id = SUB_TABS[best]?.id;
      if (id && id !== active) router.push(SUB_TABS[best].href);
    }, 80);
  }

  return (
    <div style={{ marginBottom: 16, flexShrink: 0 }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="pt-tabscroll"
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory",
          padding: "0 calc(50% - 55px)", WebkitOverflowScrolling: "touch",
        }}
      >
        {SUB_TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              onClick={() => { if (t.id !== active) router.push(t.href); else centerTab(t.id, true); }}
              style={{ flex: "0 0 110px", scrollSnapAlign: "center", display: "flex", justifyContent: "center", cursor: "pointer" }}
            >
              <div style={{
                padding: "8px 2px",
                font: isActive ? "400 13px Outfit" : "400 11px Outfit",
                color: isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
                transition: "all 150ms ease",
              }}>
                {t.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
