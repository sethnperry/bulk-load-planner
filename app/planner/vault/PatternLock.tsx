"use client";
// app/planner/vault/PatternLock.tsx
//
// Samsung-style 3x3 dot-pattern lock, replacing the Vault's old numeric
// PIN entry. Deliberately monochrome (white/gray only, no color) -- the
// PIN screen's plain 🔒 emoji was the one colorful thing in an otherwise
// black/white app, which read as clashing rather than "more secure."
// LockIcon below is the inline monochrome replacement for that emoji.
//
// Security model is unchanged from the PIN it replaces: this component
// only produces an ordered array of visited dot indices (e.g.
// [0,4,8,6,2]) -- the caller joins it into a string and runs it through
// the exact same sha256Hex()/user_vault_pin.pin_hash comparison the old
// PIN used. Nothing about how the lock is verified or stored changed,
// only what the user draws instead of types.

import React, { useMemo, useRef, useState } from "react";

const SIZE = 240;
const DOT_RADIUS = 9;
const HIT_RADIUS = 28; // generous touch target, independent of the drawn dot size
const MIN_DOTS = 4; // matches the real Android minimum

function dotCenters(size: number): { x: number; y: number }[] {
  const positions = [size / 6, size / 2, (5 * size) / 6];
  const out: { x: number; y: number }[] = [];
  for (const y of positions) for (const x of positions) out.push({ x, y });
  return out;
}

type Mode = "confirm" | "verify";

export default function PatternLock({
  mode,
  onComplete,
  size = SIZE,
  disabled = false,
}: {
  mode: Mode;
  onComplete: (path: number[]) => void;
  size?: number;
  disabled?: boolean;
}) {
  const centers = useMemo(() => dotCenters(size), [size]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [path, setPath] = useState<number[]>([]);
  const [activePos, setActivePos] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);

  // "confirm" mode's two-draw flow -- draw once, draw again, must match.
  const [stage, setStage] = useState<"first" | "second">("first");
  const [status, setStatus] = useState<string | null>(null);

  // Refs mirror path/drawing/stage/firstPath and are the actual source of
  // truth read inside the pointer handlers below. Real touch/mouse input
  // naturally spaces pointerdown/move/up out across separate browser
  // tasks (each gets its own React render before the next fires), so
  // reading state directly would normally be fine -- but a fast drag (or
  // synthetic/programmatic events, which is how this was actually caught:
  // dispatching a down+moves+up burst synchronously left `drawing` and
  // `path` reading their PRE-gesture closure values inside every handler
  // in that burst, since React hadn't committed a render between them --
  // handleMove's `if (!drawing) return` silently no-op'd for every move,
  // so only the initial down's dot ever registered) can hit the same
  // stale-closure gap for a real user too. Refs update synchronously and
  // are never subject to render-batching, so the actual gating/hit-test
  // logic can't go stale regardless of how tightly spaced the events are;
  // the state variables above exist purely to trigger a re-render for the
  // visual dot-fill/connecting-line output.
  const pathRef = useRef<number[]>([]);
  const drawingRef = useRef(false);
  const stageRef = useRef<"first" | "second">("first");
  const firstPathRef = useRef<number[] | null>(null);

  function pointFromEvent(e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function nearestUnvisitedDot(pos: { x: number; y: number }, current: number[]): number | null {
    for (let i = 0; i < centers.length; i++) {
      if (current.includes(i)) continue;
      const c = centers[i];
      const d = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (d <= HIT_RADIUS) return i;
    }
    return null;
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pos = pointFromEvent(e);
    const hit = nearestUnvisitedDot(pos, []);
    setStatus(null);
    if (hit != null) {
      pathRef.current = [hit];
      drawingRef.current = true;
      setPath(pathRef.current);
      setActivePos(pos);
      setDrawing(true);
    }
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current || disabled) return;
    const pos = pointFromEvent(e);
    setActivePos(pos);
    const hit = nearestUnvisitedDot(pos, pathRef.current);
    if (hit != null) {
      pathRef.current = [...pathRef.current, hit];
      setPath(pathRef.current);
    }
  }

  function finalizeDraw() {
    drawingRef.current = false;
    setDrawing(false);
    setActivePos(null);
    const finished = pathRef.current;
    if (finished.length === 0) return;
    if (finished.length < MIN_DOTS) {
      setStatus(`Connect at least ${MIN_DOTS} dots.`);
      pathRef.current = [];
      setPath([]);
      return;
    }

    if (mode === "verify") {
      onComplete(finished);
      pathRef.current = [];
      setPath([]);
      return;
    }

    // mode === "confirm"
    if (stageRef.current === "first") {
      firstPathRef.current = finished;
      pathRef.current = [];
      setPath([]);
      stageRef.current = "second";
      setStage("second");
      setStatus("Draw it again to confirm.");
      return;
    }

    // stage === "second"
    if (firstPathRef.current && finished.join("-") === firstPathRef.current.join("-")) {
      onComplete(finished);
      pathRef.current = [];
      setPath([]);
      firstPathRef.current = null;
      stageRef.current = "first";
      setStage("first");
      setStatus(null);
    } else {
      setStatus("Patterns didn't match — try again.");
      pathRef.current = [];
      setPath([]);
      firstPathRef.current = null;
      stageRef.current = "first";
      setStage("first");
    }
  }

  function handleUp() {
    if (disabled) return;
    finalizeDraw();
  }

  const visited = new Set(path);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 14 }}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        style={{ touchAction: "none", opacity: disabled ? 0.4 : 1 }}
      >
        {/* Connecting lines between visited dots */}
        {path.length > 1 && (
          <polyline
            points={path.map((i) => `${centers[i].x},${centers[i].y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Live segment from the last visited dot to the current pointer position */}
        {drawing && activePos && path.length > 0 && (
          <line
            x1={centers[path[path.length - 1]].x}
            y1={centers[path[path.length - 1]].y}
            x2={activePos.x}
            y2={activePos.y}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
        {centers.map((c, i) => {
          const isVisited = visited.has(i);
          return (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={DOT_RADIUS}
              fill={isVisited ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.10)"}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", minHeight: 16, textAlign: "center" as const }}>
        {status ?? (mode === "confirm" && stage === "second" ? "Draw it again to confirm." : "")}
      </div>
    </div>
  );
}

// Plain monochrome padlock -- replaces the old 🔒 emoji, whose native
// color rendering (gold/yellow body on most platforms) was the one
// colorful thing in this otherwise black/white app.
export function LockIcon({ size = 32, color = "rgba(255,255,255,0.85)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M8 10.5V7.5C8 5 9.8 3 12 3C14.2 3 16 5 16 7.5V10.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill={color} />
      <path d="M12 16.6V18.4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
