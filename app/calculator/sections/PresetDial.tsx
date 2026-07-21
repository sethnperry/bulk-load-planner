"use client";
// app/calculator/sections/PresetDial.tsx
//
// Preset letter dial (A-E) -- same centered-dial carousel pattern as the
// header tab bar / Cards city selector (scroll-snap, tap-to-center), sitting
// directly under the Planner/Cards/Vault tab bar per the design handoff.
// Tap-to-load / hold-to-save-or-clear / shift+click-to-clear are unchanged
// real behavior from usePlanSlots -- only scrolling/tapping to (re)center is
// new, and deliberately does NOT itself trigger a load: scrolling just
// previews which letter is centered, so a driver can't accidentally
// overwrite their working plan by swiping past a slot.

import React, { useEffect, useRef, useState } from "react";

export default function PresetDial({
  slots, slotHas, disabled, onLoad, onSave, onClear, onTourAdvance, onActiveChange,
}: {
  slots: readonly number[];
  slotHas: Record<number, boolean>;
  disabled: boolean;
  onLoad: (n: number) => void;
  onSave: (n: number) => void;
  onClear: (n: number) => void;
  onTourAdvance?: (id: string) => void;
  onActiveChange?: (n: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<number>(slots[0] ?? 1);

  useEffect(() => { onActiveChange?.(active); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const centerSlot = (n: number, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = slots.indexOf(n);
    const el = container.children[idx] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    suppressRef.current = true;
    container.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => { suppressRef.current = false; }, smooth ? 400 : 50);
  };

  useEffect(() => { centerSlot(active, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const n = slots[best];
      if (n != null) setActive(n);
    }, 80);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="pt-tabscroll"
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory",
          padding: "0 calc(50% - 30px)", WebkitOverflowScrolling: "touch", width: "100%",
        }}
      >
        {slots.map((n) => {
          const has = !!slotHas[n];
          const isActive = n === active;

          // Tap to load (if saved), long-press to save/clear, shift+click to clear on desktop
          let pressTimer: ReturnType<typeof setTimeout> | null = null;
          let didLongPress = false;

          const onPressStart = () => {
            if (disabled) return;
            didLongPress = false;
            pressTimer = setTimeout(() => {
              didLongPress = true;
              if (has) onClear(n);
              else { onSave(n); onTourAdvance?.("tour-plan-slots"); }
            }, 600);
          };
          const onPressEnd = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          };
          const onTap = (e: React.MouseEvent) => {
            if (disabled || didLongPress) return;
            setActive(n);
            centerSlot(n, true);
            if (e.shiftKey && has) { onClear(n); return; }
            if (has) onLoad(n);
            else { onSave(n); onTourAdvance?.("tour-plan-slots"); }
          };

          return (
            <div key={n} style={{ flex: "0 0 60px", scrollSnapAlign: "center", display: "flex", justifyContent: "center" }}>
              <button
                type="button" disabled={disabled}
                id={n === 1 ? "tour-plan-slot-A" : undefined}
                onPointerDown={onPressStart}
                onPointerUp={onPressEnd}
                onPointerLeave={onPressEnd}
                onClick={onTap}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  border: "none", background: "transparent", padding: "3px 4px",
                  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                }}
                title={disabled ? "Select a terminal first" : has ? "Tap to load · Hold to clear · Shift+click to clear" : "Tap to save · Hold to save"}
              >
                <span style={{
                  font: isActive ? "600 15px Outfit" : "500 12px Outfit",
                  color: isActive ? "#fff" : has ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)",
                  transition: "color 150ms ease",
                }}>
                  {String.fromCharCode(64 + n)}
                </span>
                <span style={{
                  width: 4, height: 4, borderRadius: "50%", background: "#fff",
                  opacity: isActive ? 1 : 0, transition: "opacity 150ms ease",
                }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
