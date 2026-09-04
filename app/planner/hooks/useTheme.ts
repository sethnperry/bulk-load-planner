"use client";
// hooks/useTheme.ts
// Planner theme -- always dark now (the light-mode toggle was removed, per
// explicit direction: "we may ultimately lock in on dark mode only and just
// do away with the option to change to light mode... this way it always
// blends with [the device's status bar/system chrome] like it's continuous").
// Custom accent color is still supported, persisted per-user in
// localStorage (same protankr_<feature>_v<N>:<userId-or-anon> convention as
// useEquipment.ts/useLocation.ts) -- only the dark/light half of this hook
// was removed, not accent customization.
//
// darkMode is now a plain constant, not state -- there's nothing to
// initialize asynchronously or flash-of-default correct for anymore (the
// 2026-08-06/2026-08-19 history below this comment, describing exactly that
// class of bug for the OLD toggleable darkMode, no longer applies to this
// field at all -- kept only as a record of why accentColor's own resolution
// below still follows that same SSR-safe pattern, since accentColor genuinely
// is still async/per-user state).
//
// Historical note (accentColor's own flash-of-default fix, 2026-08-19):
// authUserId itself only resolves asynchronously (CalculatorShellContext's
// own supabase.auth.getUser() effect), so the per-user storage key isn't
// knowable on the very first render -- accentColor used to start at the
// hardcoded default (null) and only get corrected once userId showed up.
// A device-wide DEVICE_KEY mirror, read in a client-only effect (never
// during SSR, so there's no server/client mismatch to resolve), fixes this
// the same way this codebase's useNow() hook fixes an analogous SSR/client
// clock mismatch.

import { useCallback, useEffect, useMemo, useState } from "react";

function storageKey(userId: string) {
  return `protankr_theme_v1:${userId || "anon"}`;
}
const DEVICE_KEY = "protankr_theme_v1:__device__";

// StoredTheme keeps the old darkMode field in its persisted shape (read
// but never written as anything but true, and never actually consulted --
// see readStored's callers below) purely so an existing user's old stored
// blob remains valid JSON to parse; not worth a migration for one dead key.
type StoredTheme = { darkMode?: boolean; accentColor: string | null };

function readStored(key: string): Partial<StoredTheme> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<StoredTheme>) : null;
  } catch {
    return null;
  }
}

export function useTheme(userId: string) {
  const darkMode = true;
  const [accentColor, setAccentColorState] = useState<string | null>(null);

  // Client-only -- never runs during SSR, so there's no server/client
  // mismatch to resolve. Runs once on mount to pick up the last-applied
  // device-wide accent color immediately (before any userId is known).
  useEffect(() => {
    const device = readStored(DEVICE_KEY);
    if (device) setAccentColorState(device.accentColor ?? null);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const parsed = readStored(storageKey(userId));
    if (parsed) setAccentColorState(parsed.accentColor ?? null);
  }, [userId]);

  const persist = useCallback((next: StoredTheme) => {
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch {}
    if (!userId) return;
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
  }, [userId]);

  const setAccentColor = useCallback((v: string | null) => {
    setAccentColorState(v);
    persist({ darkMode: true, accentColor: v });
  }, [persist]);

  return useMemo(() => ({ darkMode, accentColor, setAccentColor }), [accentColor, setAccentColor]);
}
