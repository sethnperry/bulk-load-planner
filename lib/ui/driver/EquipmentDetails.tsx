"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import {
  AttachmentIndicator, DocHubModal, DocPreviewModal,
  useAttachments, getCategoryLabel,
  TRUCK_CATEGORIES, TRAILER_CATEGORIES,
  type EquipmentType, type AttachmentGroup,
} from "@/lib/ui/driver/DocHub";

// Types
// ─────────────────────────────────────────────────────────────

type Truck = {
  truck_id: string; truck_name: string; active: boolean;
  vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null;
  region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null;
  reg_expiration_date: string | null; reg_enforcement_date: string | null;
  inspection_shop: string | null; inspection_issue_date: string | null; inspection_expiration_date: string | null;
  ifta_expiration_date: string | null; ifta_enforcement_date: string | null;
  phmsa_expiration_date: string | null; alliance_expiration_date: string | null;
  fleet_ins_expiration_date: string | null; hazmat_lic_expiration_date: string | null;
  inner_bridge_expiration_date: string | null;
  notes: string | null;
};

type Compartment = { comp_number: number; max_gallons: number; position: number; };

type Trailer = {
  trailer_id: string; trailer_name: string; active: boolean;
  vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null;
  cg_max: number; region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null; last_load_config: string | null;
  compartments?: Compartment[];
  trailer_reg_expiration_date: string | null; trailer_reg_enforcement_date: string | null;
  trailer_inspection_shop: string | null; trailer_inspection_issue_date: string | null;
  trailer_inspection_expiration_date: string | null;
  tank_v_expiration_date: string | null; tank_k_expiration_date: string | null;
  tank_l_expiration_date: string | null; tank_t_expiration_date: string | null;
  tank_i_expiration_date: string | null; tank_p_expiration_date: string | null;
  tank_uc_expiration_date: string | null; notes: string | null;
};

type Combo = {
  combo_id: string; combo_name: string; truck_id: string; trailer_id: string;
  tare_lbs: number; target_weight: number | null; active: boolean;
  claimed_by?: string | null;
  truck?: { truck_name: string } | { truck_name: string }[] | null;
  trailer?: { trailer_name: string } | { trailer_name: string }[] | null;
  in_use_by_name?: string | null;
};

type OtherPermit = { permit_id?: string; label: string; expiration_date: string; };
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

function fmtExpiryInline(dateStr: string | null | undefined, days: number | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const base = `${mm}-${dd}-${yyyy}`;
    if (days == null) return base;
    if (days < 0)     return `${base} (${days}d)`;
    if (days === 0)   return `${base} (today)`;
    return `${base} (+${days}d)`;
  } catch { return dateStr; }
}


// ─────────────────────────────────────────────────────────────
// PermitRow — read-only row with paperclip indicator
// ─────────────────────────────────────────────────────────────

function PermitRow({ label, date, enforcement, extra, category, hasDoc, onDocOpen }: {
  label: string; date: string | null; enforcement?: string | null; extra?: React.ReactNode;
  category?: string; hasDoc?: boolean; onDocOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const days    = daysUntil(date);
  const color   = expiryColor(days);
  const enfDays = enforcement ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);
  const hasExtra = !!(enforcement || extra);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, marginBottom: 2 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36,
          cursor: hasExtra ? "pointer" : "default", userSelect: "none" as const }}
        onClick={() => hasExtra && setExpanded(v => !v)}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: !date ? T.muted : color }} />
        <span style={{ fontSize: 12, color: T.muted, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: days != null && days < 30 ? 700 : 400,
          color: date ? color : T.muted, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
          {date ? fmtExpiryInline(date, days) : "—"}
        </span>
        {category !== undefined && (
          <AttachmentIndicator hasDoc={hasDoc ?? false} onOpen={() => onDocOpen?.()} />
        )}
        {hasExtra && (
          <span style={{ color: T.muted, fontSize: 9, flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms", display: "inline-block" }}>▼</span>
        )}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 14, paddingBottom: 8, display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {enforcement && <div style={{ fontSize: 11, color: enfColor }}>Enforcement: {fmtExpiryInline(enforcement, enfDays)}</div>}
          {extra}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PermitEditRow — edit-modal view: label | exp input [| enf input] | 📎 ☑ ▼
// ─────────────────────────────────────────────────────────────

function PermitEditRow({ label, expVal, onExpChange, enfVal, onEnfChange, extra }: {
  label: string;
  expVal: string; onExpChange: (v: string) => void;
  enfVal?: string; onEnfChange?: (v: string) => void;
  extra?: React.ReactNode;
}) {
  const [dropOpen, setDropOpen] = useState(false);
  const [checked,  setChecked]  = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      {/* Main row — label side is tappable to expand; date input and icon cluster stop propagation */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        <span
          style={{ fontSize: 11, color: T.muted, width: 148, flexShrink: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer", userSelect: "none" as const }}
          onClick={() => setDropOpen(v => !v)}
        >{label}</span>
        <input type="date" value={expVal} onChange={e => onExpChange(e.target.value)}
          style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
        {/* ☑ · ▼ */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button" title="Details"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 8,
              minWidth: 20, minHeight: 20, WebkitTapHighlightColor: "transparent",
              transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setDropOpen(v => !v)}>▼</button>
        </div>
      </div>
      {dropOpen && (
        <div style={{ paddingLeft: 4, paddingTop: 5, display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {onEnfChange !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>Enforcement Date</span>
              <input type="date" value={enfVal ?? ""} onChange={e => onEnfChange(e.target.value)}
                style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
              <span style={{ width: 62, flexShrink: 0 }} />
            </div>
          )}
          {extra}
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Notes…" rows={2}
            style={{ ...css.input, width: "100%", fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange }: { comps: Compartment[]; onChange: (c: Compartment[]) => void }) {
  // Positions are always comp_number - 1 (0-indexed). Never exposed to user.
  function reIndex(arr: Compartment[]): Compartment[] {
    return arr.map((c, idx) => ({ ...c, comp_number: idx + 1, position: idx }));
  }
  function update(i: number, val: string) {
    onChange(reIndex(comps.map((c, idx) => idx === i ? { ...c, max_gallons: parseFloat(val) || 0 } : c)));
  }
  function add() { onChange(reIndex([...comps, { comp_number: 0, max_gallons: 0, position: 0 }])); }
  function remove(i: number) { onChange(reIndex(comps.filter((_, idx) => idx !== i))); }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>COMPARTMENTS ({comps.length})</span>
        <button type="button" onClick={add} style={{ ...css.btn("subtle"), padding: "2px 10px", fontSize: 11 }}>+ Add</button>
      </div>
      {comps.length === 0 && <div style={{ fontSize: 11, color: T.muted, padding: "4px 0" }}>No compartments yet.</div>}
      {comps.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 18 }} />
          <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>Max Capacity (gal)</span>
          <div style={{ width: 24 }} />
        </div>
      )}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <div style={{ width: 18, fontSize: 11, color: T.muted, textAlign: "center" as const, fontWeight: 700, flexShrink: 0 }}>{c.comp_number}</div>
          <input type="number" placeholder="Gallons" value={c.max_gallons || ""} onChange={e => update(i, e.target.value)}
            style={{ ...css.input, ...sm, flex: 1 }} />
          <button type="button" onClick={() => remove(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px", flexShrink: 0, minWidth: 24, minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TruckCard — collapsed + expanded permit view
// ─────────────────────────────────────────────────────────────

function TruckCard({ truck, companyId, onEdit, otherPermits }: {
  truck: Truck; companyId: string; onEdit: () => void; otherPermits?: OtherPermit[]
}) {
  const [open, setOpen] = useState(false);
  const [hubOpen, setHubOpen]       = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);

  const { hasDoc, groups, reload } = useAttachments("truck", truck.truck_id, companyId);

  const statusColor = truck.status_code === "OOS" || truck.status_code === "MAINT" ? T.danger
    : truck.status_code === "AVAIL" ? T.success : T.muted;

  const allDates = [
    truck.reg_expiration_date, truck.inspection_expiration_date,
    truck.ifta_expiration_date, truck.phmsa_expiration_date,
    truck.alliance_expiration_date, truck.fleet_ins_expiration_date,
    truck.hazmat_lic_expiration_date, truck.inner_bridge_expiration_date,
    ...(otherPermits ?? []).map(p => p.expiration_date || null),
  ].filter(Boolean) as string[];
  const soonestDays = allDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d);
    if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const warnBadge = soonestDays != null && soonestDays <= 30;
  const badgeColor = expiryColor(soonestDays);

  function openDocForCategory(cat: string) {
    const g = groups.find(g => g.category === cat);
    if (g) setPreviewGroup(g);
  }

  return (
    <>
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      {/* Header row — tap anywhere to expand */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 12px 8px", cursor: "pointer", userSelect: "none" as const, gap: 10 }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{truck.truck_name}</span>
            {truck.status_code && (
              <span style={{
                fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: statusColor === T.danger ? "rgba(220,60,40,0.18)"
                  : statusColor === T.success ? "rgba(40,180,80,0.13)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5,
              }}>{truck.status_code}</span>
            )}
            {warnBadge && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: "rgba(220,60,40,0.15)", color: badgeColor, letterSpacing: 0.3 }}>
                ⚠ {soonestDays! < 0 ? "EXPIRED" : soonestDays === 0 ? "EXP TODAY" : `EXP ${soonestDays}d`}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" as const }}>
            {(truck.region || truck.local_area) && (
              <span style={{ fontSize: 11, color: T.muted }}>{[truck.region, truck.local_area].filter(Boolean).join(" · ")}</span>
            )}
            {truck.status_location && (
              <span style={{ fontSize: 11, color: T.muted }}>📍 {truck.status_location}</span>
            )}
          </div>
          {(truck.vin_number || truck.plate_number) && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2, letterSpacing: 0.3 }}>
              {[truck.vin_number, truck.plate_number && `Plate ${truck.plate_number}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 10px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); setHubOpen(true); }}>📎 Docs</button>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
          <span style={{ fontSize: 10, color: T.muted, transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>▼</span>
        </div>
      </div>

      {/* Expanded detail section */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 10px" }}
          onClick={e => e.stopPropagation()}>

          {(truck.make || truck.model || truck.year) && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
              {[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}
            </div>
          )}

          {truck.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {truck.notes}
            </div>
          )}

          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Registration"               date={truck.reg_expiration_date}         enforcement={truck.reg_enforcement_date}
            category="registration"      hasDoc={hasDoc("registration")}      onDocOpen={() => openDocForCategory("registration")} />
          <PermitRow label="Annual Inspection"           date={truck.inspection_expiration_date}
            category="annual_inspection" hasDoc={hasDoc("annual_inspection")} onDocOpen={() => openDocForCategory("annual_inspection")}
            extra={(truck.inspection_shop || truck.inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted }}>
                {[truck.inspection_shop, truck.inspection_issue_date && `Issued ${fmtDate(truck.inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          />
          <PermitRow label="IFTA Permit + Decals"       date={truck.ifta_expiration_date}        enforcement={truck.ifta_enforcement_date}
            category="ifta"              hasDoc={hasDoc("ifta")}              onDocOpen={() => openDocForCategory("ifta")} />
          <PermitRow label="PHMSA HazMat Permit"        date={truck.phmsa_expiration_date}
            category="phmsa_hazmat"      hasDoc={hasDoc("phmsa_hazmat")}      onDocOpen={() => openDocForCategory("phmsa_hazmat")} />
          <PermitRow label="Alliance HazMat Permit"     date={truck.alliance_expiration_date}
            category="alliance_hazmat"   hasDoc={hasDoc("alliance_hazmat")}   onDocOpen={() => openDocForCategory("alliance_hazmat")} />
          <PermitRow label="Fleet Insurance Cab Card"   date={truck.fleet_ins_expiration_date}
            category="fleet_insurance"   hasDoc={hasDoc("fleet_insurance")}   onDocOpen={() => openDocForCategory("fleet_insurance")} />
          <PermitRow label="HazMat Transportation Lic"  date={truck.hazmat_lic_expiration_date}
            category="hazmat_lic"        hasDoc={hasDoc("hazmat_lic")}        onDocOpen={() => openDocForCategory("hazmat_lic")} />
          <PermitRow label="Inner Bridge Permit"        date={truck.inner_bridge_expiration_date}
            category="inner_bridge"      hasDoc={hasDoc("inner_bridge")}      onDocOpen={() => openDocForCategory("inner_bridge")} />
          {(otherPermits ?? []).map((p, i) => (
            <PermitRow key={i} label={p.label || "Other Permit"} date={p.expiration_date || null}
              category="other" hasDoc={hasDoc("other")} onDocOpen={() => openDocForCategory("other")} />
          ))}
        </div>
      )}
    </div>

    {hubOpen && (
      <DocHubModal
        equipmentType="truck"
        equipmentId={truck.truck_id}
        equipmentName={truck.truck_name}
        companyId={companyId}
        onClose={() => { setHubOpen(false); reload(); }}
      />
    )}
    {previewGroup && (
      <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TrailerCard — collapsed + expanded
// ─────────────────────────────────────────────────────────────

function TrailerCard({ trailer, companyId, onEdit }: { trailer: Trailer; companyId: string; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [hubOpen, setHubOpen]           = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);

  const { hasDoc, groups, reload } = useAttachments("trailer", trailer.trailer_id, companyId);

  function openDocForCategory(cat: string) {
    const g = groups.find(g => g.category === cat);
    if (g) setPreviewGroup(g);
  }

  const comps = trailer.compartments ?? [];
  const totalGal = comps.reduce((s, c) => s + c.max_gallons, 0);
  const compSummary = comps.length > 0
    ? `${comps.length} comps · ${comps.map(c => c.max_gallons.toLocaleString()).join(" / ")} = ${totalGal.toLocaleString()} gal max`
    : null;

  const statusColor = trailer.status_code === "OOS" || trailer.status_code === "MAINT" ? T.danger
    : trailer.status_code === "AVAIL" ? T.success : T.muted;

  const tankDates = [
    trailer.tank_v_expiration_date, trailer.tank_k_expiration_date,
    trailer.tank_l_expiration_date, trailer.tank_t_expiration_date,
    trailer.tank_i_expiration_date, trailer.tank_p_expiration_date,
    trailer.tank_uc_expiration_date,
  ].filter(Boolean) as string[];
  const allDates = [
    trailer.trailer_reg_expiration_date,
    trailer.trailer_inspection_expiration_date,
    ...tankDates,
  ].filter(Boolean) as string[];
  const soonestDays = allDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d);
    if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const warnBadge = soonestDays != null && soonestDays <= 30;
  const badgeColor = expiryColor(soonestDays);

  return (
    <>
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 12px 8px", cursor: "pointer", userSelect: "none" as const, gap: 10 }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{trailer.trailer_name}</span>
            {trailer.status_code && (
              <span style={{
                fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: statusColor === T.danger ? "rgba(220,60,40,0.18)"
                  : statusColor === T.success ? "rgba(40,180,80,0.13)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5,
              }}>{trailer.status_code}</span>
            )}
            {warnBadge && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: "rgba(220,60,40,0.15)", color: badgeColor, letterSpacing: 0.3 }}>
                ⚠ {soonestDays! < 0 ? "EXPIRED" : soonestDays === 0 ? "EXP TODAY" : `EXP ${soonestDays}d`}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" as const }}>
            {(trailer.region || trailer.local_area) && (
              <span style={{ fontSize: 11, color: T.muted }}>{[trailer.region, trailer.local_area].filter(Boolean).join(" · ")}</span>
            )}
            {trailer.status_location && (
              <span style={{ fontSize: 11, color: T.muted }}>📍 {trailer.status_location}</span>
            )}
          </div>
          {compSummary && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{compSummary}</div>}
          {(trailer.vin_number || trailer.plate_number) && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1, letterSpacing: 0.3 }}>
              {[trailer.vin_number, trailer.plate_number && `Plate ${trailer.plate_number}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 10px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); setHubOpen(true); }}>📎 Docs</button>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
          <span style={{ fontSize: 10, color: T.muted, transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>▼</span>
        </div>
      </div>

      {/* Expanded section */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 10px" }}
          onClick={e => e.stopPropagation()}>

          {(trailer.make || trailer.model || trailer.year) && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>
              {[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}
            </div>
          )}

          {trailer.last_load_config && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
              Last loaded: {trailer.last_load_config}
            </div>
          )}

          {trailer.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {trailer.notes}
            </div>
          )}

          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Trailer Registration"  date={trailer.trailer_reg_expiration_date} enforcement={trailer.trailer_reg_enforcement_date}
            category="trailer_registration" hasDoc={hasDoc("trailer_registration")} onDocOpen={() => openDocForCategory("trailer_registration")} />
          <PermitRow label="Annual Inspection"      date={trailer.trailer_inspection_expiration_date}
            category="annual_inspection"    hasDoc={hasDoc("annual_inspection")}    onDocOpen={() => openDocForCategory("annual_inspection")}
            extra={(trailer.trailer_inspection_shop || trailer.trailer_inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted }}>
                {[trailer.trailer_inspection_shop, trailer.trailer_inspection_issue_date && `Issued ${fmtDate(trailer.trailer_inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          />

          {tankDates.length > 0 && <SubSectionTitle>Tank Inspections</SubSectionTitle>}
          {[
            { label: "V — Annual External Visual",   date: trailer.tank_v_expiration_date,  cat: "tank_v"  },
            { label: "K — Annual Leakage Test",      date: trailer.tank_k_expiration_date,  cat: "tank_k"  },
            { label: "L — Annual Lining Inspection", date: trailer.tank_l_expiration_date,  cat: "tank_l"  },
            { label: "T — 2yr Thickness Test",       date: trailer.tank_t_expiration_date,  cat: "tank_t"  },
            { label: "I — 5yr Internal Visual",      date: trailer.tank_i_expiration_date,  cat: "tank_i"  },
            { label: "P — 5yr Pressure Test",        date: trailer.tank_p_expiration_date,  cat: "tank_p"  },
            { label: "UC — 5yr Upper Coupler",       date: trailer.tank_uc_expiration_date, cat: "tank_uc" },
          ].filter(r => !!r.date).map(r => (
            <PermitRow key={r.cat} label={r.label} date={r.date}
              category={r.cat} hasDoc={hasDoc(r.cat)} onDocOpen={() => openDocForCategory(r.cat)} />
          ))}
        </div>
      )}
    </div>

    {hubOpen && (
      <DocHubModal
        equipmentType="trailer"
        equipmentId={trailer.trailer_id}
        equipmentName={trailer.trailer_name}
        companyId={companyId}
        onClose={() => { setHubOpen(false); reload(); }}
      />
    )}
    {previewGroup && (
      <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ComboCard
// ─────────────────────────────────────────────────────────────

function ComboCard({ combo, onEdit }: { combo: Combo; onEdit: () => void }) {
  const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
  const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;
  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{truckName || "—"} / {trailerName || "—"}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            Tare {combo.tare_lbs?.toLocaleString() ?? "—"} lbs
            {combo.target_weight ? ` · Target ${combo.target_weight.toLocaleString()} lbs` : ""}
            {combo.in_use_by_name ? ` · In use: ${combo.in_use_by_name}` : ""}
          </div>
        </div>
        <button type="button" style={{ ...css.btn("subtle"), padding: "3px 10px", fontSize: 11, flexShrink: 0 }} onClick={onEdit}>Edit</button>
      </div>
    </div>
  );
}

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
// Truck Modal
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, onClose, onDone }: {
  truck: Truck | null; companyId: string; onClose: () => void; onDone: () => void;
}) {
  const isNew = !truck;
  const [name,      setName]      = useState(truck?.truck_name ?? "");
  const [vin,       setVin]       = useState(truck?.vin_number ?? "");
  const [plate,     setPlate]     = useState(truck?.plate_number ?? "");
  const [make,      setMake]      = useState(truck?.make ?? "");
  const [model,     setModel]     = useState(truck?.model ?? "");
  const [year,      setYear]      = useState(String(truck?.year ?? ""));
  const [region,    setRegion]    = useState(truck?.region ?? "");
  const [local,     setLocal]     = useState(truck?.local_area ?? "");
  const [status,    setStatus]    = useState(truck?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(truck?.status_location ?? "");
  const [active,    setActive]    = useState(truck?.active ?? true);
  // Permit dates
  const [regExp,    setRegExp]    = useState(truck?.reg_expiration_date ?? "");
  const [regEnf,    setRegEnf]    = useState(truck?.reg_enforcement_date ?? "");
  const [insShop,   setInsShop]   = useState(truck?.inspection_shop ?? "");
  const [insIssue,  setInsIssue]  = useState(truck?.inspection_issue_date ?? "");
  const [insExp,    setInsExp]    = useState(truck?.inspection_expiration_date ?? "");
  const [iftaExp,   setIftaExp]   = useState(truck?.ifta_expiration_date ?? "");
  const [iftaEnf,   setIftaEnf]   = useState(truck?.ifta_enforcement_date ?? "");
  const [phmsaExp,  setPhmsaExp]  = useState(truck?.phmsa_expiration_date ?? "");
  const [alliExp,   setAlliExp]   = useState(truck?.alliance_expiration_date ?? "");
  const [fleetExp,  setFleetExp]  = useState(truck?.fleet_ins_expiration_date ?? "");
  const [hazLicExp, setHazLicExp] = useState(truck?.hazmat_lic_expiration_date ?? "");
  const [ibExp,     setIbExp]     = useState(truck?.inner_bridge_expiration_date ?? "");
  const [notes,     setNotes]     = useState(truck?.notes ?? "");
  // Multiple other permits
  const [otherPermits, setOtherPermits] = useState<OtherPermit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!truck?.truck_id) return;
    supabase.from("truck_other_permits")
      .select("permit_id, label, expiration_date")
      .eq("truck_id", truck.truck_id)
      .order("created_at")
      .then(({ data }) => {
        if (data) setOtherPermits(data.map((r: any) => ({ permit_id: r.permit_id, label: r.label, expiration_date: r.expiration_date ?? "" })));
      });
  }, [truck?.truck_id]);

  async function save() {
    if (!name.trim()) { setErr("Truck name is required."); return; }
    if (!companyId || !String(companyId).trim()) {
      setErr("Missing company id (cannot save). Close and reopen Equipment Details, or ask your admin to assign you to a company.");
      return;
    }
    setSaving(true); setErr(null);
    const payload: any = {
      truck_name: name.trim(), vin_number: vin || null, plate_number: plate || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: local || null,
      status_code: status || null, status_location: statusLoc || null, active, company_id: companyId,
      reg_expiration_date: regExp || null, reg_enforcement_date: regEnf || null,
      inspection_shop: insShop || null, inspection_issue_date: insIssue || null, inspection_expiration_date: insExp || null,
      ifta_expiration_date: iftaExp || null, ifta_enforcement_date: iftaEnf || null,
      phmsa_expiration_date: phmsaExp || null, alliance_expiration_date: alliExp || null,
      fleet_ins_expiration_date: fleetExp || null, hazmat_lic_expiration_date: hazLicExp || null,
      inner_bridge_expiration_date: ibExp || null, notes: notes || null,
    };
    let truckId = truck?.truck_id;
    if (isNew) {
      const { data, error } = await supabase.from("trucks").insert(payload).select("truck_id").single();
      if (error) { setErr(error.message); setSaving(false); return; }
      truckId = data.truck_id;
    } else {
      const { error } = await supabase.from("trucks").update(payload).eq("truck_id", truckId!);
      if (error) { setErr(error.message); setSaving(false); return; }
      await supabase.from("truck_other_permits").delete().eq("truck_id", truckId!);
    }
    const validOther = otherPermits.filter(p => p.label.trim());
    if (validOther.length > 0) {
      await supabase.from("truck_other_permits").insert(
        validOther.map(p => ({ truck_id: truckId, company_id: companyId, label: p.label.trim(), expiration_date: p.expiration_date || null }))
      );
    }
    onDone();
  }

  async function deleteTruck() {
    if (!confirm("Permanently delete this truck? This cannot be undone.")) return;
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc("delete_truck", {
        p_truck_id: truck!.truck_id,
        p_company_id: companyId,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed.");
      console.error("deleteTruck error:", e);
      setSaving(false);
    }
  }

  function addOtherPermit()    { setOtherPermits(p => [...p, { label: "", expiration_date: "" }]); }
  function removeOtherPermit(i: number) { setOtherPermits(p => p.filter((_, idx) => idx !== i)); }
  function updateOtherPermit(i: number, field: keyof OtherPermit, val: string) {
    setOtherPermits(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
  }

  // Shared condensed text input helper
  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {/* ── Identification ── */}
      <SubSectionTitle>Identification</SubSectionTitle>
      {/* Row 1: Unit · VIN · Plate */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Unit #</label>{ti(name, setName, "e.g. T-101")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Plate</label>{ti(plate, setPlate, "e.g. ABC1234")}</div>
      </div>
      {/* Row 2: Make · Model · Year */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Make</label>{ti(make, setMake, "e.g. Kenworth")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Model</label>{ti(model, setModel, "e.g. T680")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Year</label>{ti(year, setYear, "2022", "number")}</div>
      </div>
      {/* Row 3: Region · Local Area · Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Region</label>{ti(region, setRegion, "Southeast")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Local Area</label>{ti(local, setLocal, "Tampa Bay")}</div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, ...sm, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="AVAIL">AVAIL — Available</option>
            <option value="PARK">PARK — Parked</option>
            <option value="BOBTAIL">BOBTAIL — Bobtailing</option>
            <option value="MAINT">MAINT — Maintenance ⚠</option>
            <option value="INSP">INSP — Inspection</option>
            <option value="OOS">OOS — Out of Service ⚠</option>
          </select>
        </div>
      </div>
      {/* Row 4: Status Location — full width */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ ...css.label, fontSize: 10 }}>Status Location</label>
        {ti(statusLoc, setStatusLoc, "e.g. Yard 1")}
      </div>
      {/* Active note — inline with label, no checkbox in identification grid */}
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = unit appears in fleet lists and can be coupled.{" "}
        <strong style={{ color: T.text }}>Status</strong> = physical/operational state. A unit can be Active but Parked.
        The <em>Deactivate</em> button below hides this unit from the fleet without deleting it.
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <PermitEditRow label="Registration"              expVal={regExp}   onExpChange={setRegExp}   enfVal={regEnf}   onEnfChange={setRegEnf} />
      <PermitEditRow label="Annual Inspection"          expVal={insExp}   onExpChange={setInsExp}
        extra={
          <div style={{ display: "flex", gap: 6 }}>
            <input value={insShop} onChange={e => setInsShop(e.target.value)} placeholder="Inspection shop"
              style={{ ...css.input, ...sm, flex: 1 }} />
            <input type="date" value={insIssue} onChange={e => setInsIssue(e.target.value)}
              style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          </div>
        }
      />
      <PermitEditRow label="IFTA Permits + Decals"     expVal={iftaExp}  onExpChange={setIftaExp}  enfVal={iftaEnf}  onEnfChange={setIftaEnf} />
      <PermitEditRow label="PHMSA HazMat Permit"       expVal={phmsaExp} onExpChange={setPhmsaExp} />
      <PermitEditRow label="Alliance HazMat Permit"    expVal={alliExp}  onExpChange={setAlliExp} />
      <PermitEditRow label="Fleet Insurance Cab Card"  expVal={fleetExp} onExpChange={setFleetExp} />
      <PermitEditRow label="HazMat Transportation Lic" expVal={hazLicExp} onExpChange={setHazLicExp} />
      <PermitEditRow label="Inner Bridge Permit"       expVal={ibExp}    onExpChange={setIbExp} />

      <hr style={css.divider} />

      {/* ── Other Permits ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SubSectionTitle>Other Permits</SubSectionTitle>
        <button type="button" onClick={addOtherPermit} style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}>+ Add</button>
      </div>
      {otherPermits.length === 0 && (
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>None — click + Add for state permits, etc.</div>
      )}
      {otherPermits.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <input value={p.label} onChange={e => updateOtherPermit(i, "label", e.target.value)}
            placeholder="e.g. FL State Permit" style={{ ...css.input, ...sm, flex: 1 }} />
          <input type="date" value={p.expiration_date} onChange={e => updateOtherPermit(i, "expiration_date", e.target.value)}
            style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          <button type="button" onClick={() => removeOtherPermit(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px" }}>✕</button>
        </div>
      ))}

      <hr style={css.divider} />

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
        {!isNew && (
          <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTruck} disabled={saving}>Delete</button>
        )}
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
            color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
            onClick={() => setActive(v => !v)} disabled={saving}>
            {active ? "Deactivate" : "Reactivate"}
          </button>
        )}
        <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Truck" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Trailer Modal — CG Max removed (always 1), condensed permits
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// TankEditRow — tank inspection row with − on left, 📎 ☑ ▼ on right
// ─────────────────────────────────────────────────────────────

function TankEditRow({ label, dateVal, onDateChange, onRemove }: {
  label: string; dateVal: string; onDateChange: (v: string) => void; onRemove: () => void;
}) {
  const [dropOpen, setDropOpen] = useState(false);
  const [checked,  setChecked]  = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        {/* − delete button on LEFT */}
        <button type="button" onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
            fontSize: 16, padding: "0 2px", flexShrink: 0, lineHeight: 1,
            minWidth: 20, minHeight: 20, display: "flex", alignItems: "center", justifyContent: "center",
            WebkitTapHighlightColor: "transparent" }}>−</button>
        {/* Label — tappable to expand notes */}
        <span
          style={{ fontSize: 11, color: T.muted, flex: 1, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer", userSelect: "none" as const }}
          onClick={() => setDropOpen(v => !v)}
        >{label}</span>
        <input type="date" value={dateVal} onChange={e => onDateChange(e.target.value)}
          style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
        {/* ☑ · ▼ on RIGHT */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 8,
              minWidth: 20, minHeight: 20, WebkitTapHighlightColor: "transparent",
              transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setDropOpen(v => !v)}>▼</button>
        </div>
      </div>
      {dropOpen && (
        <div style={{ paddingLeft: 26, paddingTop: 4 }}>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Notes…" rows={2}
            style={{ ...css.input, width: "100%", fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

function TrailerModal({ trailer, companyId, onClose, onDone }: {
  trailer: Trailer | null; companyId: string; onClose: () => void; onDone: () => void;
}) {
  const isNew = !trailer;
  const [name,      setName]      = useState(trailer?.trailer_name ?? "");
  const [vin,       setVin]       = useState(trailer?.vin_number ?? "");
  const [plate,     setPlate]     = useState(trailer?.plate_number ?? "");
  const [make,      setMake]      = useState(trailer?.make ?? "");
  const [model,     setModel]     = useState(trailer?.model ?? "");
  const [year,      setYear]      = useState(String(trailer?.year ?? ""));
  const [region,    setRegion]    = useState(trailer?.region ?? "");
  const [local,     setLocal]     = useState(trailer?.local_area ?? "");
  const [status,    setStatus]    = useState(trailer?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(trailer?.status_location ?? "");
  const [active,    setActive]    = useState(trailer?.active ?? true);
  const [comps,     setComps]     = useState<Compartment[]>(trailer?.compartments ?? []);
  // Permit dates
  const [trRegExp,   setTrRegExp]   = useState(trailer?.trailer_reg_expiration_date ?? "");
  const [trRegEnf,   setTrRegEnf]   = useState(trailer?.trailer_reg_enforcement_date ?? "");
  const [trInsShop,  setTrInsShop]  = useState(trailer?.trailer_inspection_shop ?? "");
  const [trInsIssue, setTrInsIssue] = useState(trailer?.trailer_inspection_issue_date ?? "");
  const [trInsExp,   setTrInsExp]   = useState(trailer?.trailer_inspection_expiration_date ?? "");
  // Tank inspections — dynamic list seeded from saved dates
  type TankKey = "v" | "k" | "l" | "t" | "i" | "p" | "uc";
  const TANK_DEFS: { key: TankKey; label: string }[] = [
    { key: "v",  label: "V — External Visual (Annual)" },
    { key: "k",  label: "K — Leakage Test (Annual)" },
    { key: "l",  label: "L — Lining Inspection (Annual)" },
    { key: "t",  label: "T — Thickness Test (2yr)" },
    { key: "i",  label: "I — Internal Visual (5yr)" },
    { key: "p",  label: "P — Pressure Test (5yr)" },
    { key: "uc", label: "UC — Upper Coupler (5yr)" },
  ];
  const [tanks, setTanks] = useState<{ key: TankKey; date: string }[]>(() =>
    TANK_DEFS.filter(d => !!(trailer as any)?.[`tank_${d.key}_expiration_date`])
      .map(d => ({ key: d.key, date: (trailer as any)[`tank_${d.key}_expiration_date`] ?? "" }))
  );
  const [tankAddOpen, setTankAddOpen] = useState(false);
  const [notes,  setNotes]  = useState(trailer?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (!companyId || !String(companyId).trim()) {
      setErr("Missing company id (cannot save). Close and reopen Equipment Details, or ask your admin to assign you to a company.");
      return;
    }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) { setErr("All compartments need max gallons > 0."); return; }
    setSaving(true); setErr(null);
    const payload: any = {
      trailer_name: name.trim(), vin_number: vin || null, plate_number: plate || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: local || null,
      cg_max: 1.0, // always 1 per spec
      status_code: status || null, status_location: statusLoc || null, active, company_id: companyId,
      trailer_reg_expiration_date: trRegExp || null, trailer_reg_enforcement_date: trRegEnf || null,
      trailer_inspection_shop: trInsShop || null, trailer_inspection_issue_date: trInsIssue || null,
      trailer_inspection_expiration_date: trInsExp || null,
      tank_v_expiration_date:  tanks.find(t => t.key === "v")?.date  || null,
      tank_k_expiration_date:  tanks.find(t => t.key === "k")?.date  || null,
      tank_l_expiration_date:  tanks.find(t => t.key === "l")?.date  || null,
      tank_t_expiration_date:  tanks.find(t => t.key === "t")?.date  || null,
      tank_i_expiration_date:  tanks.find(t => t.key === "i")?.date  || null,
      tank_p_expiration_date:  tanks.find(t => t.key === "p")?.date  || null,
      tank_uc_expiration_date: tanks.find(t => t.key === "uc")?.date || null,
      notes: notes || null,
    };
    let trailerId = trailer?.trailer_id;
    if (isNew) {
      const { data, error } = await supabase.from("trailers").insert(payload).select("trailer_id").single();
      if (error) { setErr(error.message); setSaving(false); return; }
      trailerId = data.trailer_id;
    } else {
      const { error } = await supabase.from("trailers").update(payload).eq("trailer_id", trailerId!);
      if (error) { setErr(error.message); setSaving(false); return; }
      await supabase.from("trailer_compartments").delete().eq("trailer_id", trailerId!);
    }
    if (comps.length > 0) {
      const { error: compErr } = await supabase.from("trailer_compartments").insert(
        comps.map(c => ({ trailer_id: trailerId, comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position }))
      );
      if (compErr) { setErr(compErr.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteTrailer() {
    if (!confirm("Permanently delete this trailer? This cannot be undone.")) return;
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc("delete_trailer", {
        p_trailer_id: trailer!.trailer_id,
        p_company_id: companyId,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed.");
      console.error("deleteTrailer error:", e);
      setSaving(false);
    }
  }

  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {/* ── Identification ── */}
      <SubSectionTitle>Identification</SubSectionTitle>
      {/* Row 1: Unit · VIN · Plate */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Unit #</label>{ti(name, setName, "e.g. 3151")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Plate</label>{ti(plate, setPlate, "e.g. ABC1234")}</div>
      </div>
      {/* Row 2: Make · Model · Year */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Make</label>{ti(make, setMake, "e.g. Polar")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Model</label>{ti(model, setModel, "e.g. Tank")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Year</label>{ti(year, setYear, "2020", "number")}</div>
      </div>
      {/* Row 3: Region · Local Area · Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Region</label>{ti(region, setRegion, "Southeast")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Local Area</label>{ti(local, setLocal, "Tampa Bay")}</div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, ...sm, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="AVAIL">AVAIL — Available</option>
            <option value="PARK">PARK — Parked / Stored</option>
            <option value="LOAD">LOAD — Loaded / Staged</option>
            <option value="CLEAN">CLEAN — Cleaning / Purge</option>
            <option value="MAINT">MAINT — Maintenance ⚠</option>
            <option value="INSP">INSP — Inspection</option>
            <option value="OOS">OOS — Out of Service ⚠</option>
          </select>
        </div>
      </div>
      {/* Row 4: Status Location — full width */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ ...css.label, fontSize: 10 }}>Status Location</label>
        {ti(statusLoc, setStatusLoc, "e.g. Yard 1")}
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = unit appears in fleet lists and can be coupled.{" "}
        <strong style={{ color: T.text }}>Status</strong> = physical/operational state. A unit can be Active but Parked.
        The <em>Deactivate</em> button below hides this unit from the fleet without deleting it.
      </div>

      <hr style={css.divider} />

      {/* ── Compartments ── */}
      <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
        <CompartmentEditor comps={comps} onChange={setComps} />
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <PermitEditRow label="Trailer Registration" expVal={trRegExp} onExpChange={setTrRegExp} enfVal={trRegEnf} onEnfChange={setTrRegEnf} />
      <PermitEditRow label="Annual Inspection"    expVal={trInsExp} onExpChange={setTrInsExp}
        extra={
          <div style={{ display: "flex", gap: 6 }}>
            <input value={trInsShop} onChange={e => setTrInsShop(e.target.value)} placeholder="Inspection shop"
              style={{ ...css.input, ...sm, flex: 1 }} />
            <input type="date" value={trInsIssue} onChange={e => setTrInsIssue(e.target.value)}
              style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          </div>
        }
      />

      <hr style={css.divider} />

      {/* ── Tank Inspections — dynamic ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SubSectionTitle>Tank Inspections</SubSectionTitle>
        <div style={{ position: "relative" as const }}>
          <button type="button" onClick={() => setTankAddOpen(v => !v)}
            style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}>+ Add</button>
          {tankAddOpen && (() => {
            const addedKeys = new Set(tanks.map(t => t.key));
            const available = TANK_DEFS.filter(d => !addedKeys.has(d.key));
            return available.length === 0 ? null : (
              <div style={{ position: "absolute" as const, right: 0, top: "110%", zIndex: 50,
                background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                {available.map(d => (
                  <div key={d.key}
                    onClick={() => { setTanks(prev => [...prev, { key: d.key, date: "" }]); setTankAddOpen(false); }}
                    style={{ padding: "8px 14px", fontSize: 12, cursor: "pointer", color: T.text,
                      borderBottom: `1px solid ${T.border}22` }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.surface3)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    {d.label}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
      {tanks.length === 0 && <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>No tank inspections added yet.</div>}
      {tanks.map((tank) => {
        const def = TANK_DEFS.find(d => d.key === tank.key)!;
        return (
          <TankEditRow
            key={tank.key}
            label={def.label}
            dateVal={tank.date}
            onDateChange={v => setTanks(prev => prev.map(t => t.key === tank.key ? { ...t, date: v } : t))}
            onRemove={() => setTanks(prev => prev.filter(t => t.key !== tank.key))}
          />
        );
      })}

      <hr style={css.divider} />

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
        {!isNew && (
          <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTrailer} disabled={saving}>Delete</button>
        )}
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
            color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
            onClick={() => setActive(v => !v)} disabled={saving}>
            {active ? "Deactivate" : "Reactivate"}
          </button>
        )}
        <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Trailer" : "Save"}</button>
      </div>
    </Modal>
  );
}

export type { Truck, Trailer, OtherPermit, Compartment };
export { TruckCard, TrailerCard, TruckModal, TrailerModal };

