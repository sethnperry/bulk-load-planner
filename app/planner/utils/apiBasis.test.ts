// app/planner/utils/apiBasis.test.ts
//
// Confidence-tier resolution for the API a planned load's density stands on.
// Safety property: whenever a fresh reading isn't available, density must fall
// back to the HEAVIEST minimum (lower API), so a stale/unknown reading can only
// make the plan more conservative, never lighter.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveApiBasis } from "./apiBasis.ts";

const BASE = {
  alphaPerF: 0.0004,
  api60Ref: 40,
  apiMin: 35,
  minApiObserved: null as number | null,
  lastApi: null as number | null,
  lastTempF: null as number | null,
  lastApiUpdatedAt: null as string | null,
  tuned: null as { api: number; tempF: number } | null,
  nowMs: Date.parse("2026-09-08T12:00:00Z"),
  staleDays: 7,
};

test("tuned reading wins and is tier 'tuned'", () => {
  const b = resolveApiBasis({ ...BASE, tuned: { api: 36.7, tempF: 92.6 } });
  assert.equal(b.tier, "tuned");
  assert.equal(b.displayApi, 36.7);
});

test("reading updated within 6h is tier 'fresh6h'", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 80, lastApiUpdatedAt: "2026-09-08T09:00:00Z" });
  assert.equal(b.tier, "fresh6h");
  assert.equal(b.displayApi, 42);
});

test("reading updated 2 days ago is tier 'fresh7d'", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 80, lastApiUpdatedAt: "2026-09-06T12:00:00Z" });
  assert.equal(b.tier, "fresh7d");
});

test("reading older than the stale window falls back off the reading", () => {
  // 10 days old, terminal has an observed minimum -> terminalMin, NOT the stale reading.
  const b = resolveApiBasis({ ...BASE, lastApi: 45, lastTempF: 80, lastApiUpdatedAt: "2026-08-29T12:00:00Z", minApiObserved: 33 });
  assert.equal(b.tier, "terminalMin");
  assert.notEqual(b.displayApi, 45); // the stale reading is NOT used
});

test("no reading + terminal minimum -> tier 'terminalMin', heaviest of the two", () => {
  // minObserved 33 is heavier (lower) than apiMin 35 -> use 33.
  const heavy = resolveApiBasis({ ...BASE, minApiObserved: 33 });
  assert.equal(heavy.tier, "terminalMin");
  assert.equal(heavy.displayApi, 33);
  // minObserved 38 is LIGHTER than apiMin 35 -> stay at 35 for safety, still amber.
  const safe = resolveApiBasis({ ...BASE, minApiObserved: 38 });
  assert.equal(safe.tier, "terminalMin");
  assert.equal(safe.displayApi, 35, "must not pick a lighter fallback than the product minimum");
});

test("no reading + no terminal minimum -> tier 'productMin' at api_min", () => {
  const b = resolveApiBasis({ ...BASE });
  assert.equal(b.tier, "productMin");
  assert.equal(b.displayApi, 35);
});

test("productMin falls back to api_60 when api_min is missing", () => {
  const b = resolveApiBasis({ ...BASE, apiMin: null });
  assert.equal(b.tier, "productMin");
  assert.equal(b.displayApi, 40);
});
