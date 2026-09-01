"use client";
// hooks/useTheme.ts
// Planner dark-mode toggle + custom accent color, persisted per-user in
// localStorage (same protankr_<feature>_v<N>:<userId-or-anon> convention as
// useEquipment.ts/useLocation.ts).
//
// Flash-of-default fix (2026-08-06): authUserId itself only resolves
// asynchronously (CalculatorShellContext's own supabase.auth.getUser()
// effect), so the per-user storage key isn't knowable on the very first
// render -- darkMode/accentColor used to start at the hardcoded default
// (false/null) and only get corrected once userId showed up, which is
// exactly the "starts wrong, then flips" flash reported against the header.
// That pass mirrored the last-applied theme under a userId-independent
// DEVICE_KEY, read SYNCHRONOUSLY inside the initial useState -- fine for
// in-app navigation (no server involved), but wrong for a fresh page load:
// this hook also runs during SSR, where `localStorage` doesn't exist, so
// the server always renders the false/null default. Reading it
// synchronously in the client's lazy initializer then produces a
// DIFFERENT value on the client's very first (hydration) render than what
// the server sent -- a real hydration mismatch, not just a flash, and the
// actual cause of "the Dark Mode toggle still says on, but the header
// stays light after closing and reopening the app": React can end up
// keeping the server's (wrong) painted value instead of reliably patching
// it, depending on how it resolves the mismatch.
//
// Fixed 2026-08-19 the same way this codebase's useNow() hook already
// fixes an analogous SSR/client clock mismatch: both darkMode/accentColor
// now start at the neutral default (identical on server and the client's
// first render, so there's nothing to mismatch), and get resolved for
// real in a client-only effect that never runs during SSR. This
// reintroduces a brief flash of the default on a genuinely cold load --
// the same acceptable tradeoff already made for the status-bar theme-color
// meta tag -- but guarantees correctness instead of a state that can get
// permanently stuck disagreeing with what Settings shows.

import { useCallback, useEffect, useMemo, useState } from "react";

function storageKey(userId: string) {
  return `protankr_theme_v1:${userId || "anon"}`;
}
const DEVICE_KEY = "protankr_theme_v1:__device__";

type StoredTheme = { darkMode: boolean; accentColor: string | null };

function readStored(key: string): Partial<StoredTheme> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<StoredTheme>) : null;
  } catch {
    return null;
  }
}

export function useTheme(userId: string) {
  const [darkMode, setDarkModeState] = useState(false);
  const [accentColor, setAccentColorState] = useState<string | null>(null);

  // Client-only -- never runs during SSR, so there's no server/client
  // mismatch to resolve. Runs once on mount to pick up the last-applied
  // device-wide theme immediately (before any userId is known).
  useEffect(() => {
    const device = readStored(DEVICE_KEY);
    if (device) {
      setDarkModeState(!!device.darkMode);
      setAccentColorState(device.accentColor ?? null);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const parsed = readStored(storageKey(userId));
    if (parsed) {
      setDarkModeState(!!parsed.darkMode);
      setAccentColorState(parsed.accentColor ?? null);
    }
  }, [userId]);

  // Stabilized via useCallback/useMemo (previously plain functions/object,
  // a new reference every render) -- see useEquipment.ts's identical
  // comment for why this matters for CalculatorShellContext's own
  // memoization. Same runtime behavior, just now correctly reactive:
  // persist genuinely depends on userId (which company's storage key to
  // write), setDarkMode/setAccentColor genuinely depend on the OTHER
  // field's current value (persisted together as one StoredTheme).
  const persist = useCallback((next: StoredTheme) => {
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch {}
    if (!userId) return;
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
  }, [userId]);

  const setDarkMode = useCallback((v: boolean) => {
    setDarkModeState(v);
    persist({ darkMode: v, accentColor });
  }, [persist, accentColor]);

  const setAccentColor = useCallback((v: string | null) => {
    setAccentColorState(v);
    persist({ darkMode, accentColor: v });
  }, [persist, darkMode]);

  return useMemo(() => ({ darkMode, accentColor, setDarkMode, setAccentColor }), [darkMode, accentColor, setDarkMode, setAccentColor]);
}
