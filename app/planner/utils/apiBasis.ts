// apiBasis.ts
// Resolves WHICH API a planned product's density stands on, and how much to
// trust it -- the single source of truth shared by the density calc
// (page.tsx lbsPerGalForProductId) and Plan Review's Tune-panel display, so
// the number the driver sees and the number the gallons are computed from can
// never disagree.
//
// Confidence tiers (per explicit driver direction):
//   tuned        -- the driver's own gauge/BOL entry (highest trust)   [green]
//   fresh6h      -- a real reading updated within the last 6 hours       [green]
//   fresh7d      -- a real reading updated within the stale window       [white]
//   terminalMin  -- no fresh reading; using the terminal's observed
//                   minimum (heaviest seen here) -- a safe fallback       [amber]
//   productMin   -- nothing observed here; the product's published
//                   minimum (heaviest spec) -- least confidence           [red]
//
// Safety: whenever a fresh reading isn't available, density falls back to the
// HEAVIEST minimum available (lower API = denser), so a stale or unknown
// reading can only ever make the plan more conservative, never lighter.

// Back-correct an observed API at temp to API_60 (same formula as
// planMath.backCorrectApiTo60 -- inlined here to keep this module dependency-
// free so it runs under the node test runner without ESM extension gymnastics).
function backCorrectApiTo60(observedApi: number, observedTempF: number, alphaPerF: number): number {
  return observedApi + alphaPerF * (observedTempF - 60);
}

export type ApiTier = "tuned" | "fresh6h" | "fresh7d" | "terminalMin" | "productMin";

export type ApiBasisInput = {
  alphaPerF: number;
  api60Ref: number;               // products.api_60 (last-resort reference)
  apiMin: number | null;          // products.api_min (published heaviest)
  minApiObserved: number | null;  // rack_product_status.min_api_observed
  lastApi: number | null;         // last observed API at this terminal
  lastTempF: number | null;       // temp that reading was observed at
  lastApiUpdatedAt: string | null;
  tuned: { api: number; tempF: number } | null;
  nowMs: number;
  staleDays: number;              // freshness threshold (tunable later)
};

export type ApiBasis = {
  api60: number;      // API_60 the density calc should use
  displayApi: number; // the API value to SHOW in the Tune line
  tier: ApiTier;
};

const SIX_HOURS_MS = 6 * 3600 * 1000;

export function resolveApiBasis(inp: ApiBasisInput): ApiBasis {
  const alpha = Number(inp.alphaPerF);

  // 1. Driver's own tuned reading wins outright.
  if (inp.tuned && Number.isFinite(inp.tuned.api) && Number.isFinite(inp.tuned.tempF)) {
    return {
      api60: backCorrectApiTo60(Number(inp.tuned.api), Number(inp.tuned.tempF), alpha),
      displayApi: Number(inp.tuned.api),
      tier: "tuned",
    };
  }

  // 2. A real observed reading, if it's still fresh (within the stale window).
  if (inp.lastApi != null && Number.isFinite(inp.lastApi) && inp.lastApiUpdatedAt) {
    const t = new Date(inp.lastApiUpdatedAt).getTime();
    if (!Number.isNaN(t)) {
      const ageMs = inp.nowMs - t;
      if (ageMs <= inp.staleDays * 86400000) {
        const observedTemp = inp.lastTempF != null && Number.isFinite(inp.lastTempF) ? Number(inp.lastTempF) : 60;
        return {
          api60: backCorrectApiTo60(Number(inp.lastApi), observedTemp, alpha),
          displayApi: Number(inp.lastApi),
          tier: ageMs <= SIX_HOURS_MS ? "fresh6h" : "fresh7d",
        };
      }
    }
  }

  // 3. Stale or no reading -> heaviest available minimum (lower API = heavier),
  //    preferring the terminal's own observed minimum when it exists.
  const apiMin = inp.apiMin != null && Number.isFinite(inp.apiMin) ? Number(inp.apiMin) : Number(inp.api60Ref);
  if (inp.minApiObserved != null && Number.isFinite(inp.minApiObserved)) {
    const heaviest = Math.min(Number(inp.minApiObserved), apiMin);
    return { api60: heaviest, displayApi: heaviest, tier: "terminalMin" };
  }
  return { api60: apiMin, displayApi: apiMin, tier: "productMin" };
}

// Tier -> confidence color, matching the temp prediction's own palette so the
// whole Tune line reads as one confidence signal.
export function apiTierColor(tier: ApiTier): string {
  switch (tier) {
    case "tuned": return "#4ade80";      // green -- driver's own reading
    case "fresh6h": return "#4ade80";    // green -- high confidence
    case "fresh7d": return "#ffffff";    // white -- normal
    case "terminalMin": return "#fbbf24"; // amber -- medium (terminal minimum)
    case "productMin": return "#f87171";  // red   -- no confidence (spec minimum)
  }
}
