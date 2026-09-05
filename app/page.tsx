"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; CTAs link to
// /get-the-app (the site's one real lead-capture path today) or /pricing.
//
// Restructured 2026-09 (v3): the calculator moved out of the closing
// section up to position 2, immediately after the hero, so a visitor can
// try the tool before reading the pitch. The hero's single CTA scrolls
// straight to it. The historical benchmark stat moved out of the hero
// and now appears only AFTER a visitor has produced their own number,
// as context for something they just did rather than a cold claim.
//
// Copy rule, deliberate: nothing on this page may claim ProTankr
// prevents overweight loads outright. A sudden shift in terminal or
// product conditions can still catch a driver out before the network
// has data on it. What the product prevents is the PERMANENT downward
// ratchet afterward. Avoid "never", "guaranteed", "always safe",
// "eliminates" and similar absolutes anywhere in this file.

import Link from "next/link";
import { useState } from "react";
import SiteHeader from "./marketing/SiteHeader";
import SiteFooter from "./marketing/SiteFooter";

// Seth's own current monthly average gallons/load, measured against his
// own conservative per-product benchmarks. Real, but genuinely nuanced:
// it's one driver (no network effect from other drivers loading at the
// same racks yet), it's blended across products rather than a clean
// product-specific comparison, and it moves month to month. Displayed
// rounded; kept precise here so the source stays accurate as it moves.
const CURRENT_MONTHLY_AVG_GAL_PER_LOAD = 272;

// ---------------------------------------------------------------------
// Opportunity calculator — a standalone public estimate tool, not a
// preview of the real app. Deliberately uses only standard, published
// petroleum-industry density math (API gravity -> specific gravity at
// 60F, corrected for temperature with a single representative thermal
// expansion coefficient) rather than the app's own per-product-tuned
// calculation -- this is the same class of math published in ASTM
// D1250 / API MPMS volume-correction tables, not anything proprietary,
// so there's nothing sensitive about running it client-side. It's
// intentionally simpler than what the real app does (one coefficient
// for every product, not a per-product one), which the result copy
// says outright rather than implying false precision.
const WATER_LBS_PER_GAL_AT_60F = 8.32828;
const APPROX_THERMAL_EXPANSION_PER_F = 0.0004;

function estimateLbsPerGallon(api: number, tempF: number) {
  const specificGravity60F = 141.5 / (131.5 + api);
  const specificGravityAtTemp =
    specificGravity60F * (1 - APPROX_THERMAL_EXPANSION_PER_F * (tempF - 60));
  return specificGravityAtTemp * WATER_LBS_PER_GAL_AT_60F;
}

function OpportunityCalculator() {
  const [tareWeight, setTareWeight] = useState("");
  const [api, setApi] = useState("");
  const [tempF, setTempF] = useState("");
  const [actualGallons, setActualGallons] = useState("");
  const [legalLimit, setLegalLimit] = useState("80000");

  const tare = parseFloat(tareWeight);
  const apiNum = parseFloat(api);
  const temp = parseFloat(tempF);
  const actual = parseFloat(actualGallons);
  const limit = parseFloat(legalLimit);
  const allFilled = [tare, apiNum, temp, actual, limit].every(
    (n) => Number.isFinite(n) && n > 0
  );

  // A driver checking this before leaving the rack needs three distinct
  // answers -- over legal weight, genuinely close to it (a real "nice
  // work"), or meaningfully under. Being over is not a "nice work" case,
  // even by a little, so the tolerance only softens the boundary on the
  // UNDER side (rounding noise in the estimate could otherwise flag a
  // load that's actually fine as "left on the table" by a couple gallons)
  // -- any real overage, however small, always shows the warning.
  const TOLERANCE_GAL = 25;
  let result:
    | { kind: "over"; lbsOver: number; liveWeightLbs: number }
    | { kind: "good"; gal: number; liveWeightLbs: number }
    | { kind: "left"; gal: number; liveWeightLbs: number }
    | null = null;
  if (allFilled) {
    const lbsPerGal = estimateLbsPerGallon(apiNum, temp);
    const actualTotalLbs = tare + actual * lbsPerGal;
    const maxLegalPayloadLbs = Math.max(limit - tare, 0);
    const maxLegalGallons = maxLegalPayloadLbs / lbsPerGal;
    const gapGallons = maxLegalGallons - actual;
    const liveWeightLbs = Math.round(actualTotalLbs);

    if (gapGallons < 0) {
      result = {
        kind: "over",
        lbsOver: Math.round(actualTotalLbs - limit),
        liveWeightLbs,
      };
    } else if (gapGallons <= TOLERANCE_GAL) {
      result = { kind: "good", gal: Math.round(gapGallons), liveWeightLbs };
    } else {
      result = { kind: "left", gal: Math.round(gapGallons), liveWeightLbs };
    }
  }

  return (
    <div className="calc-card">
      <div className="calc-fields">
        <label className="calc-field">
          <span>Tare (lbs)</span>
          <input
            type="number"
            inputMode="decimal"
            value={tareWeight}
            onChange={(e) => setTareWeight(e.target.value)}
            placeholder="25000"
          />
        </label>
        <label className="calc-field">
          <span>API</span>
          <input
            type="number"
            inputMode="decimal"
            value={api}
            onChange={(e) => setApi(e.target.value)}
            placeholder="38.5"
          />
        </label>
        <label className="calc-field">
          <span>Temp (&deg;F)</span>
          <input
            type="number"
            inputMode="decimal"
            value={tempF}
            onChange={(e) => setTempF(e.target.value)}
            placeholder="78"
          />
        </label>
        <label className="calc-field">
          <span>Actual gal</span>
          <input
            type="number"
            inputMode="decimal"
            value={actualGallons}
            onChange={(e) => setActualGallons(e.target.value)}
            placeholder="7200"
          />
        </label>
        <label className="calc-field">
          <span>Legal limit (lbs)</span>
          <input
            type="number"
            inputMode="decimal"
            value={legalLimit}
            onChange={(e) => setLegalLimit(e.target.value)}
          />
        </label>
      </div>
      <p className="calc-fields-note">
        Tare weight, product API gravity, product temperature, actual
        gallons loaded from the BOL, and your legal weight limit.
      </p>

      <div className="calc-result-area">
        {result ? (
          <>
            {result.kind === "over" ? (
              <div className="calc-result calc-result-warn">
                <span className="calc-result-num">
                  ~{result.lbsOver.toLocaleString("en-US")} lbs over
                </span>
                <span className="calc-result-label">
                  You may be overweight. Recheck before you leave the rack.
                </span>
              </div>
            ) : result.kind === "good" ? (
              <div className="calc-result calc-result-good">
                <span className="calc-result-num">
                  Within {result.gal.toLocaleString("en-US")} gal
                </span>
                <span className="calc-result-label">
                  of your legal capacity. Nice work.
                </span>
              </div>
            ) : (
              <div className="calc-result calc-result-loss">
                <span className="calc-result-num">
                  {result.gal.toLocaleString("en-US")} gal
                </span>
                <span className="calc-result-label">
                  left on the table, this load.
                </span>
              </div>
            )}
            <p className="calc-live-weight">
              Live weight: {result.liveWeightLbs.toLocaleString("en-US")} lbs
              (limit {limit.toLocaleString("en-US")} lbs)
            </p>
          </>
        ) : (
          <div className="calc-result calc-result-placeholder">
            <span className="calc-result-label">
              Fill in every field above to see what you left on the table.
            </span>
          </div>
        )}
      </div>

      <p className="calc-footnote">
        This is an estimate, using standard published density tables, not
        the automatic tuning ProTankr applies for each specific product in
        the real app.
      </p>
    </div>
  );
}

// Bump whenever public/app-screens/planner.jpg is re-exported -- the bare
// path alone lets browsers keep serving a stale cached copy of the old
// screenshot indefinitely (same URL every time, no cache-buster).
const PLANNER_SCREEN_VERSION = "20260905-planreview";

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
          src={`/app-screens/planner.jpg?v=${PLANNER_SCREEN_VERSION}`}
          alt="ProTankr planner screen, showing a real compartment load plan"
          className="screen-img"
        />
        <div className="dynamic-island" />
      </div>
    </div>
  );
}

const PRODUCT_FEATURES = [
  {
    label: "Equipment aware",
    body: "Tare weight, compartment count, and how much each compartment can legally hold, keyed to the exact truck and trailer you're pulling today.",
  },
  {
    label: "Temperature aware",
    body: "Live API and temperature drive the density math, so the payload number reflects today's conditions, not a guess from last summer.",
  },
  {
    label: "Payload focused",
    body: "Every variable resolves to a single number you can act on at the rack, not a report to interpret later.",
  },
];

const WORKFLOW_STEPS = [
  {
    n: "01",
    label: "Calculate",
    body: "Equipment, terminal, product and temperature go in. ProTankr returns your real available payload for this load, right now.",
  },
  {
    n: "02",
    label: "Load",
    body: "Load the plan at the rack. No guessing gallons twice, no falling back to the same conservative number out of habit.",
  },
  {
    n: "03",
    label: "Capture",
    body: "The actual load gets captured automatically, so you always know what you moved and what got left behind.",
  },
];

export default function Home() {
  return (
    <div className="page">
      <SiteHeader />

      {/* 1. HERO — one job: get the visitor into the calculator below. */}
      <section className="hero">
        <p className="hero-eyebrow">Payload optimization for bulk fuel</p>
        <h1 className="hero-h1">Stop leaving payload at the rack.</h1>
        <p className="hero-sub">
          ProTankr calculates how much you can actually load, based on your
          equipment, product, temperature, compartments and legal weight.
        </p>
      </section>

      {/* 2. CALCULATOR, deliberately second, before any pitch. The old
          hero CTA button ("See what you could recover") is now this
          section's plain header instead of a clickable pill, since the
          calculator sits in view right below the hero either way. */}
      <section id="calculator" className="calc-section">
        <div className="calc-inner">
          <div className="calc-header">
            <h2 className="calc-h2">See what you could recover.</h2>
            <p className="calc-intro">
              Check a real load against your legal limit. Enter what was on
              the ticket and see where it actually landed.
            </p>
          </div>
          <OpportunityCalculator />

          <div className="calc-stat-wrap">
            <div className="hero-stat">
              <span className="hero-stat-num">
                +{CURRENT_MONTHLY_AVG_GAL_PER_LOAD} GAL / LOAD
              </span>
              <span className="hero-stat-sub">
                A single driver without the network effect typically sees an
                average recovery like this, blended across products. More
                drivers using ProTankr will improve the accuracy and shrink
                the necessary buffer.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM / MANIFESTO */}
      <section className="manifesto-section">
        <div className="manifesto-inner">
          <h2 className="manifesto-h2">
            Every load could have carried more. Now it will.
          </h2>
          <div className="manifesto-body">
            <p>
              Across the country, drivers load bulk fuel conservatively on
              purpose. A safe, memorized number, well under the legal limit,
              loaded the same way every time. It&apos;s not carelessness. It&apos;s
              one too many tickets, permanently forcing the safe volume
              lower. Far less than legal.
            </p>
            <p>
              Most conditions drift slowly enough that a small buffer
              absorbs them. The real damage comes from something bigger, a
              single shock, like an unexpected fuel import shifting a
              terminal&apos;s conditions for a few days. The event passes. The
              drivers have a new, lower memorized volume to load.
            </p>
            <p>
              Every load teaches ProTankr something. When conditions shift
              and catch a driver off guard, the network adjusts. The truck
              behind them doesn&apos;t repeat it, and nobody has to guess low
              forever because of one bad day.
            </p>
          </div>
        </div>
      </section>

      {/* 4. FOUNDER STORY */}
      <section className="founder-section">
        <div className="founder-inner">
          <blockquote className="founder-quote">
            <p>
              &ldquo;I didn&apos;t start ProTankr because I wanted to build
              trucking software. I started it because I was tired of
              leaving payload behind.&rdquo;
            </p>
            <p>
              &ldquo;The event that caused it passes. The lower volume never
              does.&rdquo;
            </p>
          </blockquote>
          <p className="founder-byline">
            Built by a bulk fuel hauler with hands-on experience.
          </p>
          <p className="founder-patent">
            <span className="patent-badge">Patent Pending</span>
          </p>
        </div>
      </section>

      {/* 5. PRODUCT */}
      <section id="product" className="product-section">
        <div className="product-inner">
          <div className="product-copy">
            <h2 className="product-h2">
              Know your real weight before you pull away.
            </h2>
            <p className="product-sub">
              Tare weight. Product density. Temperature. Compartment
              constraints. Legal weight. ProTankr turns all of it into one
              practical answer: how much can I legally and reasonably put
              on this trailer, right now.
            </p>
            <ul className="product-features">
              {PRODUCT_FEATURES.map((f) => (
                <li key={f.label}>
                  <span className="product-feature-label">
                    <span className="bullet">&bull;</span>
                    {f.label}
                  </span>
                  <span className="product-feature-body">{f.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="product-visual">
            <PhoneScreen />
          </div>
        </div>
      </section>

      {/* 6. NOT ANOTHER TMS */}
      <section className="tms-section">
        <div className="tms-inner">
          <h2 className="tms-h2">Not another TMS.</h2>
          <div className="tms-flow">
            <p className="tms-line">
              Your TMS tells you where the truck is going. Your dispatch
              system tells you what to haul.
            </p>
            <p className="tms-line tms-line-emphasis">
              ProTankr tells you how much you can legally put on the
              trailer.
            </p>
            <p className="tms-line tms-line-sub">
              It works as an optimization layer alongside the systems you
              already have, not a replacement for any of them.
            </p>
          </div>
        </div>
      </section>

      {/* 7. WORKFLOW */}
      <section className="workflow-section">
        <div className="workflow-inner">
          <h2 className="workflow-h2">Calculate. Load. Capture.</h2>
          <div className="workflow-steps">
            {WORKFLOW_STEPS.map((s) => (
              <div key={s.n} className="workflow-step">
                <span className="workflow-n">{s.n}</span>
                <span className="workflow-label">{s.label}.</span>
                <p className="workflow-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. FINAL CTA */}
      <section className="closing">
        <div className="closing-inner">
          <div className="closing-header">
            <p className="closing-eyebrow">The Opportunity</p>
            <h2 className="closing-h2">
              How many gallons are your trucks leaving behind?
            </h2>
          </div>

          <div className="closing-footer">
            <p className="closing-sub">
              ProTankr rolls out gradually, with no long implementation, no
              TMS replacement, and no commitment up front. Start by
              measuring the opportunity at one terminal, one truck, one
              load.
            </p>
            <div className="closing-actions">
              <Link href="/get-the-app" className="closing-cta">
                Get Early Access &rarr;
              </Link>
              <Link href="/pricing" className="closing-secondary">
                See pricing &rarr;
              </Link>
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

        /* ---------- Hero ---------- */
        .hero { padding: 40px 48px 64px; max-width: 900px; }
        .hero-eyebrow {
          margin: 0;
          font: 800 13px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .hero-h1 {
          margin: 14px 0 0;
          font: 900 76px var(--font);
          letter-spacing: -0.025em;
          line-height: 0.98;
          color: #111;
        }
        .hero-sub {
          margin: 22px 0 0;
          max-width: 620px;
          font: 400 18px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.62);
        }
        /* ---------- Calculator (light, distinct widget block) ---------- */
        .calc-section {
          background: #f6f6f5;
          border-top: 1px solid rgba(0,0,0,0.07);
          border-bottom: 1px solid rgba(0,0,0,0.07);
          padding: 72px 48px;
          scroll-margin-top: 24px;
        }
        .calc-inner { max-width: 760px; margin: 0 auto; }
        .calc-header { text-align: center; margin-bottom: 32px; }
        .calc-h2 {
          margin: 0;
          font: 900 40px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .calc-intro {
          margin: 14px auto 0;
          max-width: 500px;
          font: 400 16px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.58);
        }

        .calc-card {
          width: 100%;
          border-radius: 20px;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.1);
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
          padding: 32px;
        }
        .calc-fields {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .calc-field {
          flex: 1 1 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 14px 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.09);
          background: #f4f4f3;
        }
        .calc-field span {
          font: 700 10.5px var(--font);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.45);
        }
        .calc-field input {
          width: 100%;
          box-sizing: border-box;
          border: none;
          background: transparent;
          color: #111;
          font: 800 21px var(--font);
          text-align: center;
          padding: 0;
        }
        .calc-field:focus-within { border-color: rgba(0,0,0,0.4); }
        .calc-field input:focus { outline: none; }
        .calc-field input::placeholder { color: rgba(0,0,0,0.25); }
        .calc-fields-note {
          margin: 14px 0 0;
          font: 400 12px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.42);
        }

        .calc-result-area {
          margin-top: 26px;
          padding-top: 26px;
          border-top: 1px solid rgba(0,0,0,0.1);
          text-align: center;
        }
        .calc-result { display: flex; flex-direction: column; gap: 4px; }
        .calc-result-num { font: 900 36px var(--font); letter-spacing: -0.01em; }
        .calc-result-warn .calc-result-num { color: #dc2626; }
        .calc-result-loss .calc-result-num { color: #b45309; }
        .calc-result-good .calc-result-num { color: #15803d; }
        .calc-result-label {
          font: 500 13.5px var(--font);
          color: rgba(0,0,0,0.6);
        }
        .calc-result-placeholder .calc-result-label {
          font: 500 14px var(--font);
          color: rgba(0,0,0,0.42);
        }
        .calc-live-weight {
          margin: 12px 0 0;
          font: 600 12.5px var(--font);
          color: rgba(0,0,0,0.45);
        }
        .calc-stat-wrap { display: flex; justify-content: center; margin-top: 32px; }
        .hero-stat {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          padding: 18px 22px;
          border-radius: 16px;
          background: repeating-linear-gradient(
            135deg,
            #f2f2f2,
            #f2f2f2 10px,
            #e9e9e9 10px,
            #e9e9e9 20px
          );
          border: 1px dashed rgba(0,0,0,0.25);
        }
        .hero-stat-num {
          font: 900 30px var(--font);
          letter-spacing: -0.01em;
          color: #111;
        }
        .hero-stat-sub {
          max-width: 440px;
          font: 500 12.5px var(--font);
          color: rgba(0,0,0,0.5);
          line-height: 1.5;
        }

        .calc-footnote {
          margin: 20px 0 0;
          font: 400 11.5px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.38);
          text-align: center;
        }

        /* ---------- Problem / Manifesto ---------- */
        .manifesto-section { background: #111111; padding: 88px 48px; }
        .manifesto-inner { max-width: 860px; margin: 0 auto; }
        .manifesto-h2 {
          margin: 0;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.08;
          color: #fff;
          max-width: 760px;
        }
        .manifesto-body {
          margin-top: 30px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 660px;
        }
        .manifesto-body p {
          margin: 0;
          font: 400 16px var(--font);
          line-height: 1.65;
          color: rgba(255,255,255,0.62);
        }

        /* ---------- Founder ---------- */
        .founder-section { background: #ffffff; padding: 76px 48px; }
        .founder-inner { max-width: 700px; margin: 0 auto; text-align: center; }
        .founder-quote { margin: 0; padding: 0; border: none; }
        .founder-quote p {
          margin: 0 0 14px;
          font: 700 26px var(--font);
          letter-spacing: -0.01em;
          line-height: 1.4;
          color: #111;
        }
        .founder-quote p:last-child { margin-bottom: 0; color: rgba(0,0,0,0.55); font-weight: 600; }
        .founder-byline {
          margin: 22px 0 0;
          font: 500 13px var(--font);
          color: rgba(0,0,0,0.42);
        }
        .founder-patent { margin: 18px 0 0; }
        .patent-badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.18);
          font: 800 10.5px var(--font);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.5);
        }

        /* ---------- Product ---------- */
        .product-section { background: #ffffff; padding: 96px 48px; }
        .product-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 64px;
          align-items: center;
        }
        .product-h2 {
          margin: 0;
          font: 900 42px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #111;
          max-width: 520px;
        }
        .product-sub {
          margin: 20px 0 0;
          max-width: 520px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.6);
        }
        .product-features {
          list-style: none;
          margin: 36px 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 520px;
        }
        .product-features li {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 18px;
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .product-feature-label {
          display: flex;
          align-items: center;
          gap: 7px;
          font: 800 15px var(--font);
          color: #111;
        }
        .product-feature-label .bullet { color: rgba(0,0,0,0.3); font-size: 16px; }
        .product-feature-body {
          font: 400 13.5px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.55);
          padding-left: 15px;
        }
        .product-visual { display: flex; justify-content: center; }

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
        .screen-img { display: block; width: 100%; height: auto; }
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

        /* ---------- Not another TMS ---------- */
        .tms-section { background: #f6f6f5; padding: 96px 48px; }
        .tms-inner { max-width: 780px; margin: 0 auto; text-align: center; }
        .tms-h2 {
          margin: 0 0 40px;
          font: 900 40px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .tms-flow { display: flex; flex-direction: column; gap: 18px; align-items: center; }
        .tms-line {
          margin: 0;
          font: 500 18px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.5);
          max-width: 600px;
        }
        .tms-line-emphasis {
          font: 800 30px var(--font);
          letter-spacing: -0.01em;
          color: #111;
          max-width: 640px;
        }
        .tms-line-sub {
          font: 400 15px var(--font);
          color: rgba(0,0,0,0.45);
          max-width: 480px;
        }

        /* ---------- Workflow ---------- */
        .workflow-section { background: #ffffff; padding: 96px 48px; }
        .workflow-inner { max-width: 1100px; margin: 0 auto; }
        .workflow-h2 {
          margin: 0 0 48px;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .workflow-steps {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 36px;
        }
        .workflow-step { display: flex; flex-direction: column; }
        .workflow-n {
          font: 800 13px var(--font);
          letter-spacing: 0.08em;
          color: rgba(0,0,0,0.28);
        }
        .workflow-label {
          margin-top: 10px;
          font: 800 26px var(--font);
          letter-spacing: -0.01em;
          color: #111;
        }
        .workflow-body {
          margin: 12px 0 0;
          font: 400 14.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
        }

        /* ---------- Closing ---------- */
        .closing { background: #111111; padding: 88px 48px; }
        .closing-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          max-width: 760px;
          margin: 0 auto;
        }
        .closing-header { text-align: center; }
        .closing-eyebrow {
          margin: 0 0 14px;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .closing-h2 { margin: 0; font: 900 44px var(--font); letter-spacing: -0.02em; color: #fff; line-height: 1.08; }
        .closing-footer { text-align: center; }
        .closing-sub {
          margin: 0 auto;
          max-width: 560px;
          font: 400 16px var(--font);
          color: rgba(255,255,255,0.55);
          line-height: 1.55;
        }
        .closing-actions {
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
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

        /* ---------- Mobile ---------- */
        @media (max-width: 980px) {
          .hero { padding: 24px 24px 44px; }
          .hero-h1 { font-size: 44px; }
          .hero-sub { font-size: 16px; }

          .calc-section { padding: 48px 24px; }
          .calc-h2 { font-size: 30px; }
          .calc-card { padding: 22px; }
          .calc-field { flex-basis: calc(50% - 5px); }

          .manifesto-section { padding: 56px 24px; }
          .manifesto-h2 { font-size: 30px; }
          .manifesto-body p { font-size: 15px; }

          .founder-section { padding: 48px 24px; }
          .founder-quote p { font-size: 20px; }

          .product-section { padding: 56px 24px; }
          .product-inner { grid-template-columns: 1fr; gap: 40px; }
          .product-h2 { font-size: 30px; max-width: none; }
          .product-sub, .product-features { max-width: none; }
          .product-visual { order: -1; }
          .phone { width: min(340px, 84vw); }

          .tms-section { padding: 56px 24px; }
          .tms-h2 { font-size: 30px; }
          .tms-line-emphasis { font-size: 22px; }

          .workflow-section { padding: 56px 24px; }
          .workflow-h2 { font-size: 30px; margin-bottom: 32px; }
          .workflow-steps { grid-template-columns: 1fr; gap: 28px; }

          .closing { padding: 48px 24px; }
          .closing-h2 { font-size: 30px; }
        }
      `}</style>
    </div>
  );
}
