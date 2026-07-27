"use client";
// hooks/useTheme.ts
// Planner dark-mode toggle + custom accent color, persisted per-user in
// localStorage (same protankr_<feature>_v<N>:<userId-or-anon> convention as
// useEquipment.ts/useLocation.ts).

import { useEffect, useState } from "react";

function storageKey(userId: string) {
  return `protankr_theme_v1:${userId || "anon"}`;
}

type StoredTheme = { darkMode: boolean; accentColor: string | null };

export function useTheme(userId: string) {
  const [darkMode, setDarkModeState] = useState(false);
  const [accentColor, setAccentColorState] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredTheme>;
        setDarkModeState(!!parsed.darkMode);
        setAccentColorState(parsed.accentColor ?? null);
      }
    } catch {}
  }, [userId]);

  function persist(next: StoredTheme) {
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
