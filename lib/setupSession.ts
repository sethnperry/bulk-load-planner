// lib/setupSession.ts
// Admin "Set up planner for user" session.
// Uses sessionStorage so it clears when the browser closes.
// Never touches auth — only overrides which userId the planner
// uses for equipment/location/plan slot persistence.

const KEY = "protankr_setup_session_v1";

export type SetupSession = {
  targetUserId: string;
  targetDisplayName: string;
  adminUserId: string;
  // Where "← Return to Admin" should navigate back to when exiting this
  // session -- defaults to "/admin" (the original /admin-page entry point)
  // when omitted, but the Dispatch tab's "Use app as {driver}" entry point
  // sets this to "/calculator/dispatch" so exiting lands back where the
  // admin actually started, not a page they never visited.
  returnTo?: string;
};

export function getSetupSession(): SetupSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.targetUserId || !parsed?.adminUserId) return null;
    return parsed as SetupSession;
  } catch {
    return null;
  }
}

export function startSetupSession(session: SetupSession) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function clearSetupSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
