"use client";
// app/studio/page.tsx
// Internal recording tool, not linked from any nav -- reachable only by
// going directly to /studio. Purpose: let the mobile app be screen-recorded
// running natively on a desktop browser (resize-to-mobile-width, not phone
// mirroring) inside the same phone frame built for the landing page
// (app/page.tsx's .phone/.phone-btn-*/.dynamic-island, copied verbatim
// below), floating on white, next to a black caption panel you can type
// walkthrough narration into live while recording. The stage below the
// control bar is a fixed pixel size on purpose -- so a screen-recorder's
// capture region only has to be drawn once and stays correct next time.
//
// The iframe is a real, live, tappable instance of the actual app (whatever
// path is typed into the bar above) -- same-origin, so an existing login
// session is shared automatically; no separate auth needed here.

import { useRef, useState } from "react";

const DEFAULT_PATH = "/planner";
const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 812;

export default function StudioPage() {
  const [path, setPath] = useState(DEFAULT_PATH);
  const [pendingPath, setPendingPath] = useState(DEFAULT_PATH);
  const [caption, setCaption] = useState("");
  const [showIsland, setShowIsland] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  function go(e?: React.FormEvent) {
    e?.preventDefault();
    const p = pendingPath.trim() || "/";
    setPath(p.startsWith("/") ? p : `/${p}`);
  }

  function reload() {
    const el = iframeRef.current;
    if (el) el.src = el.src;
  }

  function toggleFocusMode() {
    // Flip the layout state immediately, synchronously -- fullscreen is a
    // best-effort bonus, not a gate. requestFullscreen()'s promise can sit
    // unresolved (never resolves or rejects) in some automation/headless
    // contexts, and even on a real browser it's not guaranteed; either way
    // "hide the control bar" shouldn't be stuck waiting on it.
    if (!focusMode) {
      setFocusMode(true);
      stageRef.current?.parentElement?.requestFullscreen?.().catch(() => {});
    } else {
      setFocusMode(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  return (
    <div className="studio-root">
      {!focusMode && (
        <form className="controls" onSubmit={go}>
          <span className="controls-label">Path</span>
          <input
            className="path-input"
            value={pendingPath}
            onChange={(e) => setPendingPath(e.target.value)}
            placeholder="/planner"
          />
          <button type="submit" className="btn">Go</button>
          <button type="button" className="btn" onClick={reload}>Reload</button>
          <label className="island-toggle">
            <input type="checkbox" checked={showIsland} onChange={(e) => setShowIsland(e.target.checked)} />
            Notch
          </label>
          <button type="button" className="btn" onClick={() => setCaption("")}>Clear caption</button>
          <button type="button" className="btn btn-primary" onClick={toggleFocusMode}>Present</button>
        </form>
      )}

      <div className="stage-wrap">
        <div className="stage" ref={stageRef}>
          <div className="phone">
            {showIsland && <div className="dynamic-island" />}
            <div className="phone-btn phone-btn-mute" />
            <div className="phone-btn phone-btn-vol-up" />
            <div className="phone-btn phone-btn-vol-down" />
            <div className="phone-btn phone-btn-power" />
            <div className="screen">
              <iframe
                ref={iframeRef}
                key={path}
                src={path}
                title="App preview"
                style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT, border: "none", display: "block" }}
              />
            </div>
          </div>

          <div className="caption-panel">
            <textarea
              className="caption-text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Type your instructions here…"
              spellCheck={false}
            />
          </div>
        </div>

        {focusMode && (
          <button type="button" className="exit-focus" onClick={toggleFocusMode}>
            Exit present mode
          </button>
        )}
      </div>

      <style jsx global>{`
        .studio-root {
          min-height: 100dvh;
          background: #e8e8e6;
          font-family: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
          width: 100%;
          box-sizing: border-box;
          background: #ffffff;
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .controls-label {
          font: 700 12px var(--font-outfit), sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .path-input {
          font: 500 14px var(--font-outfit), sans-serif;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.15);
          width: 220px;
          outline: none;
        }
        .path-input:focus { border-color: rgba(0,0,0,0.4); }
        .btn {
          font: 700 13px var(--font-outfit), sans-serif;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.15);
          background: #f2f2f0;
          color: #111;
          cursor: pointer;
        }
        .btn:hover { background: #e8e8e6; }
        .btn-primary { background: #111; color: #fff; border-color: #111; margin-left: auto; }
        .btn-primary:hover { opacity: 0.85; background: #111; }
        .island-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font: 600 13px var(--font-outfit), sans-serif;
          color: rgba(0,0,0,0.55);
          cursor: pointer;
          user-select: none;
        }

        .stage-wrap {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          box-sizing: border-box;
        }

        /* Fixed pixel size on purpose -- draw your recording region once
           against this box and it'll be the same box every time. */
        .stage {
          width: 799px;
          height: 828px;
          background: #ffffff;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 48px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .phone {
          position: relative;
          flex-shrink: 0;
          width: ${PHONE_WIDTH + 16}px;
          background: linear-gradient(160deg, #4a4a4d 0%, #232326 40%, #0c0c0d 100%);
          border-radius: 46px;
          padding: 8px;
          box-shadow:
            0 32px 60px rgba(0,0,0,0.28),
            0 10px 22px rgba(0,0,0,0.18),
            inset 0 0 0 1px rgba(255,255,255,0.10),
            inset 0 1px 1px rgba(255,255,255,0.18);
        }
        .phone-btn {
          position: absolute;
          background: linear-gradient(90deg, #3d3d40, #1c1c1e);
          border-radius: 2px;
          z-index: 0;
        }
        .phone-btn-mute { left: -3px; top: 13%; width: 3px; height: 3.2%; }
        .phone-btn-vol-up { left: -3px; top: 19.5%; width: 3px; height: 5.5%; }
        .phone-btn-vol-down { left: -3px; top: 27%; width: 3px; height: 5.5%; }
        .phone-btn-power { right: -3px; top: 17%; width: 3px; height: 8.5%; }
        .screen { position: relative; background: #111111; border-radius: 40px; overflow: hidden; line-height: 0; }
        .dynamic-island {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          width: 84px;
          height: 24px;
          background: #000;
          border-radius: 14px;
          z-index: 2;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }

        .caption-panel {
          flex-shrink: 0;
          width: 300px;
          height: ${PHONE_HEIGHT + 16}px;
          background: #111111;
          border-radius: 24px;
          padding: 32px 28px;
          box-sizing: border-box;
          display: flex;
        }
        .caption-text {
          width: 100%;
          height: 100%;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: #ffffff;
          font: 500 26px/1.5 var(--font-outfit), sans-serif;
          letter-spacing: -0.01em;
        }
        .caption-text::placeholder { color: rgba(255,255,255,0.28); }

        .exit-focus {
          position: fixed;
          bottom: 20px;
          right: 20px;
          font: 700 13px var(--font-outfit), sans-serif;
          padding: 10px 16px;
          border-radius: 999px;
          border: none;
          background: rgba(0,0,0,0.7);
          color: #fff;
          cursor: pointer;
          z-index: 50;
        }

        @media (max-width: 880px) {
          .stage { transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
