"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import NavMenu from "@/lib/ui/NavMenu";

import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

import {
  TruckCard, TrailerCard,
  TruckModal, TrailerModal,
  type Truck, type Trailer, type OtherPermit, type Compartment,
} from "@/lib/ui/driver/EquipmentDetails";

// ─────────────────────────────────────────────────────────────
// Admin-only types
// ─────────────────────────────────────────────────────────────

type Combo = {
  combo_id: string; combo_name: string; truck_id: string; trailer_id: string;
  tare_lbs: number; target_weight: number | null; active: boolean;
  claimed_by?: string | null;
  truck?: { truck_name: string } | { truck_name: string }[] | null;
  trailer?: { trailer_name: string } | { trailer_name: string }[] | null;
  in_use_by_name?: string | null;
};


type SortField   = "name" | "role" | "division" | "region" | "hire_date";
type SortDir     = "asc" | "desc";
type ActiveFilter = "" | "active" | "inactive";

type Product = {
  product_id: string;
  product_name: string;
  button_code: string | null;
  hex_code: string | null;
  display_name: string | null;
  description: string | null;
  un_number: string | null;
  active: boolean;
  is_dyed: boolean;
};

type TerminalProduct = {
  product_id: string;
  button_code: string | null;
  product_name: string;
  hex_code: string | null;
  description: string | null;
  un_number: string | null;
  is_dyed: boolean;
  is_out_of_stock: boolean;
  active: boolean;
};

type Terminal = {
  terminal_id: string;
  terminal_name: string;
  city: string | null;
  state: string | null;
  city_id: string | null;
  timezone: string | null;
  active: boolean;
  renewal_days: number | null;
  lat: number | null;
  lon: number | null;
  products?: TerminalProduct[];
};

// ─────────────────────────────────────────────────────────────
// Shared style constants
// ─────────────────────────────────────────────────────────────

// Condensed input — used throughout modals
const sm: React.CSSProperties = { padding: "4px 8px", fontSize: 12, height: 26 };



// ─────────────────────────────────────────────────────────────
// Invite Modal
// ─────────────────────────────────────────────────────────────

function InviteModal({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("driver");
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function send() {
    if (!email.trim()) return; setLoading(true); setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/invite", { method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role }) });
      let json: any = {}; try { json = await res.json(); } catch {}
      if (!res.ok) throw new Error(json?.error ?? `Invite failed (${res.status}).`);
      setStatus({ type: "success", msg: `Invite sent to ${email.trim()}.` }); setEmail("");
      setTimeout(() => onDone(), 2000);
    } catch (e: any) { setStatus({ type: "error", msg: e?.message ?? "Failed." }); }
    finally { setLoading(false); }
  }
  return (
    <Modal title="Invite User" onClose={onClose}>
      {status && <Banner msg={status.msg} type={status.type} />}
      <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={css.input} onKeyDown={e => e.key === "Enter" && send()} autoFocus /></Field>
      <Field label="Role"><select value={role} onChange={e => setRole(e.target.value)} style={{ ...css.select, width: "100%" }}><option value="driver">Driver</option><option value="admin">Admin</option></select></Field>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>If the user already has an account they'll be added immediately. New users receive a magic link.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={send} disabled={loading || !email.trim()}>{loading ? "Sending…" : "Send Invite"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Combo Modal — equal-width buttons, even spacing
// ─────────────────────────────────────────────────────────────

function ComboModal({ combo, companyId, trucks, trailers, onClose, onDone, onDecouple }: {
  combo: Combo | null; companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void; onDecouple?: () => void;
}) {
  const isNew = !combo;
  const [truckId,   setTruckId]   = useState(combo?.truck_id ?? trucks[0]?.truck_id ?? "");
  const [trailerId, setTrailerId] = useState(combo?.trailer_id ?? trailers[0]?.trailer_id ?? "");
  const [tareLbs,   setTareLbs]   = useState(String(combo?.tare_lbs ?? ""));
  const [target,    setTarget]    = useState(String(combo?.target_weight ?? "80000"));
  const [err,       setErr]       = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  async function save() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true); setErr(null);
    if (isNew) {
      const { error } = await supabase.rpc("couple_combo", { p_truck_id: truckId, p_trailer_id: trailerId, p_tare_lbs: parseFloat(tareLbs), p_target_weight: parseFloat(target) || 80000 });
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("equipment_combos").update({ truck_id: truckId, trailer_id: trailerId, tare_lbs: parseFloat(tareLbs), target_weight: parseFloat(target) || null }).eq("combo_id", combo!.combo_id);
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteCombo() {
    if (!confirm("Delete this combo?")) return; setSaving(true);
    await supabase.from("equipment_combos").delete().eq("combo_id", combo!.combo_id); onDone();
  }

  return (
    <Modal title={isNew ? "New Combo" : "Edit Combo"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}
      <Field label="Truck">
        <select value={truckId} onChange={e => setTruckId(e.target.value)} style={{ ...css.select, width: "100%" }}>
          {trucks.length === 0 && <option value="">No active trucks</option>}
          {trucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_name}</option>)}
        </select>
      </Field>
      <Field label="Trailer">
        <select value={trailerId} onChange={e => setTrailerId(e.target.value)} style={{ ...css.select, width: "100%" }}>
          {trailers.length === 0 && <option value="">No active trailers</option>}
          {trailers.map(t => <option key={t.trailer_id} value={t.trailer_id}>{t.trailer_name}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Tare Weight (lbs)</label>
          <input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Target Gross (lbs)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 80000" style={css.input} />
        </div>
      </div>

      {/* Equal-width buttons, full-width row, evenly spaced */}
      <div style={{ display: "flex", gap: 8 }}>
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: 1, color: T.danger, borderColor: `${T.danger}55`, justifyContent: "center" as const }}
            onClick={deleteCombo} disabled={saving}>Delete</button>
        )}
        {!isNew && onDecouple && (
          <button style={{ ...css.btn("ghost"), flex: 1, color: T.warning, borderColor: `${T.warning}55`, justifyContent: "center" as const }}
            onClick={onDecouple} disabled={saving}>Decouple</button>
        )}
        <button style={{ ...css.btn("ghost"), flex: 1, justifyContent: "center" as const }}
          onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: 1, justifyContent: "center" as const }}
          onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Couple" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// CoupleModal — search trucks + trailers to couple
// ─────────────────────────────────────────────────────────────

function CoupleModal({ companyId, trucks, trailers, onClose, onDone }: {
  companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void;
}) {
  const [truckSearch,   setTruckSearch]   = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [truckId,   setTruckId]   = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [tareLbs,   setTareLbs]   = useState("");
  const [target,    setTarget]    = useState("80000");
  const [statusLoc, setStatusLoc] = useState("");
  const [err,       setErr]       = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  const filteredTrucks = trucks.filter(t =>
    !truckSearch || [t.truck_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(truckSearch.toLowerCase()))
  );
  const filteredTrailers = trailers.filter(t =>
    !trailerSearch || [t.trailer_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(trailerSearch.toLowerCase()))
  );

  async function couple() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("couple_combo", {
      p_truck_id: truckId, p_trailer_id: trailerId,
      p_tare_lbs: parseFloat(tareLbs), p_target_weight: parseFloat(target) || 80000,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    if (statusLoc) {
      await supabase.from("trucks").update({ status_location: statusLoc, status_code: "AVAIL" }).eq("truck_id", truckId);
      await supabase.from("trailers").update({ status_location: statusLoc, status_code: "AVAIL" }).eq("trailer_id", trailerId);
    }
    onDone();
  }

  const selStyle = (selected: boolean): React.CSSProperties => ({
    ...css.card, cursor: "pointer", marginBottom: 4, fontSize: 12,
    padding: "6px 10px",
    borderColor: selected ? T.accent : T.border,
    background: selected ? `${T.accent}18` : T.surface,
  });

  return (
    <Modal title="Couple Equipment" onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <SubSectionTitle>Truck</SubSectionTitle>
          <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search…" style={{ ...css.input, marginBottom: 6, fontSize: 12 }} />
          <div style={{ maxHeight: 200, overflowY: "auto" as const }}>
            {filteredTrucks.map(t => (
              <div key={t.truck_id} style={selStyle(truckId === t.truck_id)} onClick={() => setTruckId(t.truck_id)}>
                <div style={{ fontWeight: 700 }}>{t.truck_name}</div>
                <div style={{ color: T.muted, fontSize: 11 }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SubSectionTitle>Trailer</SubSectionTitle>
          <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search…" style={{ ...css.input, marginBottom: 6, fontSize: 12 }} />
          <div style={{ maxHeight: 200, overflowY: "auto" as const }}>
            {filteredTrailers.map(t => (
              <div key={t.trailer_id} style={selStyle(trailerId === t.trailer_id)} onClick={() => setTrailerId(t.trailer_id)}>
                <div style={{ fontWeight: 700 }}>{t.trailer_name}</div>
                <div style={{ color: T.muted, fontSize: 11 }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={{ flex: 1 }}><label style={css.label}>Tare (lbs)</label><input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="34000" style={css.input} /></div>
        <div style={{ flex: 1 }}><label style={css.label}>Target Gross (lbs)</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} style={css.input} /></div>
        <div style={{ flex: 1 }}><label style={css.label}>Location (optional)</label><input value={statusLoc} onChange={e => setStatusLoc(e.target.value)} placeholder="e.g. Yard 1" style={css.input} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={couple} disabled={saving || !truckId || !trailerId}>{saving ? "Coupling…" : "Couple"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// ProductSwatch — inline colored button code badge
// ─────────────────────────────────────────────────────────────

function ProductSwatch({ buttonCode, hexCode, isDyed, size = "sm" }: {
  buttonCode: string | null; hexCode: string | null; isDyed?: boolean; size?: "sm" | "md";
}) {
  const color = hexCode ? `#${hexCode.replace("#", "")}` : "rgba(255,255,255,0.4)";
  const dim   = size === "md" ? 40 : 28;
  const fs    = size === "md" ? 13 : 10;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: 8, flexShrink: 0,
      background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: isDyed ? "2px solid #ef4444" : `2px solid ${color}`,
      boxShadow: isDyed ? "0 0 0 1px rgba(239,68,68,0.3)" : "none",
    }}>
      <span style={{ fontSize: fs, fontWeight: 900, color,
        letterSpacing: 0.3, lineHeight: 1 }}>
        {buttonCode ?? "?"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TerminalCard — matches user profile collapsed view
// Groups are rendered by the parent; this is the per-terminal row
// ─────────────────────────────────────────────────────────────

function TerminalRow({ terminal, onEdit }: { terminal: Terminal; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const products = terminal.products ?? [];

  return (
    <div style={{ borderLeft: `2px solid ${T.border}`, marginLeft: 8, marginBottom: 2 }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", cursor: "pointer", userSelect: "none" as const, borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {terminal.terminal_name}
          </span>
          {!terminal.active && (
            <span style={{ fontSize: 9, color: T.muted, fontWeight: 700,
              background: "rgba(255,255,255,0.06)", borderRadius: 3, padding: "1px 4px" }}>INACTIVE</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {terminal.renewal_days != null && (
            <span style={{ fontSize: 11, color: T.muted }}>{terminal.renewal_days}d</span>
          )}
          <span style={{ fontSize: 11, color: T.muted }}>
            {products.length} product{products.length !== 1 ? "s" : ""}
          </span>
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer",
            color: T.muted, fontSize: 11, padding: "1px 6px", borderRadius: 4 }}
            onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <span style={{ fontSize: 10, color: T.muted, transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>›</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "4px 10px 8px 14px" }}>
          {products.length === 0
            ? <div style={{ fontSize: 11, color: T.muted }}>No products assigned.</div>
            : products.map((p, i) => (
              <div key={`${p.product_id}-${i}`}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
                  borderBottom: i < products.length - 1 ? `1px solid ${T.border}22` : "none" }}>
                <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                    {p.product_name}
                    {p.is_dyed && <span style={{ color: "#ef4444", fontSize: 10, marginLeft: 5 }}>DYED</span>}
                    {p.is_out_of_stock && <span style={{ color: T.warning, fontSize: 10, marginLeft: 5 }}>OUT OF STOCK</span>}
                  </div>
                  {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

function TerminalGroup({ cityState, terminals, onEdit }: {
  cityState: string; terminals: Terminal[]; onEdit: (t: Terminal) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeCount = terminals.filter(t => t.active).length;

  return (
    <div style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none" as const, padding: "4px 2px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted, transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>›</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{cityState}</span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>{activeCount} active</span>
      </div>
      {open && terminals.map(t => (
        <TerminalRow key={t.terminal_id} terminal={t} onEdit={() => onEdit(t)} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// US state → default IANA timezone
// ─────────────────────────────────────────────────────────────
const STATE_TIMEZONES: Record<string, string> = {
  AL:"America/Chicago",AK:"America/Anchorage",AZ:"America/Phoenix",AR:"America/Chicago",
  CA:"America/Los_Angeles",CO:"America/Denver",CT:"America/New_York",DE:"America/New_York",
  FL:"America/New_York",GA:"America/New_York",HI:"Pacific/Honolulu",ID:"America/Denver",
  IL:"America/Chicago",IN:"America/Indiana/Indianapolis",IA:"America/Chicago",KS:"America/Chicago",
  KY:"America/New_York",LA:"America/Chicago",ME:"America/New_York",MD:"America/New_York",
  MA:"America/New_York",MI:"America/Detroit",MN:"America/Chicago",MS:"America/Chicago",
  MO:"America/Chicago",MT:"America/Denver",NE:"America/Chicago",NV:"America/Los_Angeles",
  NH:"America/New_York",NJ:"America/New_York",NM:"America/Denver",NY:"America/New_York",
  NC:"America/New_York",ND:"America/Chicago",OH:"America/New_York",OK:"America/Chicago",
  OR:"America/Los_Angeles",PA:"America/New_York",RI:"America/New_York",SC:"America/New_York",
  SD:"America/Chicago",TN:"America/Chicago",TX:"America/Chicago",UT:"America/Denver",
  VT:"America/New_York",VA:"America/New_York",WA:"America/Los_Angeles",WV:"America/New_York",
  WI:"America/Chicago",WY:"America/Denver",DC:"America/New_York",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

// ─────────────────────────────────────────────────────────────
// TerminalModal — add/edit terminal with product assignment
// ─────────────────────────────────────────────────────────────

function TerminalModal({ terminal, companyId, allProducts, onClose, onDone }: {
  terminal: Terminal | null; companyId: string; allProducts: Product[];
  onClose: () => void; onDone: () => void;
}) {
  const isNew = !terminal;

  const [name,        setName]        = useState(terminal?.terminal_name ?? "");
  const [city,        setCity]        = useState(terminal?.city ?? "");
  const [state,       setState]       = useState(terminal?.state ?? "");
  const [timezone,    setTimezone]    = useState(terminal?.timezone ?? "");
  const [renewalDays, setRenewalDays] = useState(String(terminal?.renewal_days ?? "90"));
  const [active,      setActive]      = useState(terminal?.active ?? true);

  // City list for selected state, loaded from Supabase cities table
  const [citiesForState, setCitiesForState] = useState<{ city_id: string; city_name: string }[]>([]);
  const [cityId, setCityId] = useState<string | null>(terminal?.city_id ?? null);

  // Load cities when state changes
  useEffect(() => {
    if (!state) { setCitiesForState([]); return; }
    supabase.from("cities")
      .select("city_id, city_name")
      .eq("state_code", state)
      .eq("active", true)
      .order("city_name")
      .then(({ data }) => setCitiesForState(data ?? []));
  }, [state]);

  // Auto-set timezone when state changes (only if user hasn't manually overridden)
  const handleStateChange = (newState: string) => {
    setState(newState);
    const tz = STATE_TIMEZONES[newState];
    if (tz) setTimezone(tz);
    // Reset city when state changes
    setCity("");
    setCityId(null);
  };

  // When city selection changes, find the city_id
  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    const found = citiesForState.find(c => c.city_name === newCity);
    setCityId(found?.city_id ?? null);
  };

  // Products assigned — just an ordered list of product_ids (duplicates allowed)
  const [assigned, setAssigned] = useState<string[]>(
    (terminal?.products ?? []).map(p => p.product_id)
  );

  const [catalogOpen,   setCatalogOpen]   = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState<string | null>(null);

  function addFromCatalog(productId: string) {
    setAssigned(prev => [...prev, productId]);
  }

  function removeAssigned(idx: number) {
    setAssigned(prev => prev.filter((_, i) => i !== idx));
  }

  const filteredCatalog = allProducts.filter(p => {
    if (!catalogSearch.trim()) return true;
    const q = catalogSearch.toLowerCase();
    return [p.product_name, p.button_code, p.description, p.un_number].some(v => v?.toLowerCase().includes(q));
  });

  async function save() {
    if (!name.trim()) { setErr("Terminal name is required."); return; }
    if (!cityId && city.trim()) {
      // city typed manually but not in list — still allow, city_id will be null
    }
    setSaving(true); setErr(null);
    try {
      let tid = terminal?.terminal_id;
      const payload = {
        terminal_name: name.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        city_id: cityId ?? null,
        timezone: timezone.trim() || null,
        renewal_days: renewalDays ? parseInt(renewalDays) : null,
        active,
      };
      if (isNew) {
        const { data: newT, error: tErr } = await supabase.from("terminals").insert(payload).select("terminal_id").single();
        if (tErr) throw tErr;
        tid = newT.terminal_id;
      } else {
        const { error: tErr } = await supabase.from("terminals").update(payload).eq("terminal_id", tid!);
        if (tErr) throw tErr;
      }

      // Sync terminal_products — delete all then re-insert
      await supabase.from("terminal_products").delete().eq("terminal_id", tid!);
      if (assigned.length > 0) {
        const { error: pErr } = await supabase.from("terminal_products").insert(
          assigned.map(productId => ({
            terminal_id: tid!, product_id: productId, active: true, is_out_of_stock: false,
          }))
        );
        if (pErr) throw pErr;
      }
      onDone();
    } catch (e: any) { setErr(e?.message ?? "Save failed."); }
    finally { setSaving(false); }
  }

  async function deleteTerminal() {
    if (!confirm("Deactivate this terminal? It will be hidden from drivers but products will be preserved.")) return;
    setSaving(true);
    await supabase.from("terminals").update({ active: false }).eq("terminal_id", terminal!.terminal_id);
    onDone();
  }

  const sel = (val: string, onChange: (v: string) => void, opts: string[], ph = "") => (
    <select value={val} onChange={e => onChange(e.target.value)}
      style={{ ...css.input, ...sm }}>
      <option value="">{ph}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Terminal" : "Edit Terminal"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      <SubSectionTitle>Location</SubSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>Terminal Name</label>
          {ti(name, setName, "e.g. Port Tampa Bay Terminal")}
        </div>
        <div style={{ gridColumn: "1 / 3" }}>
          <label style={{ ...css.label, fontSize: 10 }}>State</label>
          {sel(state, handleStateChange, US_STATES, "Select state…")}
        </div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Renewal Days</label>
          {ti(renewalDays, setRenewalDays, "90", "number")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>City</label>
          {citiesForState.length > 0
            ? sel(city, handleCityChange, citiesForState.map(c => c.city_name), "Select city…")
            : ti(city, (v) => { setCity(v); setCityId(null); }, "City name")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>Timezone (auto-set from state)</label>
          {ti(timezone, setTimezone, "America/New_York")}
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = terminal appears in the planner.
        The <em>Deactivate</em> button below hides it without revoking access.
      </div>

      <hr style={css.divider} />

      {/* ── Products ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SubSectionTitle>Products at This Terminal</SubSectionTitle>
        <button type="button"
          style={{ ...css.btn("subtle"), fontSize: 12, padding: "8px 16px", minHeight: 36 }}
          onClick={() => { setCatalogOpen(v => !v); setCatalogSearch(""); }}>
          {catalogOpen ? "Close Catalog" : "+ Add from Catalog"}
        </button>
      </div>

      {/* Catalog picker */}
      {catalogOpen && (
        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: "8px 10px", marginBottom: 10 }}>
          <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
            placeholder="Search products…" style={{ ...css.input, width: "100%", marginBottom: 8, fontSize: 12, padding: "5px 8px" }} />
          <div style={{ maxHeight: 260, overflowY: "auto" as const }}>
            {filteredCatalog.length === 0 && <div style={{ fontSize: 11, color: T.muted }}>No products found.</div>}
            {filteredCatalog.map(p => {
              const countIn = assigned.filter(id => id === p.product_id).length;
              return (
                <div key={p.product_id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px",
                    borderBottom: `1px solid ${T.border}22`, cursor: "pointer" }}
                  onClick={() => addFromCatalog(p.product_id)}>
                  <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                    {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: countIn > 0 ? T.accent : T.muted, fontWeight: 700, flexShrink: 0 }}>
                    {countIn > 0 ? `✓ ×${countIn}` : "+ Add"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assigned products */}
      {assigned.length === 0
        ? <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>No products assigned yet.</div>
        : assigned.map((productId, i) => {
          const p = allProducts.find(x => x.product_id === productId);
          if (!p) return null;
          return (
            <div key={`${productId}-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                borderBottom: `1px solid ${T.border}22` }}>
              <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
              </div>
              <button type="button" onClick={() => removeAssigned(i)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
                  fontSize: 14, padding: "0 4px", flexShrink: 0, minWidth: 22, minHeight: 22,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          );
        })
      }

      <hr style={css.divider} />

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && (
            <button style={{ ...css.btn("danger"), flex: "1 1 0", textAlign: "center" as const }}
              onClick={deleteTerminal} disabled={saving}>Remove</button>
          )}
          {!isNew && (
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", textAlign: "center" as const,
              color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
              onClick={() => setActive(v => !v)} disabled={saving}>
              {active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", textAlign: "center" as const }}
            onClick={onClose}>Cancel</button>
        </div>
        <button style={{ ...css.btn("primary"), width: "100%", textAlign: "center" as const }}
          onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Terminal" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Main AdminPage
// ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [companyId,     setCompanyId]     = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [companyName,   setCompanyName]   = useState<string>("");
  const [members,       setMembers]       = useState<Member[]>([]);
  const [trucks,        setTrucks]        = useState<Truck[]>([]);
  const [trailers,      setTrailers]      = useState<Trailer[]>([]);
  const [combos,        setCombos]        = useState<Combo[]>([]);
  // Other permits per truck — loaded once for card display
  const [truckOtherPermits, setTruckOtherPermits] = useState<Record<string, OtherPermit[]>>({});
  const [terminals,     setTerminals]     = useState<Terminal[]>([]);
  const [allProducts,   setAllProducts]   = useState<Product[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState<string | null>(null);

  const [usersOpen,      setUsersOpen]      = useState(false);
  const [trucksOpen,     setTrucksOpen]     = useState(false);
  const [trailersOpen,   setTrailersOpen]   = useState(false);
  const [combosOpen,     setCombosOpen]     = useState(false);
  const [terminalsOpen,  setTerminalsOpen]  = useState(false);

  const [search,     setSearch]     = useState("");
  const [sortField,  setSortField]  = useState<SortField>("name");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "admin" | "driver">("");

  const [truckFilter,   setTruckFilter]   = useState<ActiveFilter>("");
  const [truckSearch,   setTruckSearch]   = useState("");
  const [truckSort,     setTruckSort]     = useState("name:asc");
  const [trailerFilter, setTrailerFilter] = useState<ActiveFilter>("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [trailerSort,   setTrailerSort]   = useState("name:asc");
  const [comboSearch,   setComboSearch]   = useState("");

  const [inviteModal,  setInviteModal]  = useState(false);
  const [profileModal, setProfileModal] = useState<{ member: Member; onSaved: (u: Partial<Member>) => void } | null>(null);
  const [truckModal,   setTruckModal]   = useState<Truck | null | "new">(null);
  const [trailerModal, setTrailerModal] = useState<Trailer | null | "new">(null);
  const [comboModal,   setComboModal]   = useState<Combo | null | "new">(null);
  const [coupleModal,  setCoupleModal]  = useState(false);
  const [terminalModal, setTerminalModal] = useState<Terminal | null | "new">(null);
  const [terminalSearch, setTerminalSearch] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setErr("Not authenticated."); return; }
      setCurrentUserId(uid);
      const { data: settings } = await supabase.from("user_settings").select("active_company_id").eq("user_id", uid).maybeSingle();
      const cid = settings?.active_company_id as string | null;
      if (!cid) { setErr("No active company selected."); return; }
      setCompanyId(cid);
      const { data: memRow } = await supabase.from("user_companies").select("role, company:companies(company_name)").eq("user_id", uid).eq("company_id", cid).maybeSingle();
      setCompanyName((memRow?.company as any)?.company_name ?? "");
      if (memRow?.role !== "admin") { setErr("Admin access required."); return; }

      // Members
      const { data: memberRows } = await supabase.from("user_companies").select("user_id, role").eq("company_id", cid);
      const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, hire_date, division, region, local_area, employee_number");
      const { data: emailRows } = await supabase.rpc("get_company_member_emails", { p_company_id: cid });
      const profileMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p]));
      const emailMap   = Object.fromEntries(((emailRows ?? []) as any[]).map(r => [r.user_id, r.email]));
      setMembers(((memberRows ?? []) as any[]).map(m => ({
        user_id: m.user_id, role: m.role, email: emailMap[m.user_id] ?? "",
        display_name: profileMap[m.user_id]?.display_name ?? null,
        hire_date: profileMap[m.user_id]?.hire_date ?? null,
        division: profileMap[m.user_id]?.division ?? null,
        region: profileMap[m.user_id]?.region ?? null,
        local_area: profileMap[m.user_id]?.local_area ?? null,
        employee_number: profileMap[m.user_id]?.employee_number ?? null,
      })));

      // Trucks + trailers via roster RPC
      const { data: rosterData, error: rosterErr } = await supabase.rpc("get_equipment_roster", { p_company_id: cid });
      if (rosterErr) throw rosterErr;
      const roster = rosterData as { trucks: any[]; trailers: any[] };
      const truckRows   = roster?.trucks   ?? [];
      const trailerRows = roster?.trailers ?? [];

      // Compartments
      const tIds = trailerRows.map((t: any) => t.trailer_id);
      let compMap: Record<string, Compartment[]> = {};
      if (tIds.length > 0) {
        const { data: compRows } = await supabase.from("trailer_compartments")
          .select("trailer_id, comp_number, max_gallons, position").in("trailer_id", tIds).order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position });
        }
      }

      // Other permits for truck cards
      const truckIds = truckRows.map((t: any) => t.truck_id);
      if (truckIds.length > 0) {
        const { data: opRows } = await supabase.from("truck_other_permits")
          .select("truck_id, permit_id, label, expiration_date").in("truck_id", truckIds).order("created_at");
        const opMap: Record<string, OtherPermit[]> = {};
        for (const r of (opRows ?? []) as any[]) {
          if (!opMap[r.truck_id]) opMap[r.truck_id] = [];
          opMap[r.truck_id].push({ permit_id: r.permit_id, label: r.label, expiration_date: r.expiration_date ?? "" });
        }
        setTruckOtherPermits(opMap);
      }

      // Active combos
      const { data: comboRows } = await supabase.from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid).eq("active", true).order("combo_name");

      const claimedIds = [...new Set((comboRows ?? []).map((c: any) => c.claimed_by).filter(Boolean))];
      let claimedNameMap: Record<string, string> = {};
      if (claimedIds.length > 0) {
        const { data: cn } = await supabase.from("profiles").select("user_id, display_name").in("user_id", claimedIds);
        claimedNameMap = Object.fromEntries((cn ?? []).map((r: any) => [r.user_id, r.display_name ?? ""]));
      }

      setTrucks(truckRows as Truck[]);
      setTrailers(trailerRows.map((t: any) => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })) as Trailer[]);
      setCombos(((comboRows ?? []) as any[]).map(c => ({ ...c, in_use_by_name: c.claimed_by ? claimedNameMap[c.claimed_by] ?? null : null })) as unknown as Combo[]);

      // Always load the full product catalog (needed for TerminalModal picker)
      const { data: prodRows } = await supabase
        .from("products")
        .select("product_id, product_name, button_code, hex_code, display_name, description, un_number, active, is_dyed")
        .eq("active", true)
        .order("product_name");
      setAllProducts((prodRows ?? []) as Product[]);
      const prodMap: Record<string, Product> = Object.fromEntries(
        (prodRows ?? []).map((p: any) => [p.product_id, p as Product])
      );

      // Terminals — no company gating, all active terminals are available
      // Load all terminals with their products
      const { data: termRows } = await supabase
        .from("terminals")
        .select("terminal_id, terminal_name, city, state, city_id, timezone, active, renewal_days, lat, lon")
        .order("state").order("city").order("terminal_name");

      const termIds = (termRows ?? []).map((t: any) => t.terminal_id);

      const { data: tpRows } = termIds.length > 0
        ? await supabase
            .from("terminal_products")
            .select("terminal_id, product_id, active, is_out_of_stock")
            .in("terminal_id", termIds)
            .eq("active", true)
        : { data: [] };

      const tpMap: Record<string, TerminalProduct[]> = {};
      for (const tp of (tpRows ?? []) as any[]) {
        const p = prodMap[tp.product_id];
        if (!p) continue;
        if (!tpMap[tp.terminal_id]) tpMap[tp.terminal_id] = [];
        tpMap[tp.terminal_id].push({
          product_id: tp.product_id, button_code: p.button_code,
          product_name: p.product_name, hex_code: p.hex_code,
          description: p.description, un_number: p.un_number,
          is_dyed: p.is_dyed ?? false,
          is_out_of_stock: tp.is_out_of_stock ?? false,
          active: tp.active ?? true,
        });
      }

      setTerminals((termRows ?? []).map((t: any) => ({
        ...t,
        products: tpMap[t.terminal_id] ?? [],
      })) as Terminal[]);
    } catch (e: any) { setErr(e?.message ?? "Load failed."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredMembers = useMemo(() => {
    let ms = [...members];
    if (filterRole) ms = ms.filter(m => m.role === filterRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      ms = ms.filter(m => [m.display_name, m.email, m.division, m.region, m.local_area, m.employee_number].some(v => v?.toLowerCase().includes(q)));
    }
    ms.sort((a, b) => {
      const av = (sortField === "name" ? (a.display_name ?? a.email) : sortField === "role" ? a.role : sortField === "division" ? a.division : sortField === "region" ? a.region : a.hire_date) ?? "";
      const bv = (sortField === "name" ? (b.display_name ?? b.email) : sortField === "role" ? b.role : sortField === "division" ? b.division : sortField === "region" ? b.region : b.hire_date) ?? "";
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ms;
  }, [members, search, sortField, sortDir, filterRole]);

  const filteredTrucks = useMemo(() => {
    let ts = [...trucks];
    if (truckFilter === "active")   ts = ts.filter(t => t.active);
    if (truckFilter === "inactive") ts = ts.filter(t => !t.active);
    if (truckSearch.trim()) {
      const q = truckSearch.toLowerCase();
      ts = ts.filter(t => [t.truck_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(q)));
    }
    const [sf, sd] = truckSort.split(":");
    ts.sort((a, b) => {
      const av = (sf === "name" ? a.truck_name : sf === "region" ? a.region : sf === "status" ? a.status_code : a.truck_name) ?? "";
      const bv = (sf === "name" ? b.truck_name : sf === "region" ? b.region : sf === "status" ? b.status_code : b.truck_name) ?? "";
      return sd === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ts;
  }, [trucks, truckFilter, truckSearch, truckSort]);

  const filteredTrailers = useMemo(() => {
    let ts = [...trailers];
    if (trailerFilter === "active")   ts = ts.filter(t => t.active);
    if (trailerFilter === "inactive") ts = ts.filter(t => !t.active);
    if (trailerSearch.trim()) {
      const q = trailerSearch.toLowerCase();
      ts = ts.filter(t => [t.trailer_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(q)));
    }
    const [sf, sd] = trailerSort.split(":");
    ts.sort((a, b) => {
      const av = (sf === "name" ? a.trailer_name : sf === "region" ? a.region : a.trailer_name) ?? "";
      const bv = (sf === "name" ? b.trailer_name : sf === "region" ? b.region : b.trailer_name) ?? "";
      return sd === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ts;
  }, [trailers, trailerFilter, trailerSearch, trailerSort]);

  const filteredCombos = useMemo(() => {
    let cs = combos.filter(c => c.active);
    if (comboSearch.trim()) {
      const q = comboSearch.toLowerCase();
      cs = cs.filter(c => {
        const tn = Array.isArray(c.truck) ? c.truck[0]?.truck_name : c.truck?.truck_name;
        const tr = Array.isArray(c.trailer) ? c.trailer[0]?.trailer_name : c.trailer?.trailer_name;
        return [tn, tr, c.in_use_by_name].some(v => v?.toLowerCase().includes(q));
      });
    }
    return cs;
  }, [combos, comboSearch]);

  if (loading) return <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>Loading…</div>;
  if (err)     return <div style={css.page}><Banner msg={err} type="error" /></div>;

  const plusBtn: React.CSSProperties = {
    ...css.btn("primary"), width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: "1",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  const filterRow: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12 }}>
        <div><h1 style={css.heading}>{companyName}</h1><p style={css.subheading}>Company Admin</p></div>
        <NavMenu />
      </div>

      {/* ── USERS ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={css.sectionHead}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", flex: 1 }} onClick={() => setUsersOpen(v => !v)}>
            <span style={{ transition: "transform 150ms", transform: usersOpen ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 14 }}>›</span>
            Users ({members.length})
          </h2>
          <button style={plusBtn} onClick={() => setInviteModal(true)}>+</button>
        </div>
        {usersOpen && (
          <>
            <div style={filterRow}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, employee #…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All roles</option><option value="admin">Admin</option><option value="driver">Driver</option>
              </select>
              <select value={`${sortField}:${sortDir}`} onChange={e => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as SortDir); }} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="role:asc">Role A→Z</option><option value="division:asc">Division A→Z</option>
                <option value="region:asc">Region A→Z</option><option value="hire_date:asc">Hire ↑</option><option value="hire_date:desc">Hire ↓</option>
              </select>
            </div>
            {filteredMembers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members match your search.</div>}
            {filteredMembers.map(m => <MemberCard key={m.user_id} member={m} companyId={companyId!} onRefresh={loadAll} onEditProfile={(member, onSaved) => setProfileModal({ member, onSaved })} currentUserId={currentUserId} />)}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TRUCKS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTrucksOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trucksOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trucks ({trucks.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTruckModal("new"); }}>+</button>
        </div>
        {trucksOpen && (
          <>
            <div style={filterRow}>
              <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
              <select value={truckFilter} onChange={e => setTruckFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select value={truckSort} onChange={e => setTruckSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="region:asc">Region A→Z</option><option value="status:asc">Status A→Z</option>
              </select>
            </div>
            {filteredTrucks.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks match your filter.</div>}
            {filteredTrucks.map(t => <TruckCard key={t.truck_id} truck={t} onEdit={() => setTruckModal(t)} otherPermits={truckOtherPermits[t.truck_id]} />)}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TRAILERS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTrailersOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trailersOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trailers ({trailers.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTrailerModal("new"); }}>+</button>
        </div>
        {trailersOpen && (
          <>
            <div style={filterRow}>
              <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
              <select value={trailerFilter} onChange={e => setTrailerFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select value={trailerSort} onChange={e => setTrailerSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="region:asc">Region A→Z</option>
              </select>
            </div>
            {filteredTrailers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trailers match your filter.</div>}
            {filteredTrailers.map(t => <TrailerCard key={t.trailer_id} trailer={t} onEdit={() => setTrailerModal(t)} />)}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── COMBOS ── */}
      <section style={{ marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setCombosOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: combosOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Equipment Combos ({combos.filter(c => c.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setCoupleModal(true); }}>+</button>
        </div>
        {combosOpen && (
          <>
            <div style={filterRow}>
              <input value={comboSearch} onChange={e => setComboSearch(e.target.value)} placeholder="Search truck, trailer, driver…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
            </div>
            {filteredCombos.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No active combos.</div>}
            {filteredCombos.map(c => <ComboCard key={c.combo_id} combo={c} onEdit={() => setComboModal(c)} />)}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TERMINALS ── */}
      <section style={{ marginTop: 28, marginBottom: 32 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTerminalsOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: terminalsOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Terminals ({terminals.length}{terminals.filter(t => t.active).length < terminals.length ? `, ${terminals.filter(t=>t.active).length} active` : " active"})
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTerminalModal("new"); }}>+</button>
        </div>
        {terminalsOpen && (
          <>
            <div style={filterRow}>
              <input value={terminalSearch} onChange={e => setTerminalSearch(e.target.value)}
                placeholder="Search terminal name, city, state…"
                style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
            </div>
            {(() => {
              const filtered = terminals.filter(t => {
                if (!terminalSearch.trim()) return true;
                const q = terminalSearch.toLowerCase();
                return [t.terminal_name, t.city, t.state].some(v => v?.toLowerCase().includes(q));
              });
              // Group by state + city
              const groups: Record<string, Terminal[]> = {};
              for (const t of filtered) {
                const key = [t.state, t.city].filter(Boolean).join(", ") || "Unknown";
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
              }
              if (filtered.length === 0) return <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No terminals match your search.</div>;
              return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([group, ts]) => (
                <TerminalGroup key={group} cityState={group} terminals={ts} onEdit={t => setTerminalModal(t)} />
              ));
            })()}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {inviteModal  && <InviteModal companyId={companyId!} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal.member} companyId={companyId!} onClose={() => setProfileModal(null)} onDone={(u) => { profileModal.onSaved(u); setProfileModal(null); }} onRemove={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal   && <TruckModal truck={truckModal === "new" ? null : truckModal} companyId={companyId!} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} />}
      {terminalModal && (
        <TerminalModal
          terminal={terminalModal === "new" ? null : terminalModal}
          companyId={companyId!}
          allProducts={allProducts}
          onClose={() => setTerminalModal(null)}
          onDone={() => { setTerminalModal(null); loadAll(); }}
        />
      )}
      {comboModal && comboModal !== "new" && (
        <ComboModal combo={comboModal} companyId={companyId!} trucks={trucks} trailers={trailers}
          onClose={() => setComboModal(null)} onDone={() => { setComboModal(null); loadAll(); }}
          onDecouple={async () => {
            if (!confirm("Decouple this combo?")) return;
            await supabase.rpc("decouple_combo", { p_combo_id: (comboModal as Combo).combo_id });
            setComboModal(null);
            loadAll();
          }}
        />
      )}
      {coupleModal && (() => {
        const coupledTruckIds   = new Set(combos.filter(c => c.active).map(c => c.truck_id));
        const coupledTrailerIds = new Set(combos.filter(c => c.active).map(c => c.trailer_id));
        return (
          <CoupleModal
            companyId={companyId!}
            trucks={trucks.filter(t => t.active && !coupledTruckIds.has(t.truck_id))}
            trailers={trailers.filter(t => t.active && !coupledTrailerIds.has(t.trailer_id))}
            onClose={() => setCoupleModal(false)}
            onDone={() => { setCoupleModal(false); loadAll(); }}
          />
        );
      })()}
    </div>
  );
}
