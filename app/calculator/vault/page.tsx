"use client";
// app/calculator/vault/page.tsx
//
// A private, PIN-gated notebook for whatever a driver needs to keep track
// of that doesn't fit anywhere else in the app -- dispatch software,
// Transflo, truck tablet login, employee number, company purchase account
// IDs, credit cards, 401k, other company website logins, fuel cards, ELD,
// Slack, email, etc. Strictly private per driver (vault_entries/
// user_vault_pin are both user_id-scoped, never company-scoped) -- unlike
// almost everything else in this app, nothing here is shared with
// teammates or admins.
//
// The PIN is a simple app-level gate (SHA-256 hash compared client-side),
// not real encryption -- the user explicitly chose this over client-side
// encryption: real auth (already being logged into the app) is the actual
// security boundary; the PIN just adds a speed-bump against someone with
// your unlocked phone glancing at this one tab. That's also why "Forgot
// PIN?" doesn't require the old PIN to reset -- it wouldn't add real
// security, only friction.

import React, { useEffect, useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { supabase } from "@/lib/supabase/client";

type VaultEntryRow = {
  id: string;
  label: string;
  category: string | null;
  username: string | null;
  secret: string | null;
  notes: string | null;
  updated_at: string;
};

const UNLOCK_KEY = "protankr_vault_unlocked_v1";

const CATEGORY_SUGGESTIONS = [
  "ELD", "Fuel Card", "Dispatch", "Transflo", "Tablet Login", "Employee Info",
  "Purchase Account", "Credit Card", "401k", "Company Website", "Slack", "Email", "Other",
];

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 10, padding: "12px 14px",
  border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, display: "block",
};

export default function VaultPage() {
  const shell = useCalculatorShell();
  const userId = shell.effectiveUserId;

  const [phase, setPhase] = useState<"loading" | "create" | "locked" | "unlocked">("loading");
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const [entries, setEntries] = useState<VaultEntryRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fLabel, setFLabel] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fUsername, setFUsername] = useState("");
  const [fSecret, setFSecret] = useState("");
  const [fNotes, setFNotes] = useState("");

  // ── Resolve lock state ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from("user_vault_pin").select("pin_hash").eq("user_id", userId).maybeSingle();
      if (!data) { setPhase("create"); return; }
      setPinHash(data.pin_hash);
      let unlocked = false;
      try { unlocked = sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch {}
      setPhase(unlocked ? "unlocked" : "locked");
    })();
  }, [userId]);

  async function fetchEntries() {
    setEntriesLoading(true);
    const { data } = await supabase.from("vault_entries").select("*").eq("user_id", userId).order("label");
    setEntries((data ?? []) as VaultEntryRow[]);
    setEntriesLoading(false);
  }

  useEffect(() => {
    if (phase !== "unlocked" || !userId) return;
    void fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userId]);

  async function createPin() {
    setPinError(null);
    if (!/^\d{4,8}$/.test(pinInput)) { setPinError("PIN must be 4-8 digits."); return; }
    if (pinInput !== pinConfirm) { setPinError("PINs don't match."); return; }
    setBusy(true);
    try {
      const hash = await sha256Hex(pinInput);
      const { error } = await supabase
        .from("user_vault_pin")
        .upsert({ user_id: userId, pin_hash: hash, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {}
      setPinHash(hash);
      setPinInput(""); setPinConfirm(""); setForgotMode(false);
      setPhase("unlocked");
    } catch (e: any) {
      setPinError(e?.message ?? "Failed to save PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setPinError(null);
    setBusy(true);
    try {
      const hash = await sha256Hex(pinInput);
      if (hash !== pinHash) { setPinError("Incorrect PIN."); return; }
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {}
      setPinInput("");
      setPhase("unlocked");
    } finally {
      setBusy(false);
    }
  }

  function lockNow() {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch {}
    setRevealed({});
    setExpandedId(null);
    setPhase("locked");
  }

  function forgotPin() {
    setForgotMode(true);
    setPinHash(null);
    setPinInput(""); setPinConfirm(""); setPinError(null);
    setPhase("create");
  }

  function openAddForm() {
    setEditingId(null);
    setFLabel(""); setFCategory(""); setFUsername(""); setFSecret(""); setFNotes("");
    setFormOpen(true);
  }
  function openEditForm(e: VaultEntryRow) {
    setEditingId(e.id);
    setFLabel(e.label); setFCategory(e.category ?? ""); setFUsername(e.username ?? "");
    setFSecret(e.secret ?? ""); setFNotes(e.notes ?? "");
    setFormOpen(true);
  }

  async function saveEntry() {
    if (!fLabel.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        const { error } = await supabase.from("vault_entries").update({
          label: fLabel.trim(), category: fCategory.trim() || null, username: fUsername.trim() || null,
          secret: fSecret || null, notes: fNotes.trim() || null, updated_at: new Date().toISOString(),
        }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vault_entries").insert({
          user_id: userId, label: fLabel.trim(), category: fCategory.trim() || null,
          username: fUsername.trim() || null, secret: fSecret || null, notes: fNotes.trim() || null,
        });
        if (error) throw error;
      }
      setFormOpen(false);
      await fetchEntries();
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    setBusy(true);
    try {
      await supabase.from("vault_entries").delete().eq("id", id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setConfirmDeleteId(null);
      setExpandedId(null);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "loading") return null;

  if (phase === "create") {
    return (
      <div style={{ maxWidth: 340, margin: "40px auto 0", padding: "0 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6, textAlign: "center" as const }}>
          {forgotMode ? "Set a new Vault PIN" : "Create a Vault PIN"}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center" as const, marginBottom: 20, lineHeight: 1.5 }}>
          A quick PIN to keep the Vault private. This is a simple lock, not encryption — anyone already past your device login can already reach everything else in the app.
        </div>
        {pinError && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 12, textAlign: "center" as const }}>{pinError}</div>}
        <label style={labelStyle}>New PIN (4–8 digits)</label>
        <input
          type="password" inputMode="numeric" value={pinInput} maxLength={8}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
          style={{ ...inputStyle, marginBottom: 14, letterSpacing: 4, textAlign: "center" as const }}
        />
        <label style={labelStyle}>Confirm PIN</label>
        <input
          type="password" inputMode="numeric" value={pinConfirm} maxLength={8}
          onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
          style={{ ...inputStyle, marginBottom: 20, letterSpacing: 4, textAlign: "center" as const }}
        />
        <button onClick={createPin} disabled={busy} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Saving…" : "Set PIN"}
        </button>
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div style={{ maxWidth: 320, margin: "60px auto 0", padding: "0 4px", textAlign: "center" as const }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 20 }}>Vault Locked</div>
        {pinError && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>{pinError}</div>}
        <input
          type="password" inputMode="numeric" autoFocus value={pinInput} maxLength={8}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }}
          style={{ ...inputStyle, marginBottom: 16, letterSpacing: 6, textAlign: "center" as const, fontSize: 20 }}
          placeholder="••••"
        />
        <button onClick={unlock} disabled={busy || !pinInput} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: pinInput ? 1 : 0.5 }}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <button onClick={forgotPin} style={{ marginTop: 16, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          Forgot PIN?
        </button>
      </div>
    );
  }

  // unlocked
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
        <button onClick={lockNow} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          🔒 Lock
        </button>
      </div>

      <button
        onClick={openAddForm}
        style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}
      >
        + Add entry
      </button>

      {entriesLoading && <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>Loading…</div>}

      {!entriesLoading && entries.length === 0 && (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "40px 20px", lineHeight: 1.5 }}>
          Nothing saved yet.<br />Add logins, account numbers, anything you need to keep track of.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {entries.map((e) => {
          const isExpanded = expandedId === e.id;
          const isRevealed = !!revealed[e.id];
          return (
            <div key={e.id} style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
              <div onClick={() => setExpandedId(isExpanded ? null : e.id)} style={{ padding: 14, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {e.label}
                    </div>
                    {e.username && (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {e.username}
                      </div>
                    )}
                  </div>
                  {e.category && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.07)", borderRadius: 999, padding: "3px 9px", flexShrink: 0, whiteSpace: "nowrap" as const }}>
                      {e.category}
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12 }} onClick={(ev) => ev.stopPropagation()}>
                    {e.secret && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "monospace", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {isRevealed ? e.secret : "•".repeat(Math.min(14, Math.max(6, e.secret.length)))}
                        </div>
                        <button
                          onClick={() => setRevealed((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                          style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}
                        >
                          {isRevealed ? "Hide" : "Show"}
                        </button>
                      </div>
                    )}
                    {e.notes && (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, whiteSpace: "pre-wrap" as const, marginBottom: 12 }}>
                        {e.notes}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEditForm(e)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Edit
                      </button>
                      {confirmDeleteId === e.id ? (
                        <button onClick={() => deleteEntry(e.id)} disabled={busy} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.25)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                          {busy ? "Deleting…" : "Confirm delete"}
                        </button>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(e.id)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(220,60,60,0.4)", background: "rgba(180,40,40,0.10)", color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {formOpen && (
        <div onClick={() => setFormOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#111518", borderRadius: "18px 18px 0 0", border: "1px solid rgba(255,255,255,0.10)", borderBottom: "none", padding: "20px 18px 28px", maxHeight: "85dvh", overflowY: "auto" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 16 }}>
              {editingId ? "Edit Entry" : "New Entry"}
            </div>

            <label style={labelStyle}>Label</label>
            <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="e.g. ELD Login, Company Slack" style={{ ...inputStyle, marginBottom: 14 }} />

            <label style={labelStyle}>Category (optional)</label>
            <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="e.g. ELD, Fuel Card, Dispatch" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
              {CATEGORY_SUGGESTIONS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setFCategory(c)}
                  style={{
                    fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 999, padding: "4px 10px",
                    color: fCategory === c ? "#000" : "rgba(255,255,255,0.55)",
                    background: fCategory === c ? "#fff" : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Username / ID (optional)</label>
            <input value={fUsername} onChange={(e) => setFUsername(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

            <label style={labelStyle}>Password / PIN / account # (optional)</label>
            <input value={fSecret} onChange={(e) => setFSecret(e.target.value)} style={{ ...inputStyle, marginBottom: 14, fontFamily: "monospace" }} />

            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" as const, marginBottom: 20 }} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFormOpen(false)} disabled={busy} style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveEntry} disabled={busy || !fLabel.trim()} style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: fLabel.trim() ? 1 : 0.5 }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
