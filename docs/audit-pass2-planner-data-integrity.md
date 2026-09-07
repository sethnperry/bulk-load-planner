# Pass 2 — Planner / Data Integrity

Method: full-DB integrity sweep (service-role JSON aggregate) + live scoping
tests as two users + write-path/code review. Cross-company scoping of the
planner tables (plan slots, cards, terminal_access, combos, vault, dispatch
notes/schedules) was already verified in Pass 1; this pass adds referential
integrity, state-drift, duplicates, and cross-user forge tests.

## CLEAN (verified)
Integrity sweep (whole DB, service-role) returned 0 for all of:
- orphaned load_lines, orphaned rack_arms, orphaned rack_lanes
- terminals without a rack (my earlier "2" was a PostgREST 1000-row cap
  artifact; the aggregate confirms 0)
- duplicate my_terminals / terminal_access / user_terminal_cards per
  (user_id, terminal_id)
- combos claimed by a non-member of the combo's company; users with >1 active
  claimed combo; combos with no equipment
- load_lines on 'loaded' loads missing actuals; load_utilization without a
  capacity snapshot
- abandoned 'planned' load_log rows > 24h — and `distinct_load_statuses` is
  just `['loaded']`, so no stale planned rows exist at all (the begin_load
  pre-delete + the single-status reality hold up live)

Product/rack synchronization (global catalog, inspected live):
- products.canonical_product_id: no dangling / self-referential rows
- api_min <= api_60 <= api_max invariant holds for all 37 products (the seed
  worked)
- rack_product_status: no rows referencing a non-existent product;
  min_api_observed never exceeds last_api

Cross-user forge (as Alpha, targeting Beta's user_id): INSERT into
user_plan_slots and user_terminal_cards both RLS-blocked (42501). Saved plans
and cards enforce user_id = auth.uid() on write.

## FINDINGS (both LOW — data cleanup, not security)

### P2-A [LOW-MED] user_plan_slots: stale multi-generation preset rows
Preset storage has been through three scoping schemes — per-terminal (real
terminal_id + real combo_id) → fully-universal (terminal_id/combo_id both
'__universal__', 2026-08-06) → combo-scoped (terminal_id='__universal__',
real combo_id, 2026-08-27). Superseded rows were never cleaned up: **54 of
77** preset rows (slot>0) are the old per-terminal generation that the
current combo-scoped read path never reads. Bloat + latent correctness risk
given this area's documented preset-loss bug history. Not a security issue
(each row is still the owner's own, RLS-scoped).

Conservative cleanup (below) deletes an old per-terminal preset row only when
a '__universal__' row exists for the same (user_id, slot), so no user loses
their last remaining copy of a preset.

### P2-B [LOW] Orphaned primary-equipment pointers
7 rows (2 user_primary_trucks, 5 user_primary_trailers) point to trucks/
trailers that no longer exist. Root cause: `user_primary_trucks.truck_id`,
`user_primary_trailers.trailer_id` (and `decouple_events.truck_id/trailer_id`)
are **text with no FK constraint**, so equipment deletion doesn't cascade the
pointer. The app tolerates a missing primary (falls back), so impact is bloat,
but orphans will keep accumulating.

### Structural note (root cause of P2-B) — not fixed here
Several id columns are `text` instead of `uuid` and carry no foreign key:
`user_primary_trucks.truck_id`, `user_primary_trailers.trailer_id`,
`decouple_events.truck_id/trailer_id`. Without FKs there's no referential
integrity — orphans are silently allowed. Converting these to `uuid` + real
FKs (with ON DELETE handling) is a worthwhile hardening pass but touches the
data model, so it belongs in its own focused change (like F-A), not bundled
into this audit.

## CLEANUP SQL (optional; bulk DELETE on live data — operator's call to run)

```sql
-- P2-B: drop orphaned primary-equipment pointers
delete from public.user_primary_trucks p
 where not exists (select 1 from public.trucks t where t.truck_id::text = p.truck_id);
delete from public.user_primary_trailers p
 where not exists (select 1 from public.trailers t where t.trailer_id::text = p.trailer_id);

-- P2-A: drop stale per-terminal preset rows, but ONLY where a universal-scope
-- row already exists for that user+slot (so no preset content is lost).
delete from public.user_plan_slots s
 where s.slot > 0
   and s.terminal_id <> '__universal__'
   and exists (
     select 1 from public.user_plan_slots u
     where u.user_id = s.user_id and u.slot = s.slot and u.terminal_id = '__universal__'
   );
```

Not written as a numbered migration because it's a one-time data cleanup on
the live (single-operator) DB, and this project's posture flags bulk DELETEs
for explicit go-ahead rather than auto-applying them.
