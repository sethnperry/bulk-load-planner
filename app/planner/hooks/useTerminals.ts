"use client";
// hooks/useTerminals.ts
// Owns: my_terminals fetch, terminal catalog, get_carded RPC, access dates, star toggle.
// When setupSession is active, all user-scoped reads/writes go through /api/admin/setup.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { SetupSession } from "@/lib/setupSession";
import type { TerminalCatalogRow, TerminalRow } from "../types";
import { addDaysISO_, isPastISO_ } from "../utils/dates";
import {
  getTerminalAccess,
  setTerminalAccess,
  getMyTerminals,
  setMyTerminal,
  removeMyTerminal,
  getCarded,
} from "@/lib/adminSetupClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoTodayInTimeZone(timeZone?: string | null) {
  const tz = timeZone || "America/New_York";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value  ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value   ?? "01";
  return `${y}-${m}-${d}`;
}

function normalizeStatus(raw: any): "valid" | "expired" | "not_carded" {
  const s = raw?.status ?? raw?.card_status ?? raw?.access_status ?? raw?.carded_status ?? raw?.terminal_status ?? raw?.my_terminal_status;
  if (s === "valid" || s === "expired" || s === "not_carded") return s;
  return raw?.carded_on ? "valid" : "not_carded";
}

function normalizeTerminalRow(raw: any): TerminalRow {
  const expires = raw?.expires_on ?? raw?.expires_at ?? raw?.expiration_on ?? raw?.expiration_date ?? raw?.expiry_on ?? null;
  return {
    terminal_id:   String(raw?.terminal_id ?? ""),
    state:         raw?.state         ?? null,
    city:          raw?.city          ?? null,
    terminal_name: raw?.terminal_name ?? raw?.name ?? null,
    carded_on:     raw?.carded_on     ?? null,
    expires_on:    expires,
    status:        normalizeStatus(raw),
    starred:       raw?.starred       ?? raw?.is_starred ?? null,
  };
}

// Maps a handful of known raw Supabase/PostgREST/GoTrue error strings to
// something a driver can actually act on -- these bubble straight into
// termError/catalogError and render verbatim as a plain red banner in
// MyTerminalsModal.tsx, so a raw string like "JWT issued at future" (a
// GoTrue auth rejection caused by the device's own clock being set wrong,
// not anything server-side) read as unintelligible internals instead of
// an actionable message. Falls back to the original message for anything
// unrecognized -- better an unfamiliar-but-real error surfaced than one
// silently swallowed.
function friendlyErrorMessage(raw: string | null | undefined, fallback: string): string {
  const msg = String(raw ?? "").trim();
  if (!msg) return fallback;
  if (/issued at future|clock.?skew/i.test(msg)) {
    return "Your device's clock looks wrong, which is blocking sign-in. Turn on automatic date & time in your phone's settings and try again.";
  }
  return msg;
}

function sortMyTerminals(rows: TerminalRow[]): TerminalRow[] {
  const rank = (s: TerminalRow["status"]) => s === "valid" ? 0 : s === "expired" ? 1 : 2;
  return [...rows].sort((a, b) => {
    if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1;
    const sr = rank(a.status) - rank(b.status);
    if (sr !== 0) return sr;
    return String(a.terminal_name ?? "").localeCompare(String(b.terminal_name ?? ""));
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTerminals(
  effectiveUserId: string,
  selectedTerminalId: string,
  setSelectedTerminalId: (id: string) => void,
  selectedTerminalTimeZone: string | null,
  setupSession?: SetupSession | null
) {
  const isSetup = !!setupSession?.targetUserId;

  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [termLoading, setTermLoading]   = useState(false);
  const [termError,   setTermError]     = useState<string | null>(null);

  const [terminalCatalog,  setTerminalCatalog]  = useState<TerminalCatalogRow[]>([]);
  const [catalogLoading,   setCatalogLoading]   = useState(false);
  const [catalogError,     setCatalogError]     = useState<string | null>(null);

  const [accessDateByTerminalId, setAccessDateByTerminalId] = useState<Record<string, string>>({});
  const [cardingBusyId, setCardingBusyId] = useState<string | null>(null);

  // ── Load my terminals ─────────────────────────────────────────────────────

  const loadMyTerminals = useCallback(async () => {
    if (!effectiveUserId) return;
    setTermError(null);
    setTermLoading(true);
    if (isSetup) {
      try {
        const { terminals: rows } = await getMyTerminals(effectiveUserId);
        setTerminals(sortMyTerminals((rows ?? []).map(normalizeTerminalRow)));
      } catch (e: any) {
        setTermError(friendlyErrorMessage(e?.message, "Failed to load terminals."));
        setTerminals([]);
      }
    } else {
      const { data, error } = await supabase
        .from("my_terminals_with_status")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("state",         { ascending: true })
        .order("city",          { ascending: true })
        .order("terminal_name", { ascending: true });
      if (error) {
        setTermError(friendlyErrorMessage(error.message, "Failed to load terminals."));
        setTerminals([]);
      } else {
        setTerminals(sortMyTerminals((data ?? []).map(normalizeTerminalRow)));
      }
    }
    setTermLoading(false);
  }, [effectiveUserId, isSetup]);

  // ── Load terminal catalog (public — no user scope, direct query is fine) ──

  const loadTerminalCatalog = useCallback(async () => {
    setCatalogError(null);
    setCatalogLoading(true);
    const { data, error } = await supabase
      .from("terminals")
      .select("terminal_id, state, city, terminal_name, timezone, active, renewal_days")
      .order("state",         { ascending: true })
      .order("city",          { ascending: true })
      .order("terminal_name", { ascending: true })
      .returns<TerminalCatalogRow[]>();
    if (error) {
      setCatalogError(friendlyErrorMessage(error.message, "Failed to load terminal catalog."));
      setTerminalCatalog([]);
    } else {
      setTerminalCatalog((data ?? []).filter((t) => t.active !== false));
    }
    setCatalogLoading(false);
  }, []);

  // ── Refresh terminal access dates ─────────────────────────────────────────

  const refreshTerminalAccessForUser = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      if (isSetup) {
        const { accessDateByTerminalId: map } = await getTerminalAccess(effectiveUserId);
        setAccessDateByTerminalId(map);
      } else {
        const { data, error } = await supabase
          .from("terminal_access")
          .select("terminal_id, carded_on")
          .eq("user_id", effectiveUserId);
        if (error) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row?.terminal_id && row?.carded_on)
            next[String(row.terminal_id)] = String(row.carded_on);
        }
        setAccessDateByTerminalId(next);
      }
    } catch {}
  }, [effectiveUserId, isSetup]);

  useEffect(() => {
    if (!effectiveUserId) return;
    loadMyTerminals();
    loadTerminalCatalog();
    refreshTerminalAccessForUser();
  }, [effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Set access date for a terminal ────────────────────────────────────────

  const setAccessDateForTerminal = useCallback(async (terminalId: string, isoDate: string) => {
    if (!effectiveUserId) return;
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;
    setAccessDateByTerminalId((prev) => ({ ...prev, [terminalId]: isoDate }));
    if (isSetup) {
      try {
        await setTerminalAccess(effectiveUserId, terminalId, isoDate);
      } catch (e: any) {
        console.error("setAccessDateForTerminal (setup):", e?.message);
        return;
      }
    } else {
      const res = await supabase
        .from("terminal_access")
        .upsert(
          { user_id: effectiveUserId, terminal_id: terminalId, carded_on: isoDate },
          { onConflict: "user_id,terminal_id" }
        )
        .select();
      if (res.error) {
        console.error("setAccessDateForTerminal error:", res.error);
        return;
      }
    }
    await loadMyTerminals();
  }, [effectiveUserId, isSetup, loadMyTerminals]);

  // ── Fully revert a terminal's access record ───────────────────────────────
  // Used by the Loading modal's "Back to Planner" exit (page.tsx): tapping
  // LOAD silently re-cards the terminal via begin_load before this modal
  // ever opens (see useLoadWorkflow.ts's cancelActiveLoad comment), so a
  // driver who wants to truly walk away with nothing changed needs this to
  // undo that -- not just leave the fresh re-card in place the way "Update
  // Card, No Load" deliberately does. Deletes the row entirely rather than
  // setting some fallback date, since a terminal with no prior visit at all
  // has no earlier date to fall back to -- it needs to go back to genuinely
  // "not carded," which is what an absent row already means everywhere else
  // in the app (see cardStateFor/expStateFor's own "not_set" branches).
  const deleteAccessDateForTerminal = useCallback(async (terminalId: string) => {
    if (!effectiveUserId) return;
    setAccessDateByTerminalId((prev) => {
      const next = { ...prev };
      delete next[terminalId];
      return next;
    });
    if (isSetup) {
      // adminSetupClient.ts has no delete counterpart to setTerminalAccess --
      // reverting a load for a terminal with zero prior card history while
      // impersonating is a narrow edge case not worth building out yet.
      // Local state above still reflects the intent even though the
      // server-side row isn't removed in this mode.
      console.warn("deleteAccessDateForTerminal: not supported during setup-session impersonation");
      return;
    }
    const res = await supabase
      .from("terminal_access")
      .delete()
      .eq("user_id", effectiveUserId)
      .eq("terminal_id", terminalId);
    if (res.error) {
      console.error("deleteAccessDateForTerminal error:", res.error);
      return;
    }
    await loadMyTerminals();
  }, [effectiveUserId, isSetup, loadMyTerminals]);

  // ── Get carded ────────────────────────────────────────────────────────────

  const doGetCarded = useCallback(async (terminalId: string) => {
    try {
      setTermError(null);
      setCardingBusyId(String(terminalId));

      const tzForCarded =
        (terminals as any[]).find((t) => String(t.terminal_id) === String(terminalId))?.timezone ??
        (terminalCatalog as any[]).find((t) => String(t.terminal_id) === String(terminalId))?.timezone ??
        selectedTerminalTimeZone ??
        null;

      const cardedOnISO = isoTodayInTimeZone(tzForCarded);

      if (isSetup) {
        await getCarded(effectiveUserId, terminalId, cardedOnISO);
      } else {
        const { error: rpcError } = await supabase.rpc("get_carded", {
          p_terminal_id: terminalId,
          p_carded_on:   cardedOnISO,
        });
        if (rpcError) { setTermError(friendlyErrorMessage(rpcError.message, "Failed to get carded.")); return; }
      }

      await loadMyTerminals();
      await refreshTerminalAccessForUser();
      setSelectedTerminalId(String(terminalId));
    } catch (e: any) {
      setTermError(friendlyErrorMessage(e?.message, "Failed to get carded."));
    } finally {
      setCardingBusyId(null);
    }
  }, [effectiveUserId, isSetup, terminals, terminalCatalog, selectedTerminalTimeZone, loadMyTerminals, refreshTerminalAccessForUser, setSelectedTerminalId]);

  // ── Star toggle ───────────────────────────────────────────────────────────

  const toggleTerminalStar = useCallback(async (terminalId: string, currentlyStarred: boolean) => {
    if (!effectiveUserId) { setTermError("Not logged in."); return; }

    setTerminals((prev) =>
      prev.filter((t) => String(t.terminal_id) !== String(terminalId) || currentlyStarred)
    );

    if (isSetup) {
      try {
        if (currentlyStarred) await removeMyTerminal(effectiveUserId, terminalId);
        else                  await setMyTerminal(effectiveUserId, terminalId);
      } catch (e: any) {
        setTermError(friendlyErrorMessage(e?.message, "Failed to update terminal."));
        await loadMyTerminals();
        return;
      }
    } else {
      if (currentlyStarred) {
        const { error } = await supabase.from("my_terminals").delete()
          .eq("user_id", effectiveUserId).eq("terminal_id", terminalId);
        if (error) { setTermError(friendlyErrorMessage(error.message, "Failed to update terminal.")); await loadMyTerminals(); return; }
      } else {
        const { error } = await supabase.from("my_terminals")
          .upsert({ user_id: effectiveUserId, terminal_id: terminalId, is_starred: true }, { onConflict: "user_id,terminal_id" });
        if (error) { setTermError(friendlyErrorMessage(error.message, "Failed to update terminal.")); }
      }
    }
    await loadMyTerminals();
  }, [effectiveUserId, isSetup, loadMyTerminals]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const terminalDisplayInfo = useCallback((
    terminalRow: TerminalRow,
    tid: string
  ) => {
    const cat = terminalCatalog.find((x) => String(x.terminal_id) === tid) ?? null;
    const activationISO = accessDateByTerminalId[tid] || (terminalRow as any)?.carded_on || "";
    const expiresISO    = (terminalRow as any)?.expires_on || (terminalRow as any)?.expires_at || "";
    const renewalDays   = Number((terminalRow as any)?.renewal_days ?? cat?.renewal_days ?? 90) || 90;
    const computedExpires =
      activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
        ? addDaysISO_(activationISO, renewalDays)
        : "";
    return expiresISO || computedExpires || null;
  }, [terminalCatalog, accessDateByTerminalId]);

  return {
    terminals, setTerminals,
    termLoading, termError, setTermError,
    terminalCatalog,
    catalogLoading, catalogError,
    accessDateByTerminalId,
    cardingBusyId,
    loadMyTerminals,
    refreshTerminalAccessForUser,
    setAccessDateForTerminal,
    deleteAccessDateForTerminal,
    doGetCarded,
    toggleTerminalStar,
    terminalDisplayInfo,
  };
}
