"use client";
// app/calculator/cards/credentials/page.tsx — Credentials sub-tab (Cards tab rework, Phase 2)
//
// Government/regulatory credentials: driver's license, medical card, TWIC.
// Unlike Terminals/Badges (repeatable lists), a driver realistically has at
// most one of each -- three fixed landscape cards, each a "get or create by
// user_id" slot against its own table (driver_licenses/driver_medical_cards/
// driver_twic_cards, all already live with real data for the real account).
// Generated-look only, no photo upload (deferred, same as Badges).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { formatMDY, formatMDYWithCountdown_ } from "../../utils/dates";
import CardsSubTabs from "../CardsSubTabs";
import FlippableCard from "../FlippableCard";
import {
  toneFor, cardStateFor, EXP_COLOR,
  fieldLabel, fieldInput, btnDanger,
} from "../cardTheme";

type LicenseRow = {
  id?: string;
  license_class: string; license_number: string; state_code: string;
  endorsements: string[]; restrictions: string[];
  issue_date: string | null; expiration_date: string | null;
  hazmat_linked_to_license: boolean;
  hazmat_issue_date: string | null; hazmat_expiration_date: string | null;
};
type MedicalRow = {
  id?: string;
  issue_date: string | null; expiration_date: string | null;
  examiner_name: string; attached_to_license: boolean;
};
type TwicRow = {
  id?: string;
  card_number: string; issue_date: string | null; expiration_date: string | null;
};

const emptyLicense: LicenseRow = { license_class: "", license_number: "", state_code: "", endorsements: [], restrictions: [], issue_date: null, expiration_date: null, hazmat_linked_to_license: false, hazmat_issue_date: null, hazmat_expiration_date: null };
const emptyMedical: MedicalRow = { issue_date: null, expiration_date: null, examiner_name: "", attached_to_license: false };
const emptyTwic: TwicRow = { card_number: "", issue_date: null, expiration_date: null };

// ── Landscape card shell (front + back share this frame) ────────────────────

function LandscapeFrame({ title, tone, children }: { title: string; tone: [string, string]; children: React.ReactNode }) {
  const [base, shade] = tone;
  return (
    <div style={{
      height: "100%", borderRadius: 10, padding: 16, boxSizing: "border-box",
      background: `radial-gradient(circle at 20% 15%, rgba(255,255,255,0.7), transparent 55%), linear-gradient(135deg, ${base} 0%, ${shade} 100%)`,
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)",
      minHeight: 118,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.6, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function BackFrame({ title, tone, onDone, children }: { title: string; tone: [string, string]; onDone: () => void; children: React.ReactNode }) {
  const [base, shade] = tone;
  return (
    <div style={{
      height: "100%", borderRadius: 10, overflow: "hidden", boxSizing: "border-box",
      background: `linear-gradient(135deg, ${base} 0%, ${shade} 100%)`,
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)",
    }}>
      <div style={{ background: "rgba(0,0,0,0.85)", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{title}</div>
        <button type="button" onClick={onDone} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>Done</button>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const row2: React.CSSProperties = { display: "flex", gap: 8 };
const col: React.CSSProperties = { flex: 1, minWidth: 0 };
const checkboxRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.6)" };

// ── License card ─────────────────────────────────────────────────────────────

function LicenseCard({ value, onSave, onRemove }: { value: LicenseRow | null; onSave: (v: LicenseRow) => void; onRemove: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [draft, setDraft] = useState<LicenseRow>(value ?? emptyLicense);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tone = toneFor("license");

  useEffect(() => { if (flipped) { setDraft(value ?? emptyLicense); setConfirmRemove(false); } }, [flipped, value]);

  const state = cardStateFor(value?.expiration_date ?? null);
  const handleDone = () => { onSave(draft); setFlipped(false); };

  const front = (
    <LandscapeFrame title="Driver's License" tone={tone}>
      {value ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#161616" }}>Class {value.license_class || "—"}</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginTop: 2 }}>{value.state_code || "—"} · {value.license_number || "—"}</div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const }}>Exp</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: EXP_COLOR[state] }}>{value.expiration_date ? formatMDY(value.expiration_date) : "—"}</div>
            </div>
          </div>
          {value.hazmat_linked_to_license && (
            <div style={{ marginTop: 8, fontSize: 9, fontWeight: 800, color: "rgba(0,0,0,0.5)", background: "rgba(0,0,0,0.07)", borderRadius: 999, padding: "2px 8px", display: "inline-block", textTransform: "uppercase" as const }}>
              Hazmat endorsed
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Not on file — tap to add</div>
      )}
    </LandscapeFrame>
  );

  const back = (
    <BackFrame title="Edit Driver's License" tone={tone} onDone={handleDone}>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Class</div><input type="text" value={draft.license_class} onChange={(e) => setDraft((d) => ({ ...d, license_class: e.target.value }))} style={fieldInput} /></div>
        <div style={col}><div style={fieldLabel}>State</div><input type="text" value={draft.state_code} onChange={(e) => setDraft((d) => ({ ...d, state_code: e.target.value.toUpperCase().slice(0, 2) }))} style={fieldInput} /></div>
      </div>
      <div><div style={fieldLabel}>License Number</div><input type="text" value={draft.license_number} onChange={(e) => setDraft((d) => ({ ...d, license_number: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><input type="date" value={draft.issue_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, issue_date: e.target.value || null }))} style={fieldInput} /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><input type="date" value={draft.expiration_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, expiration_date: e.target.value || null }))} style={fieldInput} /></div>
      </div>
      <div><div style={fieldLabel}>Endorsements (comma-separated)</div><input type="text" value={draft.endorsements.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, endorsements: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} style={fieldInput} /></div>
      <div><div style={fieldLabel}>Restrictions (comma-separated)</div><input type="text" value={draft.restrictions.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, restrictions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} style={fieldInput} /></div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={draft.hazmat_linked_to_license} onChange={(e) => setDraft((d) => ({ ...d, hazmat_linked_to_license: e.target.checked }))} />
        Hazmat endorsement linked to this license
      </label>
      {draft.hazmat_linked_to_license && (
        <div style={row2}>
          <div style={col}><div style={fieldLabel}>Hazmat Issue</div><input type="date" value={draft.hazmat_issue_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, hazmat_issue_date: e.target.value || null }))} style={fieldInput} /></div>
          <div style={col}><div style={fieldLabel}>Hazmat Exp</div><input type="date" value={draft.hazmat_expiration_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, hazmat_expiration_date: e.target.value || null }))} style={fieldInput} /></div>
        </div>
      )}
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(153,27,27,0.25)", background: "rgba(153,27,27,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3a1414", marginBottom: 6 }}>Remove this license record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); setFlipped(false); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.04)", color: "#111", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return <FlippableCard flipped={flipped} onFlipToBack={() => setFlipped(true)} front={front} back={back} />;
}

// ── Medical card ──────────────────────────────────────────────────────────────

function MedicalCard({ value, onSave, onRemove }: { value: MedicalRow | null; onSave: (v: MedicalRow) => void; onRemove: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [draft, setDraft] = useState<MedicalRow>(value ?? emptyMedical);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tone = toneFor("medical");

  useEffect(() => { if (flipped) { setDraft(value ?? emptyMedical); setConfirmRemove(false); } }, [flipped, value]);

  const state = cardStateFor(value?.expiration_date ?? null);
  const handleDone = () => { onSave(draft); setFlipped(false); };

  const front = (
    <LandscapeFrame title="Medical Card" tone={tone}>
      {value ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#161616" }}>{value.examiner_name || "—"}</div>
            {value.attached_to_license && <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>Attached to license</div>}
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const }}>Exp</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: EXP_COLOR[state] }}>{value.expiration_date ? formatMDY(value.expiration_date) : "—"}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Not on file — tap to add</div>
      )}
    </LandscapeFrame>
  );

  const back = (
    <BackFrame title="Edit Medical Card" tone={tone} onDone={handleDone}>
      <div><div style={fieldLabel}>Examiner Name</div><input type="text" value={draft.examiner_name} onChange={(e) => setDraft((d) => ({ ...d, examiner_name: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><input type="date" value={draft.issue_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, issue_date: e.target.value || null }))} style={fieldInput} /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><input type="date" value={draft.expiration_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, expiration_date: e.target.value || null }))} style={fieldInput} /></div>
      </div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={draft.attached_to_license} onChange={(e) => setDraft((d) => ({ ...d, attached_to_license: e.target.checked }))} />
        Attached to license
      </label>
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(153,27,27,0.25)", background: "rgba(153,27,27,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3a1414", marginBottom: 6 }}>Remove this medical card record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); setFlipped(false); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.04)", color: "#111", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return <FlippableCard flipped={flipped} onFlipToBack={() => setFlipped(true)} front={front} back={back} />;
}

// ── TWIC card ─────────────────────────────────────────────────────────────────

function TwicCard({ value, onSave, onRemove }: { value: TwicRow | null; onSave: (v: TwicRow) => void; onRemove: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [draft, setDraft] = useState<TwicRow>(value ?? emptyTwic);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tone = toneFor("twic");

  useEffect(() => { if (flipped) { setDraft(value ?? emptyTwic); setConfirmRemove(false); } }, [flipped, value]);

  const state = cardStateFor(value?.expiration_date ?? null);
  const handleDone = () => { onSave(draft); setFlipped(false); };

  const front = (
    <LandscapeFrame title="TWIC" tone={tone}>
      {value ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#161616", fontFamily: "monospace", letterSpacing: 1 }}>{value.card_number || "—"}</div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const }}>Exp</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: EXP_COLOR[state] }}>{value.expiration_date ? formatMDY(value.expiration_date) : "—"}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Not on file — tap to add</div>
      )}
    </LandscapeFrame>
  );

  const back = (
    <BackFrame title="Edit TWIC" tone={tone} onDone={handleDone}>
      <div><div style={fieldLabel}>Card Number</div><input type="text" value={draft.card_number} onChange={(e) => setDraft((d) => ({ ...d, card_number: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><input type="date" value={draft.issue_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, issue_date: e.target.value || null }))} style={fieldInput} /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><input type="date" value={draft.expiration_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, expiration_date: e.target.value || null }))} style={fieldInput} /></div>
      </div>
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(153,27,27,0.25)", background: "rgba(153,27,27,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3a1414", marginBottom: 6 }}>Remove this TWIC record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); setFlipped(false); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "rgba(0,0,0,0.04)", color: "#111", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return <FlippableCard flipped={flipped} onFlipToBack={() => setFlipped(true)} front={front} back={back} />;
}

// ── Credentials sub-tab ───────────────────────────────────────────────────────

export default function CredentialsPage() {
  const shell = useCalculatorShell();
  const { effectiveUserId } = shell;

  const [license, setLicense] = useState<(LicenseRow & { id: string }) | null | undefined>(undefined);
  const [medical, setMedical] = useState<(MedicalRow & { id: string }) | null | undefined>(undefined);
  const [twic, setTwic] = useState<(TwicRow & { id: string }) | null | undefined>(undefined);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const { data: s } = await supabase.from("user_settings").select("active_company_id").eq("user_id", effectiveUserId).maybeSingle();
      setCompanyId((s?.active_company_id as string | null) ?? null);

      const [{ data: l, error: le }, { data: m, error: me }, { data: t, error: te }] = await Promise.all([
        supabase.from("driver_licenses").select("*").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("driver_medical_cards").select("*").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("driver_twic_cards").select("*").eq("user_id", effectiveUserId).maybeSingle(),
      ]);
      if (le || me || te) setError((le ?? me ?? te)?.message ?? "Failed to load credentials.");
      setLicense((l as any) ?? null);
      setMedical((m as any) ?? null);
      setTwic((t as any) ?? null);
    })();
  }, [effectiveUserId]);

  const saveLicense = async (v: LicenseRow) => {
    if (license?.id) {
      const { error: err } = await supabase.from("driver_licenses").update({ ...v, updated_at: new Date().toISOString() }).eq("id", license.id);
      if (err) { setError(err.message); return; }
      setLicense({ ...v, id: license.id });
    } else {
      const { data, error: err } = await supabase.from("driver_licenses").insert({ user_id: effectiveUserId, company_id: companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setLicense(data as any);
    }
  };
  const removeLicense = async () => {
    if (!license?.id) return;
    const { error: err } = await supabase.from("driver_licenses").delete().eq("id", license.id);
    if (err) { setError(err.message); return; }
    setLicense(null);
  };

  const saveMedical = async (v: MedicalRow) => {
    if (medical?.id) {
      const { error: err } = await supabase.from("driver_medical_cards").update({ ...v, updated_at: new Date().toISOString() }).eq("id", medical.id);
      if (err) { setError(err.message); return; }
      setMedical({ ...v, id: medical.id });
    } else {
      const { data, error: err } = await supabase.from("driver_medical_cards").insert({ user_id: effectiveUserId, company_id: companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setMedical(data as any);
    }
  };
  const removeMedical = async () => {
    if (!medical?.id) return;
    const { error: err } = await supabase.from("driver_medical_cards").delete().eq("id", medical.id);
    if (err) { setError(err.message); return; }
    setMedical(null);
  };

  const saveTwic = async (v: TwicRow) => {
    if (twic?.id) {
      const { error: err } = await supabase.from("driver_twic_cards").update({ ...v, updated_at: new Date().toISOString() }).eq("id", twic.id);
      if (err) { setError(err.message); return; }
      setTwic({ ...v, id: twic.id });
    } else {
      const { data, error: err } = await supabase.from("driver_twic_cards").insert({ user_id: effectiveUserId, company_id: companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setTwic(data as any);
    }
  };
  const removeTwic = async () => {
    if (!twic?.id) return;
    const { error: err } = await supabase.from("driver_twic_cards").delete().eq("id", twic.id);
    if (err) { setError(err.message); return; }
    setTwic(null);
  };

  const loading = license === undefined || medical === undefined || twic === undefined;

  return (
    <div>
      <CardsSubTabs />
      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}
      {loading ? (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <LicenseCard value={license ?? null} onSave={saveLicense} onRemove={removeLicense} />
          <MedicalCard value={medical ?? null} onSave={saveMedical} onRemove={removeMedical} />
          <TwicCard value={twic ?? null} onSave={saveTwic} onRemove={removeTwic} />
        </div>
      )}
    </div>
  );
}
