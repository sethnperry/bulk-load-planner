"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; the CTA links
// straight to /planner, which already client-side-redirects to /login if
// there's no session (see CalculatorShellContext.tsx) -- no separate auth
// check needed here.

import Link from "next/link";

const CARDS: {
  eyebrow: string;
  headline: React.ReactNode;
  detail: string;
  pos: React.CSSProperties;
}[] = [
  {
    eyebrow: "Preset A",
    headline: <>Load your way, <span className="num">one tap</span></>,
    detail: "Diesel empty-center, split premium in the small comp — set once.",
    pos: { left: 0, top: 30 },
  },
  {
    eyebrow: "Compartment 2",
    headline: <>Slide to <span className="num">1,000 gal</span></>,
    detail: "Match what the drop can hold — the rest compensates automatically.",
    pos: { right: 0, top: 6 },
  },
  {
    eyebrow: "Products",
    headline: <>Three products, <span className="num">one plan</span></>,
    detail: "Matches what's actually on the rack — split loads do their own math.",
    pos: { left: 4, top: 292 },
  },
  {
    eyebrow: "Product temp",
    headline: <><span className="num">86°F</span> predicted</>,
    detail: "Updates as the day heats up — override it in one tap.",
    pos: { right: 0, top: 322 },
  },
  {
    eyebrow: "Equipment",
    headline: <>Swap trucks, <span className="num">skip the scale</span></>,
    detail: "Tare weight's remembered — service history travels with the truck.",
    pos: { left: 20, top: 566 },
  },
  {
    eyebrow: "Access card",
    headline: <>Refreshes <span className="num">every load</span></>,
    detail: "No paperwork to remember — we'll flag it before it lapses.",
    pos: { right: 12, top: 596 },
  },
];

export default function Home() {
  return (
    <div className="page">
      <header className="nav">
        <span className="wordmark">PROTANKR</span>
        <Link href="/planner" className="nav-cta">
          Open the Planner
        </Link>
      </header>

      <main>
        <section className="hero">
          <p className="kicker">Built for bulk liquid drivers</p>
          <h1>
            Load to the edge of legal.
            <br />
            Not a guess short of it.
          </h1>
          <p className="sub">
            API and temperature shift what a gallon actually weighs — enough
            to cost you real gallons if you load conservative, or a ticket if
            you don&apos;t. ProTankr predicts the number before you pull up
            to the rack.
          </p>
          <div className="cta-row">
            <Link href="/planner" className="cta-primary">
              Start planning a load
            </Link>
            <a href="#core-loop" className="cta-secondary">
              See how the number gets sharper ↓
            </a>
          </div>

          <div className="stage">
            <div className="phone">
              <div className="phone-head">
                <p className="phone-term">Global South</p>
                <p className="phone-city">Fort Lauderdale, FL</p>
              </div>
              <div className="phone-bars">
                {[
                  { code: "D2", h: 72, active: false },
                  { code: "DYE", h: 46, active: true },
                  { code: "87", h: 88, active: false },
                  { code: "93", h: 58, active: false },
                ].map((b, i) => (
                  <div className="bar-col" key={i}>
                    <div className="bar-track">
                      <div
                        className={`bar-fill${b.active ? " bar-fill-active" : ""}`}
                        style={{ height: `${b.h}%` }}
                      />
                    </div>
                    <span className="bar-code">{b.code}</span>
                  </div>
                ))}
              </div>
              <div className="phone-presets">
                {["A", "B", "C", "D", "E"].map((l) => (
                  <span key={l} className={`preset-chip${l === "A" ? " preset-chip-active" : ""}`}>
                    {l}
                  </span>
                ))}
              </div>
              <div className="phone-load">LOAD</div>
            </div>

            {CARDS.map((c, i) => (
              <div className="card" key={i} style={{ ...c.pos, animationDelay: `${0.05 + i * 0.07}s` }}>
                <p className="eyebrow">
                  <span>{c.eyebrow}</span>
                  <span className="dot" />
                </p>
                <p className="headline">{c.headline}</p>
                <p className="detail">{c.detail}</p>
              </div>
            ))}

            <svg className="truck-mark" width="220" height="120" viewBox="0 0 220 120" aria-hidden="true">
              <g fill="none" stroke="#3a372e" strokeWidth="1.5">
                <rect x="4" y="52" width="46" height="34" rx="1" />
                <rect x="50" y="30" width="150" height="56" rx="1" />
                <line x1="90" y1="30" x2="90" y2="86" />
                <line x1="130" y1="30" x2="130" y2="86" />
                <line x1="170" y1="30" x2="170" y2="86" />
              </g>
              <g fill="#111111" stroke="#3a372e" strokeWidth="1.5">
                <circle cx="24" cy="90" r="10" />
                <circle cx="66" cy="90" r="10" />
                <circle cx="150" cy="90" r="10" />
                <circle cx="188" cy="90" r="10" />
              </g>
            </svg>
          </div>
        </section>

        <section className="feature" id="core-loop">
          <p className="feature-label">The core loop — loading &amp; reloading</p>
          <p className="feature-quote">It&apos;s not precision guesswork. It&apos;s transparency.</p>
          <p className="feature-sub">
            Every driver at a terminal is working off the same predicted API
            and temp — crowdsourced, not looked up. Whoever loads first can
            sharpen it for whoever loads next.
          </p>
          <div className="steps">
            <div className="step">
              <p className="step-num">You load</p>
              <p className="step-title">The app already has a number</p>
              <p className="step-body">
                Predicted API and temp for this terminal, before you&apos;ve
                touched the dial.
              </p>
            </div>
            <div className="step">
              <p className="step-num">Only if it&apos;s off</p>
              <p className="step-title">Correct it from the BOL</p>
              <p className="step-body">
                Takes five seconds, off a number you&apos;re already holding
                — the model didn&apos;t have it yet.
              </p>
            </div>
            <div className="step">
              <p className="step-num">Next driver, same rack</p>
              <p className="step-title">Their number&apos;s already sharper</p>
              <p className="step-body">
                No input needed on their end. Both of you know your weight
                before you leave the terminal.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} ProTankr</span>
      </footer>

      <style jsx global>{`
        .page {
          --panel: #17160f;
          --line: #322f27;
          --line-soft: #242220;
          --muted: #8c8879;
          --faint: #55524a;
          --amber: #e8a33d;
          --mono: ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Consolas, monospace;
          min-height: 100dvh;
          background: #111111;
          color: #ece8de;
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1100px;
          margin: 0 auto;
          padding: 22px 24px;
          border-bottom: 1px solid var(--line-soft);
        }
        .wordmark {
          font-family: var(--mono);
          font-size: 13px;
          letter-spacing: 0.16em;
          font-weight: 600;
        }
        .nav-cta {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #111111;
          background: var(--amber);
          padding: 9px 16px;
          text-decoration: none;
          border: 1px solid var(--amber);
        }
        .nav-cta:hover { opacity: 0.88; }

        main {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .hero { padding: 64px 0 40px; }
        .kicker {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--faint);
          margin: 0 0 14px;
        }
        .hero h1 {
          font-size: 44px;
          font-weight: 700;
          letter-spacing: -0.015em;
          line-height: 1.14;
          margin: 0 0 18px;
          max-width: 16ch;
        }
        .sub {
          font-size: 16px;
          color: var(--muted);
          max-width: 58ch;
          line-height: 1.65;
          margin: 0 0 30px;
        }
        .cta-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; margin-bottom: 56px; }
        .cta-primary {
          font-family: var(--mono);
          font-size: 13px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #111111;
          background: var(--amber);
          padding: 13px 22px;
          text-decoration: none;
          border: 1px solid var(--amber);
        }
        .cta-primary:hover { opacity: 0.88; }
        .cta-secondary {
          font-family: var(--mono);
          font-size: 12.5px;
          color: var(--muted);
          text-decoration: none;
          border-bottom: 1px solid var(--line);
          padding-bottom: 2px;
        }
        .cta-secondary:hover { color: #ece8de; border-color: var(--muted); }

        .stage {
          position: relative;
          min-height: 700px;
          border: 1px solid var(--line-soft);
          overflow: hidden;
          padding: 40px 32px;
        }

        .phone {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 226px;
          height: 480px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 18px 16px;
          display: flex;
          flex-direction: column;
        }
        .phone-head { margin-bottom: 16px; }
        .phone-term { font-size: 13px; font-weight: 600; margin: 0 0 2px; }
        .phone-city {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--faint);
          margin: 0;
        }
        .phone-bars {
          flex: 1;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          margin-bottom: 16px;
        }
        .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
        .bar-track {
          width: 100%;
          height: 100%;
          border: 1px solid var(--line-soft);
          display: flex;
          align-items: flex-end;
          background: rgba(255,255,255,0.02);
        }
        .bar-fill { width: 100%; background: rgba(236,232,222,0.16); }
        .bar-fill-active { background: var(--amber); }
        .bar-code { font-family: var(--mono); font-size: 9.5px; color: var(--faint); letter-spacing: 0.04em; }
        .phone-presets { display: flex; gap: 6px; margin-bottom: 14px; }
        .preset-chip {
          flex: 1;
          text-align: center;
          font-family: var(--mono);
          font-size: 10.5px;
          padding: 6px 0;
          border: 1px solid var(--line-soft);
          color: var(--faint);
        }
        .preset-chip-active { border-color: var(--amber); color: var(--amber); }
        .phone-load {
          text-align: center;
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          padding: 12px 0;
          background: var(--amber);
          color: #111111;
          font-weight: 600;
        }

        .stage .card {
          position: absolute;
          width: 244px;
          background: var(--panel);
          border: 1px solid var(--line);
          padding: 14px 16px 15px;
          animation: rise 0.5s ease backwards;
        }
        .card .eyebrow {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--faint);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 0 0 9px;
        }
        .card .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--faint); }
        .card .headline { font-size: 15px; font-weight: 600; margin: 0 0 6px; line-height: 1.3; }
        .card :global(.num) { font-family: var(--mono); font-variant-numeric: tabular-nums; font-weight: 600; }
        .card .detail { font-size: 12px; color: var(--muted); line-height: 1.5; }

        .truck-mark { position: absolute; right: 0; bottom: 0; opacity: 0.5; }

        @keyframes rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .feature { margin: 72px 0 88px; padding-top: 56px; border-top: 1px solid var(--line-soft); }
        .feature-label {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--faint);
          margin: 0 0 22px;
        }
        .feature-quote {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.012em;
          line-height: 1.28;
          max-width: 16ch;
          margin: 0 0 18px;
        }
        .feature-sub {
          font-size: 15px;
          color: var(--muted);
          max-width: 58ch;
          line-height: 1.65;
          margin: 0 0 44px;
        }
        .steps { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--line-soft); }
        .step { padding: 22px 22px 24px; border-right: 1px solid var(--line-soft); }
        .step:last-child { border-right: none; }
        .step-num {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--faint);
          margin: 0 0 12px;
        }
        .step-title { font-size: 14px; font-weight: 600; margin: 0 0 8px; line-height: 1.35; }
        .step-body { font-size: 12.5px; color: var(--muted); line-height: 1.55; }

        .foot {
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 24px 40px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--faint);
        }

        @media (max-width: 900px) {
          .hero h1 { font-size: 32px; }
          .stage { min-height: auto; padding: 24px 16px 320px; }
          .phone { position: static; transform: none; margin: 0 auto 24px; }
          .stage .card {
            position: static;
            width: 100%;
            margin-bottom: 12px;
          }
          .truck-mark { display: none; }
          .steps { grid-template-columns: 1fr; }
          .step { border-right: none; border-bottom: 1px solid var(--line-soft); }
          .step:last-child { border-bottom: none; }
          .feature-quote { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
