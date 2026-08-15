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
//
// Script/steps: a pre-written sequence of caption texts (authored once in
// the script editor, blank-line-separated, persisted to localStorage) that
// Next/Prev step through -- lets you tap through the app at full speed and
// only pause to advance the caption, instead of typing narration live while
// also trying to demo taps. Next/Prev work identically in and out of
// Present mode, and via the Right/Left arrow keys too (ignored while
// actually typing in the path bar, caption box, or script editor, so the
// shortcut can't hijack normal typing).

import { useEffect, useRef, useState } from "react";

const DEFAULT_PATH = "/planner";
const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 812;
const SCRIPT_STORAGE_KEY = "protankr_studio_script_v1";

function parseSteps(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function StudioPage() {
  const [path, setPath] = useState(DEFAULT_PATH);
  const [pendingPath, setPendingPath] = useState(DEFAULT_PATH);
  const [caption, setCaption] = useState("");
  const [showIsland, setShowIsland] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Load any previously-saved script on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
      if (saved) {
        const parsed = parseSteps(saved);
        setScriptText(saved);
        setSteps(parsed);
        if (parsed.length) {
          setStepIndex(0);
          setCaption(parsed[0]);
        }
      }
    } catch {}
  }, []);

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

  function saveScript() {
    const parsed = parseSteps(scriptText);
    setSteps(parsed);
    try {
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, scriptText);
    } catch {}
    setStepIndex(parsed.length ? 0 : -1);
    setCaption(parsed[0] ?? "");
    setShowScriptEditor(false);
  }

  function nextStep() {
    setStepIndex((i) => {
      const next = Math.min(i + 1, steps.length - 1);
      if (steps[next] != null) setCaption(steps[next]);
      return next;
    });
  }

  function prevStep() {
    setStepIndex((i) => {
      const prev = Math.max(i - 1, 0);
      if (steps[prev] != null) setCaption(steps[prev]);
      return prev;
    });
  }

  // Right/Space = next step, Left = previous -- skipped while typing
  // anywhere (path bar, caption box, script editor) so the shortcut can't
  // eat a real keystroke.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!steps.length) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  const hasSteps = steps.length > 0;

  return (
    <div className="studio-root">
      {!focusMode && (
        <>
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
            <button type="button" className="btn" onClick={() => setShowScriptEditor((v) => !v)}>
              {showScriptEditor ? "Close script" : "Edit script"}
            </button>
            <button type="button" className="btn btn-primary" onClick={toggleFocusMode}>Present</button>
          </form>

          {showScriptEditor && (
            <div className="script-editor">
              <div className="script-editor-hint">
                One step per paragraph -- leave a blank line between steps. Saving resets you to Step 1.
              </div>
              <textarea
                className="script-textarea"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder={"Step 1: Tap the equipment card to select your truck and trailer.\n\nStep 2: Tap Browse Fleet to couple a truck and trailer.\n\nStep 3: ..."}
                spellCheck={false}
              />
              <div className="script-editor-actions">
                <span className="script-count">{parseSteps(scriptText).length} step{parseSteps(scriptText).length === 1 ? "" : "s"}</span>
                <button type="button" className="btn btn-primary" onClick={saveScript}>Save script</button>
              </div>
            </div>
          )}
        </>
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

        <div className="step-controls">
          {hasSteps && (
            <div className="step-nav">
              <button type="button" className="step-btn" onClick={prevStep} disabled={stepIndex <= 0}>‹</button>
              <span className="step-count">{stepIndex + 1} / {steps.length}</span>
              <button type="button" className="step-btn step-btn-next" onClick={nextStep} disabled={stepIndex >= steps.length - 1}>
                Next step ›
              </button>
            </div>
          )}
          {focusMode && (
            <button type="button" className="exit-focus" onClick={toggleFocusMode}>
              Exit present mode
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .studio-root {
          min-height: 100dvh;
          background: #ffffff;
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
          flex-wrap: wrap;
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
        .btn-primary { background: #111; color: #fff; border-color: #111; }
        .btn-primary:hover { opacity: 0.85; background: #111; }
        .controls .btn-primary { margin-left: auto; }
        .island-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font: 600 13px var(--font-outfit), sans-serif;
          color: rgba(0,0,0,0.55);
          cursor: pointer;
          user-select: none;
        }

        .script-editor {
          width: 100%;
          box-sizing: border-box;
          padding: 16px 18px;
          background: #fafafa;
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .script-editor-hint {
          font: 500 12px var(--font-outfit), sans-serif;
          color: rgba(0,0,0,0.45);
          margin-bottom: 8px;
        }
        .script-textarea {
          width: 100%;
          height: 160px;
          box-sizing: border-box;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.15);
          font: 400 14px/1.6 var(--font-outfit), sans-serif;
          color: #111;
          outline: none;
          resize: vertical;
        }
        .script-textarea:focus { border-color: rgba(0,0,0,0.4); }
        .script-editor-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 10px;
        }
        .script-count {
          font: 600 12px var(--font-outfit), sans-serif;
          color: rgba(0,0,0,0.4);
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

        .step-controls {
          position: fixed;
          bottom: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 50;
        }
        .step-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0,0,0,0.7);
          border-radius: 999px;
          padding: 6px 8px 6px 14px;
        }
        .step-count {
          font: 700 12px var(--font-outfit), sans-serif;
          color: rgba(255,255,255,0.65);
          min-width: 40px;
          text-align: center;
        }
        .step-btn {
          font: 700 13px var(--font-outfit), sans-serif;
          padding: 8px 12px;
          border-radius: 999px;
          border: none;
          background: rgba(255,255,255,0.12);
          color: #fff;
          cursor: pointer;
        }
        .step-btn:hover:not(:disabled) { background: rgba(255,255,255,0.22); }
        .step-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .step-btn-next { background: #fff; color: #111; padding: 8px 16px; }
        .step-btn-next:hover:not(:disabled) { opacity: 0.85; background: #fff; }
        .step-btn-next:disabled { opacity: 0.3; }

        .exit-focus {
          font: 700 13px var(--font-outfit), sans-serif;
          padding: 10px 16px;
          border-radius: 999px;
          border: none;
          background: rgba(0,0,0,0.7);
          color: #fff;
          cursor: pointer;
        }

        @media (max-width: 880px) {
          .stage { transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
