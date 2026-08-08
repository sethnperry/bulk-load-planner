"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; the CTA links
// straight to /planner, which already client-side-redirects to /login if
// there's no session (see CalculatorShellContext.tsx) -- no separate auth
// check needed here.
//
// Light marketing theme (white body, black header) per the 2026-08-08
// mockup pass -- deliberately different from the app's own dark-only
// theme. The phone mockup's own screen content stays dark to match the
// real (dark-only, no light mode) product; only the page chrome around it
// is light.

import Link from "next/link";

type CardSpec = {
  eyebrow: string;
  title: string;
  body: string;
  tone: "light" | "dark";
  pos: React.CSSProperties;
};

const CARDS: CardSpec[] = [
  {
    eyebrow: "Preset E",
    title: "Custom load plans on tap",
    body: "Set it once for the way you load. Whether it's a single product or a split load. One compartment or five. The plan adapts to you.",
    tone: "light",
    pos: { left: 0, top: 14 },
  },
  {
    eyebrow: "Compartment 2",
    title: "Cap on the fly",
    body: "Not enough room to deliver a full compartment. Slide the handle down to dial it in while the others compensate.",
    tone: "dark",
    pos: { right: 0, top: 100 },
  },
  {
    eyebrow: "Equipment",
    title: "Slip seat with ease",
    body: "Drivers share visibility of primary equipment as well as spares to keep track of equipment needs like service history.",
    tone: "dark",
    pos: { left: 6, top: 292 },
  },
  {
    eyebrow: "Tare weights",
    title: "Swap Equipment",
    body: "This truck with that trailer? Doesn't matter — we track the tare weight for each combination, a quick tap to switch it up.",
    tone: "dark",
    pos: { right: 8, top: 300 },
  },
  {
    eyebrow: "Product temperature",
    title: "Density math made easy",
    body: "Load dynamically for product density changes. Let the model predict the temp, or manually override with a known temp for precision.",
    tone: "light",
    pos: { left: 22, top: 566 },
  },
  {
    eyebrow: "Access cards",
    title: "Renewal tracking",
    body: "Access cards refresh automatically every load, helping you avoid a last-minute lapse before it costs you the run.",
    tone: "light",
    pos: { right: 12, top: 574 },
  },
];

const TAB_BAR = ["Dispatch", "Terminal", "Planner", "Cards", "Vault"];

export default function Home() {
  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <svg className="mark" width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
            <path
              d="M4 2 H10 V32 M4 2 H24 L10 15 H4"
              fill="none"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <span className="wordmark">PROTANKR</span>
        </div>
        <nav className="nav-links">
          <Link href="/about">About</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/planner" className="nav-cta">Get the App</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>Built for Bulk.</h1>
            <p className="hero-sub">Fuel Hauling, Precision Loading.</p>
          </div>

          <div className="stage">
            <p className="stage-label stage-label-easy">It&apos;s Easy.</p>
            <p className="stage-label stage-label-quick">It&apos;s Quick.</p>
            <p className="stage-label stage-label-accurate">It&apos;s Accurate.</p>

            <div className="phone">
              <div className="notch" />
              <div className="screen">
                <div className="screen-top">
                  <span className="icon-hamburger"><span /><span /><span /></span>
                  <div className="screen-top-right">
                    <span className="icon-bell">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                      </svg>
                      <span className="badge">2</span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005 15a1.65 1.65 0 00-1.51-1H3.4a2 2 0 010-4h.09A1.65 1.65 0 005 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09c0 .68.39 1.3 1 1.51.6.25 1.3.12 1.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019 9c.25.6.83 1 1.51 1H21a2 2 0 010 4h-.09c-.68 0-1.26.4-1.51 1z" />
                    </svg>
                  </div>
                </div>

                <div className="screen-tabs">
                  <span>Terminal</span>
                  <span className="screen-tab-active">Planner</span>
                  <span>Cards</span>
                </div>

                <div className="screen-presets">
                  <span>C</span>
                  <span className="preset-active">
                    E
                    <i />
                  </span>
                  <span>D</span>
                </div>

                <div className="screen-comps">
                  <div className="comp-col">
                    <span className="comp-num">3</span>
                    <div className="comp-track">
                      <div className="comp-fill" style={{ height: "62%", background: "#f2ede2" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#f2ede2" }}>87</span>
                    <span className="comp-gal">2,585</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-num">2</span>
                    <div className="comp-track">
                      <div className="comp-cap-dim" style={{ height: "56%" }} />
                      <div className="comp-handle" style={{ top: "44%" }} />
                      <div className="comp-fill" style={{ height: "24%", background: "#d9483d" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#d9483d" }}>93</span>
                    <span className="comp-gal">1,000</span>
                  </div>
                  <div className="comp-col">
                    <span className="comp-num">1</span>
                    <div className="comp-track">
                      <div className="comp-fill" style={{ height: "78%", background: "#eab54a" }} />
                    </div>
                    <span className="comp-code" style={{ color: "#eab54a" }}>D2</span>
                    <span className="comp-gal">4,250</span>
                  </div>
                </div>

                <div className="screen-cg">
                  <span>Rear</span>
                  <div className="cg-track"><div className="cg-dot" /></div>
                  <span>Front</span>
                </div>

                <div className="screen-row">
                  <div>
                    <p className="row-main">Truck · 25184&nbsp;&nbsp;&nbsp;Trailer · 3151</p>
                    <p className="row-sub">Freightliner&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Mac</p>
                  </div>
                  <span className="chev">›</span>
                </div>
                <div className="screen-row">
                  <div>
                    <p className="row-main">Tampa, FL&nbsp;&nbsp;&nbsp;Buckey North</p>
                    <p className="row-sub">Card # 00095&nbsp;&nbsp;&nbsp;Exp. 271 days</p>
                  </div>
                  <span className="chev">›</span>
                </div>
                <div className="screen-row">
                  <div>
                    <p className="row-main">86°F predicted product temp</p>
                    <p className="row-sub row-sub-good">High confidence</p>
                  </div>
                  <span className="chev">›</span>
                </div>

                <div className="screen-reload">RELOAD</div>

                <div className="screen-totals">
                  <div>
                    <p className="total-main">7,835 gal</p>
                  </div>
                  <div className="total-right">
                    <p className="total-main">79,458 lbs</p>
                    <p className="total-sub">Target 79,500 lbs&nbsp;&nbsp;Diff -42 lbs</p>
                  </div>
                </div>

                <p className="screen-foot">
                  Real API &amp; temp confirm automatically after this load — sharpens the number for the next driver…
                </p>
              </div>
            </div>

            {CARDS.map((c, i) => (
              <div
                className={`card card-${c.tone}`}
                key={i}
                style={{ ...c.pos, animationDelay: `${0.05 + i * 0.07}s` }}
              >
                <p className="eyebrow">
                  {c.eyebrow}
                  <span className="dot" />
                </p>
                <p className="title">{c.title}</p>
                <p className="body">{c.body}</p>
              </div>
            ))}

            <svg className="truck-mark" width="360" height="150" viewBox="0 0 360 150" aria-hidden="true">
              <g fill="none" stroke="#111111" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                {/* hood + grille, chiseled Western Star profile */}
                <path d="M18 96 L18 70 L46 52 L86 52 L86 96 Z" />
                <line x1="30" y1="52" x2="30" y2="96" />
                <line x1="42" y1="52" x2="42" y2="96" />
                {/* drop bumper -- steps below the hood/frame line */}
                <path d="M12 96 L92 96 L92 106 L20 106 L20 112 L12 112 Z" />
                {/* cab */}
                <path d="M86 40 L150 40 L150 96 L86 96 Z" />
                <rect x="98" y="50" width="34" height="24" rx="1.5" />
                {/* exhaust stack */}
                <line x1="70" y1="52" x2="70" y2="8" />
                <path d="M65 8 L75 8 L73 2 L67 2 Z" />
                {/* frame + trailer tank */}
                <line x1="150" y1="96" x2="352" y2="96" />
                <path d="M158 60 C158 52 168 48 200 48 L300 48 C326 48 336 54 336 66 L336 96 L158 96 Z" />
                <line x1="196" y1="48" x2="196" y2="96" />
                <line x1="252" y1="48" x2="252" y2="96" />
              </g>
              <g fill="#ffffff" stroke="#111111" strokeWidth="2">
                <circle cx="34" cy="112" r="14" />
                <circle cx="120" cy="112" r="14" />
                <circle cx="290" cy="112" r="14" />
                <circle cx="326" cy="112" r="14" />
              </g>
            </svg>
          </div>
        </section>

        <section className="manifesto">
          <p>
            Across the country, drivers load bulk petroleum products based on
            a guess of what they think will scale — under the worst
            conditions.
          </p>
          <p>
            When you see a fuel transport truck on the highway, it&apos;s
            likely empty, or only partially loaded.
          </p>
          <p>
            We give you the tools to stop underloading while virtually
            eliminating overweight tickets.
          </p>
          <p>
            The driver will know what they have on board before ever leaving
            the terminal — crowdsourcing API and density details back to
            sharpen the formula for the next driver.
          </p>
        </section>

        <div className="tabbar-wrap">
          <div className="tabbar">
            {TAB_BAR.map((t) => (
              <span key={t} className={t === "Planner" ? "tab-active" : undefined}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .page {
          --bg: #ffffff;
          --ink: #0d0d0c;
          --muted: #6e6d66;
          --line: #e6e4db;
          --card-light: #f2f0ea;
          --card-dark: #46453e;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: var(--bg);
          color: var(--ink);
          font-family: var(--font);
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0a0a0a;
          padding: 20px 32px;
        }
        .brand { display: flex; align-items: center; gap: 10px; }
        .wordmark { color: #fff; font-weight: 800; font-size: 17px; letter-spacing: 0.02em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-links :global(a) {
          color: #ffffff;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
        }
        .nav-links :global(a:hover) { opacity: 0.75; }

        main { max-width: 1320px; margin: 0 auto; padding: 0 32px; }

        .hero { padding: 64px 0 0; }
        .hero-text { margin-bottom: 24px; }
        .hero h1 {
          font-size: 56px;
          font-weight: 800;
          letter-spacing: -0.015em;
          margin: 0 0 8px;
        }
        .hero-sub {
          font-style: italic;
          font-weight: 400;
          font-size: 22px;
          color: var(--muted);
          margin: 0;
        }

        .stage { position: relative; min-height: 940px; padding: 20px 0 60px; }

        .stage-label {
          position: absolute;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -0.01em;
          margin: 0;
        }
        .stage-label-quick { right: 4px; top: 0; }
        .stage-label-easy { left: 20px; top: 200px; }
        .stage-label-accurate { right: 4px; top: 764px; }

        .phone {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 300px;
          background: #fbfaf7;
          border: 1px solid #e4e2d9;
          border-radius: 34px;
          padding: 14px 12px 20px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.12);
        }
        .notch {
          width: 90px;
          height: 22px;
          background: #0a0a0a;
          border-radius: 12px;
          margin: 0 auto 10px;
        }
        .screen {
          background: #111111;
          border-radius: 20px;
          padding: 16px 14px 14px;
          color: #ece8de;
          font-family: var(--font);
        }
        .screen-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .icon-hamburger { display: flex; flex-direction: column; gap: 3px; }
        .icon-hamburger span { width: 16px; height: 2px; background: #ece8de; display: block; }
        .screen-top-right { display: flex; align-items: center; gap: 12px; color: #ece8de; }
        .icon-bell { position: relative; display: flex; }
        .badge {
          position: absolute; top: -5px; right: -6px;
          background: #d9483d; color: #fff; font-size: 8px; font-weight: 700;
          width: 13px; height: 13px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .screen-tabs {
          display: flex; justify-content: space-between;
          font-size: 12.5px; color: rgba(236,232,222,0.4); font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding-bottom: 10px; margin-bottom: 12px;
        }
        .screen-tab-active { color: #fff; }

        .screen-presets {
          display: flex; justify-content: center; align-items: flex-end; gap: 30px;
          font-size: 13px; color: rgba(236,232,222,0.3); font-weight: 600;
          margin-bottom: 14px;
        }
        .preset-active {
          color: #fff; font-size: 16px; font-weight: 700;
          display: flex; flex-direction: column; align-items: center; gap: 3px;
        }
        .preset-active i {
          width: 4px; height: 4px; border-radius: 50%; background: #fff; font-style: normal;
        }

        .screen-comps { display: flex; justify-content: center; gap: 12px; margin-bottom: 12px; }
        .comp-col { display: flex; flex-direction: column; align-items: center; width: 62px; }
        .comp-num { font-size: 11px; color: rgba(236,232,222,0.4); font-weight: 700; margin-bottom: 4px; }
        .comp-track {
          width: 100%; height: 96px; background: rgba(255,255,255,0.06);
          position: relative; overflow: visible;
        }
        .comp-fill { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .comp-cap-dim {
          position: absolute; left: 0; right: 0; top: 0;
          background: rgba(0,0,0,0.35);
          border-bottom: 1px dashed rgba(255,160,0,0.5);
        }
        .comp-handle {
          position: absolute; left: 50%; transform: translate(-50%, -50%);
          width: 26px; height: 4px; border-radius: 3px; background: #ffb020;
        }
        .comp-code { font-size: 13px; font-weight: 800; margin-top: 6px; }
        .comp-gal { font-size: 11px; color: rgba(236,232,222,0.55); margin-top: 2px; }

        .screen-cg {
          display: flex; align-items: center; gap: 8px;
          font-size: 9.5px; letter-spacing: 0.05em; text-transform: uppercase;
          color: rgba(236,232,222,0.35); margin-bottom: 12px;
        }
        .cg-track { flex: 1; height: 2px; background: rgba(255,255,255,0.12); position: relative; }
        .cg-dot { position: absolute; left: 58%; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; border-radius: 50%; background: #ece8de; }

        .screen-row {
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 9px 0;
        }
        .row-main { font-size: 12px; font-weight: 600; margin: 0; }
        .row-sub { font-size: 10.5px; color: rgba(236,232,222,0.45); margin: 2px 0 0; }
        .row-sub-good { color: #7bb586; }
        .chev { color: rgba(236,232,222,0.3); font-size: 16px; }

        .screen-reload {
          margin-top: 10px;
          background: #fff; color: #111;
          text-align: center; font-weight: 800; font-size: 12.5px; letter-spacing: 0.04em;
          padding: 11px 0;
        }

        .screen-totals {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;
        }
        .total-main { font-size: 15px; font-weight: 800; margin: 0; font-variant-numeric: tabular-nums; }
        .total-right { text-align: right; }
        .total-sub { font-size: 9.5px; color: rgba(236,232,222,0.4); margin: 2px 0 0; }

        .screen-foot {
          font-style: italic; font-size: 9px; color: rgba(236,232,222,0.32);
          margin: 10px 0 -6px; line-height: 1.4;
        }

        .card {
          position: absolute;
          width: 258px;
          padding: 14px 16px 15px;
          animation: rise 0.5s ease backwards;
        }
        .card-light { background: var(--card-light); color: var(--ink); }
        .card-dark { background: var(--card-dark); color: #fff; }
        .card .eyebrow {
          font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          display: flex; align-items: flex-start; justify-content: space-between;
          opacity: 0.55; margin: 0 0 8px;
        }
        .card .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: 0.5; flex-shrink: 0; margin-left: 8px; }
        .card .title { font-size: 15px; font-weight: 700; margin: 0 0 6px; line-height: 1.3; }
        .card .body { font-size: 12px; line-height: 1.55; opacity: 0.75; margin: 0; }

        .truck-mark { position: absolute; right: -10px; bottom: -10px; opacity: 0.14; }

        @keyframes rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .manifesto {
          max-width: 720px;
          margin: 40px auto 64px;
          text-align: center;
        }
        .manifesto p {
          font-size: 17px;
          line-height: 1.7;
          color: var(--ink);
          margin: 0 0 14px;
        }
        .manifesto p:last-child { margin-bottom: 0; }

        .tabbar-wrap { display: flex; justify-content: center; padding-bottom: 56px; }
        .tabbar {
          display: flex;
          gap: 30px;
          background: #0a0a0a;
          border-radius: 999px;
          padding: 14px 34px;
        }
        .tabbar span { color: rgba(255,255,255,0.45); font-size: 14px; font-weight: 600; }
        .tabbar span.tab-active { color: #fff; font-weight: 800; }

        @media (max-width: 900px) {
          .hero h1 { font-size: 38px; }
          .stage { min-height: auto; padding-bottom: 0; }
          .stage-label { position: static; margin: 24px 0 0; }
          .phone { position: static; transform: none; margin: 24px auto; }
          .card { position: static; width: 100%; margin-bottom: 12px; }
          .truck-mark { display: none; }
          .tabbar { flex-wrap: wrap; justify-content: center; gap: 16px 22px; }
        }
      `}</style>
    </div>
  );
}
