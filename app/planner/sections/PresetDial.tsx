"use client";
// app/planner/sections/PresetDial.tsx
//
// Preset letter dial (A-E) -- same centered-dial carousel pattern as the
// header tab bar / Cards city selector (scroll-snap, tap-to-center), sitting
// directly under the Planner/Cards/Vault tab bar per the design handoff.
// Tap always acts immediately: an empty slot saves, a filled slot loads --
// no confirmation popup, per explicit user feedback after using the
// original tap-opens-a-sheet design in practice ("this window still pops
// up when we change presets, can we get rid of it?" -- 2026-08-04, directly
// reversing the 2026-08-06 rework's tap behavior). Management actions
// (Edit/Clear) move to long-press on a filled slot, which opens page.tsx's
// action sheet -- still there, just no longer in the way of the common
// "switch presets" gesture. Long-press on an empty slot still saves
// directly (nothing to protect). Scrolling to (re)center deliberately does
// NOT itself trigger any action -- it just previews which letter is
// centered, so swiping past a slot can't accidentally trigger anything.

import React, { useEffect, useRef, useState } from "react";

export default function PresetDial({
  slots, slotHas, disabled, disabledReason, onLoad, onOpenActions, onSave, onActiveChange, syncTo,
}: {
  slots: readonly number[];
  slotHas: Record<number, boolean>;
  disabled: boolean;
  // Shown in the disabled tooltip -- disabled can mean "no terminal yet" or
  // "still syncing this equipment's presets," which need different copy.
  // Defaults to the original terminal-only message so existing callers
  // that don't pass this keep working unchanged.
  disabledReason?: string;
  // Tapping a filled slot loads it immediately.
  onLoad: (n: number) => void;
  // Long-pressing a filled slot opens the management action sheet (Edit/Clear).
  onOpenActions: (n: number) => void;
  onSave: (n: number) => void;
  onActiveChange?: (n: number) => void;
  // One-shot external sync -- jumps the dial to this slot once, distinct
  // from normal tap/scroll (which manage `active` locally). Exists so the
  // highlighted letter can be told "the plan that was just restored into
  // the compartments actually came from preset B," e.g. right after a
  // fresh app open restores the last completed load -- without this, the
  // dial always defaulted to A regardless of which preset's plan had
  // actually been loaded.
  syncTo?: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<number>(slots[0] ?? 1);
  const appliedSyncRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (syncTo == null) return;
    if (appliedSyncRef.current === syncTo) return;
    appliedSyncRef.current = syncTo;
    setActive(syncTo);
    centerSlot(syncTo, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTo]);

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
              if (has) onOpenActions(n);
              else onSave(n);
            }, 600);
          };
          const onPressEnd = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          };
          const onTap = () => {
            if (disabled || didLongPress) return;
            setActive(n);
            centerSlot(n, true);
            // A filled slot loads immediately; an empty slot saves --
            // both act on a plain tap. Management actions (Edit/Clear) live
            // behind the long-press instead, see onPressStart above.
            if (has) onLoad(n);
            else onSave(n);
          };

          return (
            <div key={n} style={{ flex: "0 0 60px", scrollSnapAlign: "center", display: "flex", justifyContent: "center" }}>
              <button
                type="button" disabled={disabled}
                onPointerDown={onPressStart}
                onPointerUp={onPressEnd}
                onPointerLeave={onPressEnd}
                onClick={onTap}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  border: "none", background: "transparent", padding: "3px 4px",
                  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                }}
                title={disabled ? (disabledReason ?? "Select a terminal first") : has ? "Tap to load, hold for options" : "Tap to save"}
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
