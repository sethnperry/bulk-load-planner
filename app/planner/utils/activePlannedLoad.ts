// activePlannedLoad.ts
// A tiny localStorage marker recording the load a driver is CURRENTLY in the
// middle of -- begin_load ran (a status='planned' load_log row exists) but
// complete_load hasn't. Written at begin, cleared at complete/cancel.
//
// It exists to resume an in-progress plan across an app close/reopen. By
// default usePlanSlots deliberately DISCARDS an unfinalized in-progress plan
// on a fresh mount (so only a completed load's residue pre-fills) -- see that
// file's own comment. This marker is the one exception: when it's present for
// the current combo, the fresh-mount discard is skipped so the plan the driver
// was actually mid-load on comes back, and useLocation restores its terminal
// instead of snapping to the last completed load's terminal.
//
// Deliberately a synchronous localStorage read (not a DB query) so the
// delicate fresh-mount discard stays synchronous and race-free -- the load's
// own status is authoritative in the DB, but this hint only ever RESTORES a
// plan the driver already had; the worst case of a stale marker (a completion
// whose clear was missed) is showing that last plan, which the app's
// slip-seat residue would show anyway, and a fresh LOAD tap always pre-deletes
// any orphaned planned row and begins clean.
//
// User-scoped key (carries comboId in the value) so both usePlanSlots (which
// knows the combo) and useLocation (which doesn't) can read it with just the
// user id.

export type ActivePlannedLoad = {
  loadId: string;
  comboId: string;
  terminalId: string;
  rackId: string | null;
  state: string;
  city: string;
  savedAt: number;
};

function keyFor(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:activePlannedLoad`;
}

export function writeActivePlannedLoad(
  userId: string | null | undefined,
  v: Omit<ActivePlannedLoad, "savedAt">
): void {
  const k = keyFor(userId);
  if (!k || typeof window === "undefined") return;
  try { window.localStorage.setItem(k, JSON.stringify({ ...v, savedAt: Date.now() })); } catch {}
}

export function readActivePlannedLoad(userId: string | null | undefined): ActivePlannedLoad | null {
  const k = keyFor(userId);
  if (!k || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return null;
    const v = JSON.parse(raw) as ActivePlannedLoad;
    return v && v.loadId && v.comboId ? v : null;
  } catch { return null; }
}

export function clearActivePlannedLoad(userId: string | null | undefined): void {
  const k = keyFor(userId);
  if (!k || typeof window === "undefined") return;
  try { window.localStorage.removeItem(k); } catch {}
}
