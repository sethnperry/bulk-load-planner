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

import Link from "next/link";
import SiteHeader from "./marketing/SiteHeader";
import SiteFooter from "./marketing/SiteFooter";

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
    eyebrow: "API Network",
    title: "Crowdsourced Product Conditions",
    body: "Use the most recent API for each product automatically. If it drifts, the drivers behind you get your most recent update.",
    style: { marginTop: 110 },
  },
];

function Card({ c, className }: { c: CardSpec; className?: string }) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`} style={c.style}>
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
      <div className="phone-btn phone-btn-mute" />
      <div className="phone-btn phone-btn-vol-up" />
      <div className="phone-btn phone-btn-vol-down" />
      <div className="phone-btn phone-btn-power" />
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
        <div className="dynamic-island" />
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
          <span className="hero-eyebrow">Precision Fuel Loading.</span>
          <h1 className="hero-h1">Built for Bulk.</h1>
        </div>

        <div className="manifesto">
          <p>
            Across the country, drivers intentionally load bulk fuel
            conservatively, guessing low to avoid a ticket.
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
            Know your weight before you go and pass the scale with
            confidence.
          </p>
        </div>
      </section>

      <section className="grid-section">
        <div className="feature-grid">
          <div className="col col-left">
            <Card c={LEFT_CARDS[0]} className="item-preset" />
            <p className="label label-plan item-plan">Plan.</p>
            <Card c={LEFT_CARDS[1]} className="item-temp" />
            <p className="label label-reload item-reload">Reload.</p>
          </div>

          <div className="col col-center item-phone">
            <PhoneScreen />
          </div>

          <div className="col col-right">
            <Card c={RIGHT_CARDS[0]} className="item-compartment" />
            <p className="label label-load item-load">Load.</p>
            <Card c={RIGHT_CARDS[1]} className="item-network" />
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="closing-inner">
          <h2 className="closing-h2">Stop Leaving Gallons Behind.</h2>
          <div className="closing-right">
            <p className="closing-sub">
              ProTankr is rolling out access gradually, no pricing decided
              yet, no commitment. Get on the list and we'll reach out when
              a spot opens up.
            </p>
            <div className="closing-actions">
              <Link href="/get-the-app" className="closing-cta">Request Early Access</Link>
              <Link href="/pricing" className="closing-secondary">See pricing &rarr;</Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

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
        .label-plan { margin-top: 28px; text-align: right; }
        .label-reload { margin-top: 130px; text-align: right; }
        .label-load { margin-top: 56px; text-align: left; }

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
          position: relative;
          width: 320px;
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
        .screen-img {
          display: block;
          width: 100%;
          height: auto;
          animation: fade-in 0.25s ease;
        }
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
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .closing {
          background: #111111;
          padding: 80px 48px;
        }
        .closing-inner {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 40px;
          max-width: 1400px;
          margin: 0 auto;
          flex-wrap: wrap;
        }
        .closing-h2 { margin: 0; font: 900 56px var(--font); letter-spacing: -0.02em; color: #fff; line-height: 1.02; }
        .closing-right { max-width: 380px; }
        .closing-sub {
          margin: 0;
          font: 400 16px var(--font);
          color: rgba(255,255,255,0.55);
          line-height: 1.55;
        }
        .closing-actions {
          margin-top: 22px;
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .closing-cta {
          padding: 14px 26px;
          border-radius: 999px;
          background: #fff;
          color: #111;
          font: 700 15px var(--font);
          text-decoration: none;
        }
        .closing-cta:hover { opacity: 0.85; }
        .closing-secondary {
          font: 700 14px var(--font);
          color: rgba(255,255,255,0.55);
          text-decoration: none;
        }
        .closing-secondary:hover { color: #fff; }

        @media (max-width: 980px) {
          .hero { padding: 20px 24px 0; }
          .hero-h1 { font-size: 52px; }
          .hero-eyebrow { font-size: 14px; }
          .grid-section { padding: 32px 24px 56px; }

          /* Mobile stack order is Preset, Plan, Compartment, Load, Temp,
             Reload, Network -- interleaved between the desktop's left/right
             columns, not "left column then right column". col-left/col-right
             dissolve (display:contents) so their children become direct
             flex items of feature-grid, each independently placed via the
             order property -- the desktop stagger (margin-top per item)
             stays completely untouched since it's a different breakpoint. */
          .feature-grid { display: flex; flex-direction: column; gap: 0; }
          .col-left, .col-right { display: contents; }
          .item-preset { order: 1; }
          .item-plan { order: 2; }
          .item-compartment { order: 3; }
          .item-load { order: 4; }
          .item-temp { order: 5; }
          .item-reload { order: 6; }
          .item-network { order: 7; }
          .item-phone { order: 0; display: flex; justify-content: center; margin-bottom: 24px; }

          .card { margin-top: 0 !important; margin-bottom: 14px; }
          .label { margin-top: 0 !important; margin-bottom: 8px; text-align: left !important; }
          .phone { width: min(362px, 86vw); }
          .closing { padding: 48px 24px; }
          .closing-inner { flex-direction: column; align-items: flex-start; gap: 24px; }
          .closing-h2 { font-size: 34px; }
          .closing-right { max-width: none; }
        }
      `}</style>
    </div>
  );
}
