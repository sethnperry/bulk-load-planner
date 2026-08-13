// lib/content/learnTopics.tsx
// Single source of truth for the detailed "how it works" content shared by
// two very different consumers:
//   - app/learn/page.tsx    -- in-app, dark theme, accordion-per-topic
//   - app/about/page.tsx +
//     app/about/[slug]/page.tsx -- marketing site, light theme, one card
//                                   per topic linking to its own deep-dive
//                                   page
// Editing a topic's `blocks` here updates both places at once -- that's
// the whole point of pulling this out instead of leaving it inlined in
// app/learn/page.tsx like it originally was.
//
// The body content below is deliberately theme-agnostic: no hardcoded
// colors. Emphasis uses <Em>, which renders a bare <strong> and takes its
// color from whatever `.lt-em` rule the CONSUMING page defines (dark
// Learn page vs light About page need opposite colors for the same
// semantic emphasis) -- see each consumer's own CSS for the two
// definitions.

import type { ReactNode } from "react";

export function Em({ children }: { children: ReactNode }) {
  return <strong className="lt-em">{children}</strong>;
}

export type LearnBlock =
  | { type: "section"; emoji: string; title: string; body: ReactNode }
  | { type: "divider"; label: string }
  | { type: "callout"; body: ReactNode };

export type LearnTopic = {
  slug: string;
  emoji: string;
  /** Accordion title in the in-app Learn page, and the deep-dive page's H1. */
  title: string;
  /** Short label for the About page's card grid. */
  shortName: string;
  /** One-line hook under the card title. */
  tagline: string;
  /** 1-2 paragraph "why this matters" pitch -- About card body + deep-dive intro. Not shown in-app. */
  marketing: ReactNode;
  /** The detailed, factual breakdown -- shared verbatim by both consumers. */
  blocks: LearnBlock[];
};

export const LEARN_TOPICS: LearnTopic[] = [
  // ── Equipment & compartment setup ───────────────────────────────────────
  {
    slug: "equipment-setup",
    emoji: "🚀",
    title: "How to set up the planner",
    shortName: "Equipment Setup",
    tagline: "Set it once, load in seconds.",
    marketing: (
      <>
        <p>
          Most fleet software makes you re-enter the same tare weight,
          compartment caps, and load plan every single time. ProTankr
          front-loads all of that into a five-minute setup, tied to the
          equipment itself rather than the driver — so it survives slip
          seats, trailer swaps, and shift changes without anyone re-doing
          the math.
        </p>
        <p>
          After that first setup, loading a truck is three taps: pick your
          terminal, tap a saved plan slot, hit Load. Everything else runs
          silently in the background.
        </p>
      </>
    ),
    blocks: [
      { type: "divider", label: "Step 1 — Equipment  (set it and forget it)" },
      {
        type: "section",
        emoji: "🚛",
        title: "Select your equipment",
        body: (
          <>
            Tap the equipment area at the top of the planner and select your
            truck and trailer combination. This is the most important step —
            everything in the plan flows from it.
            <br />
            <br />
            <Em>Tare weight</Em> is the empty weight of your truck and
            trailer combined. The plan subtracts this from your target gross
            weight to determine how many pounds of product you can legally
            carry.
            <br />
            <br />
            <Em>Target weight</Em> is your gross vehicle weight goal — set
            intentionally below the legal limit to give yourself a safety
            buffer for API drift and temperature variance. A good target
            leaves 200–400 lbs of room.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🔄",
        title: "Slip seating another driver's truck",
        body: (
          <>
            If you are taking over a truck someone else drove, select their
            exact combination. The compartment configuration, tare, and
            target are all tied to the equipment — not the driver. Selecting
            the right unit means the math is already dialed in from the
            previous driver's setup.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🔗",
        title: "Coupling loose units",
        body: (
          <>
            If your company has individual tractors and trailers that can be
            mixed and matched, you may need to create a combination in the
            admin page first. The reason we track them as a pair rather than
            separately is that tare weight and compartment configuration are
            specific to the trailer, while axle weights and bridge laws
            depend on how the tractor and trailer are connected. The
            combination gives the plan everything it needs to compute a
            legal, accurate load.
          </>
        ),
      },
      { type: "divider", label: "Step 2 — Compartment caps  (set it and forget it)" },
      {
        type: "section",
        emoji: "🛢",
        title: "Setting headspace caps",
        body: (
          <>
            Each compartment bar in the planner has a headspace setting —
            the percentage of capacity to leave empty at the top. Terminals
            require this for product expansion, vapor space, and safe
            transport regulations.
            <br />
            <br />
            Tap any compartment bar to set its cap. This is saved per
            trailer so you only do it once. Unless you switch trailers or
            your terminal changes its requirements, you will never need to
            touch this again.
          </>
        ),
      },
      { type: "divider", label: "Step 3 — Plan slots  (per terminal, per product)" },
      {
        type: "section",
        emoji: "📋",
        title: "What are plan slots?",
        body: (
          <>
            Plan slots are saved load configurations — which product goes
            in which compartment, at what quantity. Think of them as
            presets you build once and reuse every time you load at that
            terminal.
            <br />
            <br />
            Slots are saved <Em>per terminal</Em> rather than universally
            because different terminals carry different products, have
            different rack configurations, and may load compartments in a
            specific order. A plan that works perfectly at one terminal may
            be completely wrong at another.
            <br />
            <br />
            Most drivers have two or three slots per terminal — a full
            load, a split load with two products, and maybe a light load
            for weight-restricted routes. Build them once and they are
            there every time you pull into that terminal.
          </>
        ),
      },
      {
        type: "section",
        emoji: "⚡",
        title: "Once you are set up — it's this simple",
        body: (
          <>
            Open the app. Select your location and terminal. The planner
            shows your saved slots for that terminal. Tap the one that
            matches today's load. The plan is built instantly —
            compartments filled, weight calculated, CG balanced. Tap Load.
            Done.
            <br />
            <br />
            The whole process from opening the app to starting the load
            takes under a minute. Everything you set up in steps 1 and 2
            runs silently in the background every time.
          </>
        ),
      },
    ],
  },

  // ── Temperature prediction ──────────────────────────────────────────────
  {
    slug: "temperature-prediction",
    emoji: "🌡",
    title: "How the temperature prediction works",
    shortName: "Temperature Prediction",
    tagline: "Know your weight before the sun does.",
    marketing: (
      <>
        <p>
          Product temperature is one of the biggest hidden variables in a
          load — colder product is denser, so the same gallon count weighs
          more. Guess wrong and you're either leaving gallons on the table
          out of caution, or finding out you're overweight at the scale.
        </p>
        <p>
          ProTankr predicts product temperature from real weather data and
          the physics of a large storage tank, then keeps correcting itself
          against what actually happened at each terminal — while always
          leaving the final call to you.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "🌤",
        title: "30 hours of weather history",
        body: (
          <>
            We pull hourly temperature, wind speed, and cloud cover from
            OpenWeather for the past 24–30 hours at this terminal's
            location. This gives the model a full picture of how the
            environment has been heating or cooling the storage tank.
          </>
        ),
      },
      {
        type: "section",
        emoji: "☀️",
        title: "Solar gain calculation",
        body: (
          <>
            Using the terminal's exact latitude and longitude, we calculate
            the sun's elevation angle for every hour of the past day.
            Higher sun angle + clear skies = more radiant heat absorbed by
            the tank surface. Overcast or nighttime hours contribute zero
            solar gain.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌬",
        title: "Wind cooling adjustment",
        body: (
          <>
            Wind accelerates how quickly product temperature chases the
            ambient air. Higher wind speeds increase the effective cooling
            rate, pulling the prediction closer to ambient on breezy days
            and reducing the impact of solar heating.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🛢",
        title: "Large tank model — intentionally conservative",
        body: (
          <>
            We model a large above-ground storage tank (~1 million
            gallons). Large tanks have enormous thermal mass — they heat
            and cool very slowly, lagging well behind ambient swings. This
            is <Em>intentional</Em>: we'd rather predict the product is
            colder and denser than it turns out to be, which keeps you
            safely under your weight limit.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌡",
        title: "Live ambient blending",
        body: (
          <>
            The current ambient temp is gently blended into the final
            result to account for the last few minutes of temperature
            change. This keeps the prediction current without overreacting
            to short-term spikes.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🧠",
        title: "Self-training bias correction",
        body: (
          <>
            Every time you complete a load and enter the actual observed
            product temperature, ProTankr computes the difference between
            what it predicted and what you actually saw. This error is
            stored per terminal, per hour of day, and per month of year.
            <br />
            <br />
            Over time, the model learns terminal-specific patterns — for
            example, that a particular terminal's tanks run 5–9°F colder
            than predicted at 3am in March, or warmer on sunny afternoons.
            The correction is applied automatically on the next prediction
            at that terminal.
            <br />
            <br />
            The correction is weighted by confidence — it takes at least 3
            observations before any correction is applied, and grows to
            full weight around 10+ observations. This prevents a single
            outlier from throwing off the model.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🎯",
        title: "Confidence levels",
        body: (
          <>
            <Em>High</Em> — Clear skies and calm winds over the past 24h.
            Solar gain was predictable and the model is well-constrained.
            <br />
            <br />
            <Em>Medium</Em> — Partly cloudy. Cloud variability introduces
            some uncertainty in how much solar heat the tank absorbed.
            <br />
            <br />
            <Em>Low</Em> — Heavy cloud cover or high winds. Use the number
            as a starting point but lean on what you know about this
            terminal.
          </>
        ),
      },
      {
        type: "callout",
        body: (
          <>
            <strong>⚠ Use your judgement.</strong> Override the prediction
            freely — you know your terminal better than any model. It is
            strongly recommended <strong>not to set the planned product
            temp above ambient</strong> unless you have full confidence from
            a recent BOL. When in doubt, err cold. A colder planned temp
            predicts denser product, which protects you from overweight
            loads.
          </>
        ),
      },
    ],
  },

  // ── Weight plan ──────────────────────────────────────────────────────────
  {
    slug: "weight-plan",
    emoji: "⚖️",
    title: "How the weight plan works",
    shortName: "Weight Plan",
    tagline: "Real physics, not guesswork.",
    marketing: (
      <>
        <p>
          For years, the only defense against an overweight ticket was
          loading conservatively — because doing the real density and
          thermal-expansion math by hand, for every load, at every
          terminal, isn't realistic on a schedule measured in minutes.
        </p>
        <p>
          ProTankr runs the actual ASTM D1250 calculation automatically —
          the same standard terminals and weight enforcement use — so you
          can load to your real legal capacity instead of a safety margin
          built on guesswork.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "🧮",
        title: "API gravity and density",
        body: (
          <>
            API gravity is the industry standard for measuring how light or
            heavy a petroleum product is. A lower API number means heavier
            product — more pounds per gallon. The plan uses the most
            recently observed API at this terminal (entered by the last
            driver) to calculate how many pounds each gallon will weigh at
            the planned temperature.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌡",
        title: "Temperature correction",
        body: (
          <>
            Petroleum expands when warm and contracts when cold. The same
            number of gallons weighs more at 40°F than at 90°F. The plan
            corrects for this using the ASTM D1250 thermal expansion
            formula — the same standard used by terminals and weight
            enforcement.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🎯",
        title: "Target weight",
        body: (
          <>
            The target weight is your gross vehicle weight goal — tare
            weight plus payload — set conservatively below the legal limit.
            The plan fills compartments to hit this target, not to maximize
            gallons.
          </>
        ),
      },
      {
        type: "section",
        emoji: "⚖️",
        title: "CG slider",
        body: (
          <>
            The center of gravity slider shifts weight distribution between
            the front and rear of the trailer. Moving it forward puts more
            weight on the drive axles; moving it rearward shifts weight
            toward the trailer axles. Use it to optimize axle weight
            distribution for your specific equipment.
          </>
        ),
      },
    ],
  },

  // ── Self-correcting network (over/under) ───────────────────────────────
  {
    slug: "self-correcting-network",
    emoji: "📊",
    title: "Understanding over/under",
    shortName: "Self-Correcting Network",
    tagline: "Every load makes the next one smarter.",
    marketing: (
      <>
        <p>
          Every driver at a terminal is fighting the same invisible enemy:
          a density reading that's gone stale since the last shipment came
          in. Traditionally, everyone pays for that uncertainty by loading
          light, all the time, just to cover the worst case.
        </p>
        <p>
          ProTankr turns that around. The first driver to observe a shift
          corrects it for every driver who loads there next — across every
          company, in real time — instead of everyone independently
          re-discovering the same surprise.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "📉",
        title: "Why you might go over",
        body: (
          <>
            <Em>API drift</Em> is the most common cause — and the hardest
            to predict. When a terminal receives a new shipment, the
            product gravity will shift. The change is usually minor and
            equates to less than a couple hundred pounds in a full load.
            Setting the target slightly lower than legal will accommodate
            these minor swings.
            <br />
            <br />
            However, there have been black swan events in which a
            dramatically heavier product is received — likely a different
            grade from an atypical refinery. This is an outlier, but
            traditionally every driver would need to load significantly
            less than they otherwise could, all the time, just to
            accommodate the worst case scenario. ProTankr attempts to
            remedy this. The first driver to observe the drift records it,
            correcting the density calculation for everyone thereafter. The
            "as of" date shown next to the planned API in your load report
            tells you how stale the API reading is. A reading from four
            days ago is a warning sign.
            <br />
            <br />
            <Em>The silver lining:</Em> the moment you enter the actual API
            from the BOL at the loading rack, two things happen. You will
            know immediately — before crossing a scale — if the load is
            overweight, and will have a chance to correct it, virtually
            eliminating any overweight tickets. The app is updated for that
            specific product at that terminal for every driver who loads
            there next. The next driver plans with your fresh observation —
            the community self-corrects in real time.
            <br />
            <br />
            <Em>Temperature</Em> is the second cause. If the product is
            cooler than planned it is denser, meaning more product is
            condensed into the same gross gallon. The pump only recognizes
            volume, so more product ends up on board. The temperature
            prediction model attempts to remedy this variable. The model
            has a self-training feature that over time will dial the
            prediction closer and closer to reality with every load. Still,
            there are unknown variables that cannot be fully accounted for
            in any model.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🪣",
        title: "Drain-down calculation",
        body: (
          <>
            If the load report shows you are over the legal 80,000 lb gross
            limit, it will calculate exactly how many gallons to drain from
            the rear compartment to bring you legal. This uses the actual
            observed density from that compartment's loaded weight and
            gallons.
          </>
        ),
      },
    ],
  },
];

export function getLearnTopic(slug: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.slug === slug);
}
