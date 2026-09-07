# Pass 3 — Real-World Driver UX

Pass 3 is inherently device-centric; this doc splits into (1) what code review
can assess now and (2) a real-device walkthrough checklist for the operator
(now runnable, since the branch is merged to main and deployed).

## Code-review findings

### SOUND
- **PWA update strategy** (`public/sw.js`, `ServiceWorkerRegistration.tsx`):
  network-first for navigations + API/Supabase/auth, cache-first only for
  content-hashed build assets; SW registers prod-only, calls `reg.update()` on
  tab focus, auto-reloads on `controllerchange` only when already controlled.
  No stale-cache trap — deploys take effect on next open. (This is why
  "changes not showing on device" was purely the unmerged-branch deploy gap,
  not caching.)
- **Orientation**: `manifest.json` `orientation: "any"` — matches the
  landscape work; installed PWA can rotate.
- **First-run gating** (`SetupGate.tsx`): clean guided sequence — equipment →
  location → terminal → LOAD. Signup path provisions a solo company
  (`provision_solo_company`) then walks the same gate.
- **iOS input-zoom guard**: the blown-up numeric entry (`ValueEntryOverlay`,
  40px input) and several others use >=16px fonts, avoiding iOS focus-zoom on
  the most-used inputs.

### P3-1 [LOW-MED] Error surfacing uses native `alert()` (7 sites)
`useLoadWorkflow.ts` (begin_load 264, validation 322/325, complete_load 616),
`MyLoadsModal`, `DocHub`. Native `alert()` is blocking, unthemed, and drops
context. `complete_load` at least keeps the modal open on error (retryable);
`begin_load` just alerts and the driver re-taps LOAD. Recommend replacing the
load-path alerts with in-app themed error/retry UI (the Loading modal already
has an `errorMessage` slot). UX, not correctness.

### P3-2 [MED for field use] No offline resilience on load writes
No `navigator.onLine` check or write queue. At a terminal with weak signal,
`begin_load`/`complete_load` fail and require manual retry; a driver who
completes a physical load and then loses signal + navigates away could lose
the submission. `complete_load` keeping the modal open mitigates (retry in
place), but there's no background queue/resend. A real offline-queue is a
feature, not a quick fix — flagged for its own scoped work, not this pass.

### P3-3 [LOW] Reload mid-load loses the in-progress modal
`activeLoadId` is React state, not persisted, so a page reload between LOAD
and Complete drops the Loading modal. The plan itself is autosaved (slot 0)
and restored, and re-tapping LOAD pre-deletes the orphaned planned row and
re-begins — so no data loss, but the in-progress state isn't resumed. Could
persist `activeLoadId` (sessionStorage) and re-open the modal on reload if
field feedback shows this matters.

### P3-4 [LOW] Accessibility coverage is thin
~12 `aria-label` + ~11 `role=` across the whole app. Header icon buttons are
labeled; broader screen-reader support (form labels, live regions for
errors, focus management in modals) is limited. Low priority for a
gloved-driver tool, but worth a pass before any accessibility commitment.

## Real-device walkthrough checklist (operator)
Run these on the actual phone/PWA — they can't be verified from code:

1. **Deploy landed**: open the app; confirm the new Loading modal (tap LOAD →
   Confirm Temp → Plan Review with clean compartments + in-modal Log the Load
   / Update Card / Report Terminal Issue / Back to Planner).
2. **Stale-API overlay**: at a terminal with an old/absent reading, LOAD →
   confirm the Good/Better/Best (Safest/Safe/Ignore) prompt appears and the
   plan re-solves heavier.
3. **Orientation**: rotate mid-plan; confirm the landscape layout and that
   nothing runs off-screen (the safe-area/nav-bar work).
4. **Touch targets**: gloved taps on compartment bars, CG puck, LOAD, tab
   bar, icon rail — no fat-finger misses.
5. **High-glare / outdoor**: readability of the dark theme + confidence
   colors in direct sun.
6. **Poor signal**: airplane-mode mid-LOAD and mid-Complete — confirm the
   error is understandable and retry works when signal returns; confirm no
   silent data loss.
7. **Reload/recovery**: reload the PWA mid-plan; confirm the plan is restored
   (slot 0 autosave) and you can re-LOAD cleanly.
8. **Keyboard**: numeric entry (gallons/API/temp) brings up the number pad,
   doesn't zoom the viewport, and Enter/Set commits.
9. **First-run**: fresh signup → solo company provisioned → guided
   equipment/location/terminal → first successful load.
10. **Marketing → signup → first load**: full path from protankr.com through
    /get-the-app / login to a completed load.

Items 1–3, 6, 7 are the highest-value given this session's recent work
(loading modal, stale-API, landscape, deploy pipeline).
