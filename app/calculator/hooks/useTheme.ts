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
// Fixed by also mirroring the last-applied theme under a userId-independent
// DEVICE_KEY, read synchronously in the initial useState -- in the
// overwhelming common case (same person, same device) this is already the
// right answer with no async wait at all; the per-user-keyed effect below
// still runs afterward and corrects it if a different account's theme
// differs, so nothing about the existing per-user persistence changes.

import { useEffect, useState } from "react";

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
  const [darkMode, setDarkModeState] = useState(() => !!readStored(DEVICE_KEY)?.darkMode);
  const [accentColor, setAccentColorState] = useState<string | null>(() => readStored(DEVICE_KEY)?.accentColor ?? null);

  useEffect(() => {
    if (!userId) return;
    const parsed = readStored(storageKey(userId));
    if (parsed) {
      setDarkModeState(!!parsed.darkMode);
      setAccentColorState(parsed.accentColor ?? null);
    }
  }, [userId]);

  function persist(next: StoredTheme) {
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch {}
    if (!userId) return;
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
  }

  function setDarkMode(v: boolean) {
    setDarkModeState(v);
    persist({ darkMode: v, accentColor });
  }
  function setAccentColor(v: string | null) {
    setAccentColorState(v);
    persist({ darkMode, accentColor: v });
  }

  return { darkMode, accentColor, setDarkMode, setAccentColor };
}
