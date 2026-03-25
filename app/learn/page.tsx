"use client";
// app/learn/page.tsx

import React, { useState } from "react";
import { useRouter } from "next/navigation";

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>
        {emoji}&nbsp;&nbsp;{title}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.25)" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{title}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function LearnPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100dvh", background: "#111111", color: "rgba(255,255,255,0.85)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 20, lineHeight: 1, padding: "4px 8px 4px 0" }}
        >
          ‹
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>Learn</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>How ProTankr works</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column" as const, gap: 12, maxWidth: 600, margin: "0 auto" }}>

        {/* ── Temperature Prediction ── */}
        <Accordion title="🌡 How the temperature prediction works">

          <Section emoji="🌤" title="30 hours of weather history">
            We pull hourly temperature, wind speed, and cloud cover from OpenWeather for the past 24–30 hours at this terminal's location. This gives the model a full picture of how the environment has been heating or cooling the storage tank.
          </Section>

          <Section emoji="☀️" title="Solar gain calculation">
            Using the terminal's exact latitude and longitude, we calculate the sun's elevation angle for every hour of the past day. Higher sun angle + clear skies = more radiant heat absorbed by the tank surface. Overcast or nighttime hours contribute zero solar gain.
          </Section>

          <Section emoji="🌬" title="Wind cooling adjustment">
            Wind accelerates how quickly product temperature chases the ambient air. Higher wind speeds increase the effective cooling rate, pulling the prediction closer to ambient on breezy days and reducing the impact of solar heating.
          </Section>

          <Section emoji="🛢" title="Large tank model — intentionally conservative">
            We model a large above-ground storage tank (~1 million gallons). Large tanks have enormous thermal mass — they heat and cool very slowly, lagging well behind ambient swings. This is <strong style={{ color: "rgba(255,255,255,0.70)" }}>intentional</strong>: we'd rather predict the product is colder and denser than it turns out to be, which keeps you safely under your weight limit.
          </Section>

          <Section emoji="🌡" title="Live ambient blending">
            The current ambient temp is gently blended into the final result to account for the last few minutes of temperature change. This keeps the prediction current without overreacting to short-term spikes.
          </Section>

          <Section emoji="🧠" title="Self-training bias correction">
            Every time you complete a load and enter the actual observed product temperature, ProTankr computes the difference between what it predicted and what you actually saw. This error is stored per terminal, per hour of day, and per month of year.
            <br /><br />
            Over time, the model learns terminal-specific patterns — for example, that a particular terminal's tanks run 5–9°F colder than predicted at 3am in March, or warmer on sunny afternoons. The correction is applied automatically on the next prediction at that terminal.
            <br /><br />
            The correction is weighted by confidence — it takes at least 3 observations before any correction is applied, and grows to full weight around 10+ observations. This prevents a single outlier from throwing off the model.
          </Section>

          <Section emoji="🎯" title="Confidence levels">
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>High</strong> — Clear skies and calm winds over the past 24h. Solar gain was predictable and the model is well-constrained.<br /><br />
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>Medium</strong> — Partly cloudy. Cloud variability introduces some uncertainty in how much solar heat the tank absorbed.<br /><br />
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>Low</strong> — Heavy cloud cover or high winds. Use the number as a starting point but lean on what you know about this terminal.
          </Section>

          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.65, color: "#fdba74", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)", borderLeft: "3px solid #fb923c", borderRadius: "0 10px 10px 0", padding: "10px 14px" }}>
            <strong style={{ color: "#fb923c", fontWeight: 900 }}>⚠ Use your judgement.</strong> Override the prediction freely — you know your terminal better than any model. It is strongly recommended <strong style={{ color: "#fb923c" }}>not to set the planned product temp above ambient</strong> unless you have full confidence from a recent BOL. When in doubt, err cold. A colder planned temp predicts denser product, which protects you from overweight loads.
          </div>

        </Accordion>

        {/* ── Weight Plan ── */}
        <Accordion title="⚖️ How the weight plan works">

          <Section emoji="🧮" title="API gravity and density">
            API gravity is the industry standard for measuring how light or heavy a petroleum product is. A lower API number means heavier product — more pounds per gallon. The plan uses the most recently observed API at this terminal (entered by the last driver) to calculate how many pounds each gallon will weigh at the planned temperature.
          </Section>

          <Section emoji="🌡" title="Temperature correction">
            Petroleum expands when warm and contracts when cold. The same number of gallons weighs more at 40°F than at 90°F. The plan corrects for this using the ASTM D1250 thermal expansion formula — the same standard used by terminals and weight enforcement.
          </Section>

          <Section emoji="🎯" title="Target weight">
            The target weight is your gross vehicle weight goal — tare weight plus payload — set conservatively below the legal limit. The plan fills compartments to hit this target, not to maximize gallons.
          </Section>

          <Section emoji="⚖️" title="CG slider">
            The center of gravity slider shifts weight distribution between the front and rear of the trailer. Moving it forward puts more weight on the drive axles; moving it rearward shifts weight toward the trailer axles. Use it to optimize axle weight distribution for your specific equipment.
          </Section>

        </Accordion>

        {/* ── Over/Under ── */}
        <Accordion title="📊 Understanding over/under">

          <Section emoji="📉" title="Why you might go over">
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>API drift</strong> is the most common cause — and the hardest to predict. When a terminal receives a new shipment, the product gravity will shift. The change is usually minor and equates to less than a couple hundred pounds in a full load. Setting the target slightly lower than legal will accommodate these minor swings.
            <br /><br />
            However, there have been black swan events in which a dramatically heavier product is received — likely a different grade from an atypical refinery. This is an outlier, but traditionally every driver would need to load significantly less than they otherwise could, all the time, just to accommodate the worst case scenario. ProTankr attempts to remedy this. The first driver to observe the drift records it, correcting the density calculation for everyone thereafter. The "as of" date shown next to the planned API in your load report tells you how stale the API reading is. A reading from four days ago is a warning sign.
            <br /><br />
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>The silver lining:</strong> the moment you enter the actual API from the BOL at the loading rack, two things happen. You will know immediately — before crossing a scale — if the load is overweight, and will have a chance to correct it, virtually eliminating any overweight tickets. The app is updated for that specific product at that terminal for every driver who loads there next. The next driver plans with your fresh observation — the community self-corrects in real time.
            <br /><br />
            <strong style={{ color: "rgba(255,255,255,0.70)" }}>Temperature</strong> is the second cause. If the product is cooler than planned it is denser, meaning more product is condensed into the same gross gallon. The pump only recognizes volume, so more product ends up on board. The temperature prediction model attempts to remedy this variable. The model has a self-training feature that over time will dial the prediction closer and closer to reality with every load. Still, there are unknown variables that cannot be fully accounted for in any model.
          </Section>

          <Section emoji="🪣" title="Drain-down calculation">
            If the load report shows you are over the legal 80,000 lb gross limit, it will calculate exactly how many gallons to drain from the rear compartment to bring you legal. This uses the actual observed density from that compartment's loaded weight and gallons.
          </Section>

        </Accordion>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
