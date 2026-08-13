"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; the CTA links
// straight to /planner, which already client-side-redirects to /login if
// there's no session (see CalculatorShellContext.tsx) -- no separate auth
// check needed here.
//
// Rebuilt 2026-08-08 against a new flat-screenshot mockup (not a coded
// handoff like the prior design pass) -- structure, copy, and colors below
// are read directly off that image, so exact pixel values (card offsets,
// grays) are best-effort estimates rather than extracted constants; expect
// a follow-up tuning pass once this renders next to the real mockup.
// Major changes from the prior (2026-08-08 handoff) version: white header
// (no dark band), huge "Built for Bulk." headline as its own row with a
// "Precision Fuel Loading." eyebrow beside it, manifesto copy moved up
// directly under the headline (new wording), uniform light cards (no more
// alternating light/dark tone) with a "•" bullet eyebrow, only 2 cards per
// side (Equipment / Tare Weights dropped), new "Load. / Communicate. /
// Reload." section labels replacing "Easy. / Quick. / Accurate.", and the
// truck watermark removed.
//
// Logo mark is the real PT.svg flag glyph, now filled black to sit on the
// white header instead of white-on-dark.

import SiteHeader from "./marketing/SiteHeader";

type CardSpec = {
  eyebrow: string;
  title: string;
  body: string;
  style: React.CSSProperties;
};

const LEFT_CARDS: [CardSpec, CardSpec] = [
  {
    eyebrow: "Preset E",
    title: "Custom load plans on tap",
    body: "Set it once for the way you load. Whether it's a single product or a split load. One compartment or five. The plan adapts to you.",
    style: { marginTop: 0 },
  },
  {
    eyebrow: "Product Temperature",
    title: "Density math made easy",
    body: "Let the model predict the temperature or manually override it..",
    style: { marginTop: 110 },
  },
];

const RIGHT_CARDS: [CardSpec, CardSpec] = [
  {
    eyebrow: "Compartment 2",
    title: "Cap on the fly",
    body: "Not enough room to deliver a full compartment. Slide a handle to dial it in while the others compensate.",
    style: { marginTop: 60 },
  },
  {
    eyebrow: "Access Cards",
    title: "Renewal Tracking",
    body: "Access cards are updated automagically, helping avoid the last minute price exception to prevent a lapse.",
    style: { marginTop: 110 },
  },
];

function Card({ c }: { c: CardSpec }) {
  return (
    <div className="card" style={c.style}>
      <p className="eyebrow">
        <span className="bullet">•</span>
        {c.eyebrow}
      </p>
      <p className="title">{c.title}</p>
      <p className="body">{c.body}</p>
    </div>
  );
}

// Bump whenever public/app-screens/planner.png is re-exported -- the bare
// path alone lets browsers keep serving a stale cached copy of the old
// screenshot indefinitely (same URL every time, no cache-buster).
const PLANNER_SCREEN_VERSION = "20260808d-realmockup";

function PhoneScreen() {
  return (
    <div className="phone">
      <div className="notch" />
      <div className="screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- a real
            captured screenshot of the live Planner screen; not a Next/Image
            candidate since this is a static marketing asset, not content
            that benefits from remote optimization. */}
        <img
          src={`/app-screens/planner.png?v=${PLANNER_SCREEN_VERSION}`}
          alt="ProTankr planner screen"
          className="screen-img"
        />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="page">
      <SiteHeader />

      <section className="hero">
        <div className="hero-inline">
          <h1 className="hero-h1">Built for Bulk.</h1>
          <span className="hero-eyebrow">Precision Fuel Loading.</span>
        </div>

        <div className="manifesto">
          <p>
            Across the country, drivers intentionally load bulk fuel
            conservatively — guessing low to avoid a ticket.
          </p>
          <p>
            When you see a fuel transport truck on the highway, odds are
            it's empty or only partially loaded.
          </p>
          <p>
            We give drivers a quick, easy way to stop guessing, stop
            underloading, and stop the tickets.
          </p>
          <p>
            Know your weight before you go — and pass the scale with
            confidence.
          </p>
        </div>
      </section>

      <section className="grid-section">
        <div className="feature-grid">
          <div className="col col-left">
            <Card c={LEFT_CARDS[0]} />
            <p className="label label-load">Load.</p>
            <Card c={LEFT_CARDS[1]} />
            <p className="label label-reload">Reload.</p>
          </div>

          <div className="col col-center">
            <PhoneScreen />
          </div>

          <div className="col col-right">
            <Card c={RIGHT_CARDS[0]} />
            <p className="label label-communicate">Communicate.</p>
            <Card c={RIGHT_CARDS[1]} />
          </div>
        </div>
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: #ffffff;
          color: var(--ink);
          font-family: var(--font);
          overflow-x: hidden;
        }

        .hero { padding: 18px 48px 0; }
        .hero-inline { display: flex; align-items: baseline; gap: 22px; flex-wrap: wrap; }
        .hero-h1 { margin: 0; font: 900 84px var(--font); letter-spacing: -0.02em; color: #111; line-height: 0.95; }
        .hero-eyebrow { font: 800 20px var(--font); letter-spacing: 0.06em; text-transform: uppercase; color: #c7c7c7; }

        .manifesto {
          max-width: 620px;
          margin: 18px 0 0;
          font: 400 17px var(--font);
          color: rgba(0,0,0,0.72);
          line-height: 1.55;
        }
        .manifesto p { margin: 0; }

        .grid-section { padding: 40px 48px 90px; background: #fff; }

        .feature-grid {
          display: grid;
          grid-template-columns: 1fr 320px 1fr;
          gap: 24px;
          align-items: start;
          max-width: 1400px;
          margin: 0 auto;
        }
        .col { display: flex; flex-direction: column; gap: 0; }

        .label { margin: 0; font: 800 42px var(--font); letter-spacing: -0.01em; color: #111; }
        .label-load { margin-top: 28px; text-align: right; }
        .label-reload { margin-top: 130px; text-align: right; }
        .label-communicate { margin-top: 56px; text-align: left; }

        .card {
          border-radius: 14px;
          background: #f2f2f2;
          color: #111;
          padding: 16px 18px;
          position: relative;
        }
        .card .eyebrow {
          margin: 0; display: flex; align-items: center; gap: 6px;
          font: 700 10px var(--font); letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .card .bullet { color: rgba(0,0,0,0.35); font-size: 14px; line-height: 1; }
        .card .title { margin-top: 6px; font: 700 18px var(--font); color: #111; }
        .card .body { margin-top: 6px; font: 400 13px var(--font); line-height: 1.4; color: rgba(0,0,0,0.55); }

        .phone {
          width: 320px;
          background: #fbfaf7;
          border: 1px solid #e4e2d9;
          border-radius: 38px;
          padding: 12px 11px 16px;
          box-shadow: 0 20px 44px rgba(0,0,0,0.16);
        }
        .notch { width: 84px; height: 18px; background: #0a0a0a; border-radius: 10px; margin: 0 auto 8px; }
        .screen { background: #111111; border-radius: 22px; overflow: hidden; line-height: 0; }
        .screen-img {
          display: block;
          width: 100%;
          height: auto;
          animation: fade-in 0.25s ease;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (max-width: 980px) {
          .hero { padding: 20px 24px 0; }
          .hero-h1 { font-size: 52px; }
          .hero-eyebrow { font-size: 14px; }
          .manifesto { max-width: none; }
          .grid-section { padding: 32px 24px 56px; }
          .feature-grid { grid-template-columns: 1fr; gap: 20px; }
          .col-left, .col-right { order: 2; }
          .col-center { order: 1; display: flex; justify-content: center; }
          .card { margin-top: 0 !important; margin-bottom: 14px; }
          .label { margin-top: 0 !important; margin-bottom: 8px; text-align: left !important; }
          .phone { width: min(362px, 86vw); }
        }
      `}</style>
    </div>
  );
}
