# Load Lifecycle Audit — 2026-09-06

Branch: `claude/protankr-pre-audit-remediation-8l1t8w`. Code-analysis pass over
`useLoadWorkflow.ts`, `page.tsx` (LOAD button / temp-confirm / CancelLoadSheet),
`begin_load`/`complete_load`/`delete_load` RPCs, `usePlanSlots`, `useLoadHistory`,
plus live PostgREST probes against the demo companies. No browser was available,
so device-level scenarios (kill PWA, offline, two physical devices) are reasoned
from the code + DB, not clicked through.

## State machine

```
(no load) --tap LOAD--> [temp confirm modal] --Confirm & Continue-->
  begin_load()  ⇒ load_log row status='planned' (+ load_lines)   [activeLoadId set]
  --Plan Review modal--> Complete --> CancelLoadSheet:
     • "Log the Load"  ⇒ complete_load() ⇒ status='loaded'       [activeLoadId cleared]
     • "Back to Planner"⇒ cancelActiveLoad ⇒ delete_load()       [row removed, activeLoadId cleared]
     • "Update Card"    ⇒ keeps the planned row, re-cards
```

- `activeLoadId` is **in-memory React state only** — never rehydrated on mount.
- `begin_load` first **deletes every existing `status='planned'` row for the
  same (user, combo)** before inserting the new one (the orphan-prevention fix).
- `complete_load` has **no already-completed guard** ("allows re-completion with
  updated values") — updates the row by `load_id`, never inserts.
- `delete_load` is owner-checked and deletes `load_lines` + `load_log` for any
  status.
- Last-load / slip-seat / recall (`usePlanSlots`) only ever read
  `status='loaded'` — a `planned` orphan can never masquerade as the last load.

## Findings

### F1 — Completed load can be deleted after a lost completion response  · MED
The one genuine data-loss path. `complete_load` commits `status='loaded'`
server-side; if the **response** is lost (network drop at that instant), the
client falls into `catch`, shows an error, and **keeps `activeLoadId` set with
the modal open**. If the driver then taps **"Back to Planner"** (instead of
retrying), `cancelActiveLoad → delete_load(activeLoadId)` **deletes the load
that actually completed**. Requires commit-then-response-loss followed by the
driver choosing Back-to-Planner over retry — rare, but it destroys a real
completed load with no recovery.
**Recommended fix (small, server-checkable):** in `cancelActiveLoad`, re-read
the row's status first and only `delete_load` when it is still `'planned'`; if
it is already `'loaded'`, treat it as a successful completion (close, clear
`activeLoadId`, surface the report) instead of deleting. This does not touch
`delete_load` itself (still used by My Loads for intentional deletes).

### F2 — Same user, two tabs/devices, same combo: one load silently wiped · LOW/MED
`begin_load`'s cleanup deletes all `planned` rows for `(user, combo)`. If the
same user has the planner open twice on the same combo and taps LOAD in the
second, the **first tab's in-progress `planned` row is deleted**. The first tab
still holds that `activeLoadId` in memory; tapping Complete there → `complete_load`
→ `load_not_found`. Client/server divergence: tab 1 believes it has a live load
that no longer exists. (Cross-**driver** is unaffected — the cleanup is
per-user.) Real-world likelihood is low for a field driver, higher for an
operator with two tabs open.
**Recommended:** scope the cleanup to rows older than the current session, or
skip deleting a `planned` row whose `started_at` is within the last few minutes;
or accept it and document (one physical load = one device is the intended model).

### F3 — Orphaned `planned` rows accumulate (slowly) and show in My Loads · LOW
A LOAD tapped but never completed (app backgrounded/closed, refresh, lost
begin_load response after commit) leaves a `planned` row. `begin_load`'s cleanup
removes it on the **next** load of that same combo, so a combo the driver never
loads again keeps its one orphan forever. `useLoadHistory` has **no status
filter**, so these render as blank "PLANNED" rows in My Loads (driver can delete
them manually). Live check: the demo admin has 283 `loaded` / **1** `planned`
(aged 24.6 h) — contained, not a leak.
The written sweep `20260817000000_cleanup_orphaned_planned_loads.sql` is a
**one-shot** `DELETE` that is **not applied and has no recurring schedule**, so
nothing prunes an abandoned-combo orphan automatically.
**Recommended:** either filter `useLoadHistory` to `status='loaded'` (hide
planned from history entirely) or add a recurring sweep (pg_cron / scheduled
function) of `planned` rows older than 24 h. Prefer the history filter — it is
purely client-side and removes the visible symptom immediately.

### F4 — Double-tap Load  · LOW (mitigated)
Tapping the LOAD button twice only re-opens the temp-confirm modal (idempotent).
Double-tapping **"Confirm & Continue"** could, in a sub-render-tick race, call
`beginLoadToSupabase` twice — the `if (beginLoadBusy) return` guard reads a
possibly-stale closure value. Worst case: two `planned` rows briefly, the extra
one cleaned up on the next begin_load (an F3 orphan). No duplicate `loaded` row
is possible from this path. The modal closing on first tap removes the second
target in practice.
**Recommended (optional):** set a synchronous `useRef` "in-flight" flag at the
top of `handleConfirmTempAndBeginLoad` to close the race fully.

### F5 — Duplicate completion double-counts temp bias  · LOW
Because `complete_load` has no already-completed guard, tapping Complete twice
(or a retry after a lost response, per F1) re-runs it. The `load_log` row is
idempotent (updated by id) and `record_load_utilization` upserts idempotently —
but the `update_terminal_temp_bias` call fires **again**, feeding a second
sample of the same observed error into the Welford running mean. One extra
sample per duplicate completion; negligible at scale, non-security.
**Recommended:** gate the temp-bias write on the load transitioning
`planned→loaded` (skip it when the row was already `loaded`), or accept it.

### F6 — Refresh mid-Plan-Review loses the plan (no resume)  · LOW (by design)
`activeLoadId` is memory-only; a refresh while the Plan Review / CancelLoadSheet
is open drops it. The `planned` row persists (becomes an F3 orphan) and the
driver must re-tap LOAD. Nothing rehydrates an in-progress load on mount. This
is acceptable for the workflow (the plan is re-derivable), but there is no
"you have a load in progress" resume affordance.

## What is SOUND (verified, no action)

- **No duplicate `loaded` rows** from the normal single-device flow: begin
  creates one `planned` row, complete flips it in place.
- **begin_load cleanup only ever deletes `planned`** (`.eq("status","planned")`)
  — never a completed load.
- **Orphans are inert to app logic**: last-load / slip-seat / recall read only
  `status='loaded'`.
- **A failed begin_load leaves the client clean** (no `activeLoadId`, no modal);
  the RPC is one atomic transaction, so a thrown error rolls back with no partial
  row. A committed-but-response-lost begin_load leaves a `planned` orphan (F3),
  self-healed on the next load.
- **Completion errors keep the driver in the modal** with the load intact for
  retry (except the F1 Back-to-Planner branch).
- **Mid-load terminal switch** is explicitly handled (TerminalSwitchDuringLoadSheet
  retags `load_log.terminal_id`); equipment cannot be changed while the Loading
  modal is open.
- **Cross-company / cross-driver isolation** on all load RPCs — verified in the
  security pass (begin_load now company-checked; complete_load / delete_load
  owner-checked).

## Priority

If any are actioned: **F1** (real data loss, small safe fix) first, then **F3**
(the `useLoadHistory` status filter — one line, removes the visible orphan
symptom). F2/F4/F5/F6 are low-severity edge cases acceptable for a pre-launch,
one-operator app; revisit before real multi-driver load. None is a security
issue and none needs a migration.
