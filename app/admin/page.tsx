"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import NavMenu from "@/lib/ui/NavMenu";

import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { TruckModal, TrailerModal } from "@/lib/ui/driver/EquipmentDetails";
import DecoupleModal from "@/app/calculator/modals/DecoupleModal";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Truck = {
  truck_id: string; truck_name: string; active: boolean;
  vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null;
  region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null;
  reg_expiration_date: string | null; reg_enforcement_date: string | null; reg_notes: string | null;
  inspection_shop: string | null; inspection_issue_date: string | null; inspection_expiration_date: string | null;
  inspection_enforcement_date: string | null; inspection_notes: string | null;
  ifta_expiration_date: string | null; ifta_enforcement_date: string | null; ifta_notes: string | null;
  phmsa_expiration_date: string | null; phmsa_enforcement_date: string | null; phmsa_notes: string | null;
  alliance_expiration_date: string | null; alliance_enforcement_date: string | null; alliance_notes: string | null;
  fleet_ins_expiration_date: string | null; fleet_ins_enforcement_date: string | null; fleet_ins_notes: string | null;
  hazmat_lic_expiration_date: string | null; hazmat_lic_enforcement_date: string | null; hazmat_lic_notes: string | null;
  inner_bridge_expiration_date: string | null; inner_bridge_enforcement_date: string | null; inner_bridge_notes: string | null;
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
  trailer_reg_expiration_date: string | null; trailer_reg_enforcement_date: string | null; trailer_reg_notes: string | null;
  trailer_inspection_shop: string | null; trailer_inspection_issue_date: string | null;
  trailer_inspection_expiration_date: string | null;
  trailer_inspection_enforcement_date: string | null; trailer_inspection_notes: string | null;
  tank_v_expiration_date: string | null; tank_k_expiration_date: string | null;
  tank_l_expiration_date: string | null; tank_t_expiration_date: string | null;
  tank_i_expiration_date: string | null; tank_p_expiration_date: string | null;
  tank_uc_expiration_date: string | null;
  tank_v_notes: string | null; tank_k_notes: string | null; tank_l_notes: string | null;
  tank_t_notes: string | null; tank_i_notes: string | null; tank_p_notes: string | null; tank_uc_notes: string | null;
  notes: string | null;
};

type Combo = {
  combo_id: string; combo_name: string; truck_id: string; trailer_id: string;
  tare_lbs: number; target_weight: number | null; active: boolean;
  claimed_by?: string | null;
  combo_status_code?: string | null; combo_status_location?: string | null;
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

function PermitRow({ label, date, enforcement, notes, extra }: {
  label: string; date: string | null; enforcement?: string | null; notes?: string | null; extra?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const days     = daysUntil(date);
  const color    = expiryColor(days);
  const enfDays  = enforcement ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);
  const hasExtra = !!(enforcement || notes || extra);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}12` }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26,
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
        {hasExtra && (
          <span style={{ color: T.muted, fontSize: 9, flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms", display: "inline-block" }}>▼</span>
        )}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 14, paddingBottom: 8, display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {enforcement && <div style={{ fontSize: 11, color: enfColor }}>Enforcement: {fmtExpiryInline(enforcement, enfDays)}</div>}
          {notes && <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" as const }}>{notes}</div>}
          {extra}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TruckCard — collapsed + expanded permit view
// ─────────────────────────────────────────────────────────────

function TruckCard({ truck, onEdit, otherPermits, coupledTo }: {
  truck: Truck; onEdit: () => void; otherPermits?: OtherPermit[]; coupledTo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isCoupled = truck.status_code === "COUPLED";
  const statusColor = truck.status_code === "OOS" || truck.status_code === "MAINT" ? T.danger
    : truck.status_code === "AVAIL" ? T.success
    : isCoupled ? T.info : T.muted;

  const allDates = [
    truck.reg_expiration_date, truck.inspection_expiration_date,
    truck.ifta_expiration_date, truck.phmsa_expiration_date,
    truck.alliance_expiration_date, truck.fleet_ins_expiration_date,
    truck.hazmat_lic_expiration_date, truck.inner_bridge_expiration_date,
    ...(otherPermits ?? []).map(p => p.expiration_date || null),
  ].filter(Boolean) as string[];
  const soonestDays = allDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d); if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const warnBadge  = soonestDays != null && soonestDays <= 30;
  const badgeColor = expiryColor(soonestDays);

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(v => !v)} style={{ padding: "12px 12px 10px", cursor: "pointer", userSelect: "none" as const }}>
        {/* Row 1: name + status badge LEFT, Edit RIGHT */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{truck.truck_name}</span>
            {truck.status_code && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: isCoupled ? "rgba(91,168,245,0.15)" : statusColor === T.danger ? "rgba(220,60,40,0.18)" : statusColor === T.success ? "rgba(40,180,80,0.13)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5 }}>
                {truck.status_code}{isCoupled && coupledTo ? ` · ${coupledTo}` : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
        </div>
        {/* Row 2: expiry badge */}
        {warnBadge && (
          <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 900,
            padding: "2px 6px", borderRadius: 4, background: "rgba(220,60,40,0.15)",
            color: badgeColor, letterSpacing: 0.3 }}>
            ⚠ {soonestDays! < 0 ? "EXPIRED" : soonestDays === 0 ? "EXP TODAY" : `EXP ${soonestDays}d`}
          </span>
        )}
        {/* Row 3: region · local area */}
        {(truck.region || truck.local_area) && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            {[truck.region, truck.local_area].filter(Boolean).join(" · ")}
          </div>
        )}
        {/* Row 4: status location */}
        {truck.status_location && !isCoupled && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1,
            whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
            📍 {truck.status_location}
          </div>
        )}
        {/* in use by */}
        {truck.in_use_by_name && (
          <div style={{ fontSize: 11, color: T.accent, marginTop: 1 }}>In use · {truck.in_use_by_name}</div>
        )}
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {/* Ident */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 1, marginBottom: 8 }}>
            {(truck.year || truck.make || truck.model) ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Vehicle</span>
              <span style={{ fontSize: 11, color: T.text }}>{[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}</span>
            </> : null}
            {truck.vin_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>VIN</span>
              <span style={{ fontSize: 11, color: T.text, wordBreak: "break-all" as const }}>{truck.vin_number}</span>
            </> : null}
            {truck.plate_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Plate</span>
              <span style={{ fontSize: 11, color: T.text }}>{truck.plate_number}</span>
            </> : null}
          </div>
          {/* Notes */}
          {truck.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {truck.notes}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${T.border}22`, marginBottom: 4 }} />
          <PermitRow label="Registration" date={truck.reg_expiration_date} enforcement={truck.reg_enforcement_date} notes={truck.reg_notes} />
          <PermitRow label="Annual Inspection" date={truck.inspection_expiration_date} extra={
            (truck.inspection_shop || truck.inspection_issue_date) ? (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
                {[truck.inspection_shop, truck.inspection_issue_date && `Issued ${fmtDate(truck.inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null
          } />
          <PermitRow label="IFTA Permit + Decals" date={truck.ifta_expiration_date} enforcement={truck.ifta_enforcement_date} notes={truck.ifta_notes} />
          <PermitRow label="PHMSA HazMat Permit" date={truck.phmsa_expiration_date} />
          <PermitRow label="Alliance Uniform HazMat Permit" date={truck.alliance_expiration_date} />
          <PermitRow label="Fleet Insurance Cab Card" date={truck.fleet_ins_expiration_date} />
          <PermitRow label="HazMat Transportation License" date={truck.hazmat_lic_expiration_date} />
          <PermitRow label="Inner Bridge Permit" date={truck.inner_bridge_expiration_date} />
          {(otherPermits ?? []).map((p, i) => (
            <PermitRow key={i} label={p.label || "Other Permit"} date={p.expiration_date || null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TrailerCard — collapsed + expanded
// ─────────────────────────────────────────────────────────────

function TrailerCard({ trailer, onEdit, coupledTo }: {
  trailer: Trailer; onEdit: () => void; coupledTo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const comps = trailer.compartments ?? [];
  const totalGal = comps.reduce((s, c) => s + c.max_gallons, 0);
  const compSummary = comps.length > 0
    ? `${comps.length} comps · ${comps.map(c => c.max_gallons.toLocaleString()).join("/")} = ${totalGal.toLocaleString()} gal`
    : null;
  const isCoupled = trailer.status_code === "COUPLED";
  const statusColor = trailer.status_code === "OOS" || trailer.status_code === "MAINT" ? T.danger
    : trailer.status_code === "AVAIL" ? T.success
    : isCoupled ? T.info : T.muted;

  const trailerAllDates = [
    trailer.trailer_reg_expiration_date, trailer.trailer_inspection_expiration_date,
    trailer.tank_v_expiration_date, trailer.tank_k_expiration_date,
    trailer.tank_l_expiration_date, trailer.tank_t_expiration_date,
    trailer.tank_i_expiration_date, trailer.tank_p_expiration_date,
    trailer.tank_uc_expiration_date,
  ].filter(Boolean) as string[];
  const trailerSoonestDays = trailerAllDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d); if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const trailerWarnBadge  = trailerSoonestDays != null && trailerSoonestDays <= 30;
  const trailerBadgeColor = expiryColor(trailerSoonestDays);

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(v => !v)} style={{ padding: "12px 12px 10px", cursor: "pointer", userSelect: "none" as const }}>
        {/* Row 1: name + status badge LEFT, Edit RIGHT */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{trailer.trailer_name}</span>
            {trailer.status_code && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: isCoupled ? "rgba(91,168,245,0.15)" : statusColor === T.danger ? "rgba(220,60,40,0.18)" : statusColor === T.success ? "rgba(40,180,80,0.13)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5 }}>
                {trailer.status_code}{isCoupled && coupledTo ? ` · ${coupledTo}` : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
        </div>
        {/* Row 2: expiry badge */}
        {trailerWarnBadge && (
          <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 900,
            padding: "2px 6px", borderRadius: 4, background: "rgba(220,60,40,0.15)",
            color: trailerBadgeColor, letterSpacing: 0.3 }}>
            ⚠ {trailerSoonestDays! < 0 ? "EXPIRED" : trailerSoonestDays === 0 ? "EXP TODAY" : `EXP ${trailerSoonestDays}d`}
          </span>
        )}
        {/* Row 3: region · local area */}
        {(trailer.region || trailer.local_area) && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            {[trailer.region, trailer.local_area].filter(Boolean).join(" · ")}
          </div>
        )}
        {/* Row 4: status location */}
        {trailer.status_location && !isCoupled && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1,
            whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
            📍 {trailer.status_location}
          </div>
        )}
        {trailer.in_use_by_name && (
          <div style={{ fontSize: 11, color: T.accent, marginTop: 1 }}>In use · {trailer.in_use_by_name}</div>
        )}
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {/* Ident */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 1, marginBottom: 8 }}>
            {(trailer.year || trailer.make || trailer.model) ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Vehicle</span>
              <span style={{ fontSize: 11, color: T.text }}>{[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}</span>
            </> : null}
            {trailer.vin_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>VIN</span>
              <span style={{ fontSize: 11, color: T.text, wordBreak: "break-all" as const }}>{trailer.vin_number}</span>
            </> : null}
            {trailer.plate_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Plate</span>
              <span style={{ fontSize: 11, color: T.text }}>{trailer.plate_number}</span>
            </> : null}
            {compSummary ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Compartments</span>
              <span style={{ fontSize: 11, color: T.text }}>{compSummary}</span>
            </> : null}
            {trailer.last_load_config ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Last Residue</span>
              <span style={{ fontSize: 11, color: T.text }}>{trailer.last_load_config}</span>
            </> : null}
          </div>
          {/* Notes */}
          {trailer.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {trailer.notes}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${T.border}22`, marginBottom: 4 }} />
          <PermitRow label="Trailer Registration" date={trailer.trailer_reg_expiration_date} enforcement={trailer.trailer_reg_enforcement_date} notes={trailer.trailer_reg_notes} />
          <PermitRow label="Annual Inspection" date={trailer.trailer_inspection_expiration_date} notes={trailer.trailer_inspection_notes} extra={
            (trailer.trailer_inspection_shop || trailer.trailer_inspection_issue_date) ? (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
                {[trailer.trailer_inspection_shop, trailer.trailer_inspection_issue_date && `Issued ${fmtDate(trailer.trailer_inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null
          } />
          {[
            { label: "V — Annual External Visual",  date: trailer.tank_v_expiration_date },
            { label: "K — Annual Leakage Test",     date: trailer.tank_k_expiration_date },
            { label: "L — Annual Lining Inspection",date: trailer.tank_l_expiration_date },
            { label: "T — 2 Year Thickness Test",   date: trailer.tank_t_expiration_date },
            { label: "I — 5 Year Internal Visual",  date: trailer.tank_i_expiration_date },
            { label: "P — 5 Year Pressure Test",    date: trailer.tank_p_expiration_date },
            { label: "UC — 5 Year Upper Coupler",   date: trailer.tank_uc_expiration_date },
          ].filter(r => !!r.date).map(r => (
            <PermitRow key={r.label} label={r.label} date={r.date} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ComboCard
// ─────────────────────────────────────────────────────────────

function ComboCard({ combo, onEdit }: { combo: Combo; onEdit: () => void }) {
  const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
  const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;
  const sc = combo.combo_status_code;
  const statusColor = sc === "OOS" || sc === "MAINT" ? T.danger : sc === "AVAIL" ? T.success : T.muted;
  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{truckName || "—"} / {trailerName || "—"}</span>
            {sc && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: statusColor === T.danger ? "rgba(220,60,40,0.18)" : statusColor === T.success ? "rgba(40,180,80,0.13)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5 }}>{sc}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            Tare {combo.tare_lbs?.toLocaleString() ?? "—"} lbs
            {combo.target_weight ? ` · Target ${combo.target_weight.toLocaleString()} lbs` : ""}
            {combo.in_use_by_name ? ` · In use: ${combo.in_use_by_name}` : ""}
          </div>
          {combo.combo_status_location && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1,
              whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
              📍 {combo.combo_status_location}
            </div>
          )}
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
// Trailer Modal — CG Max removed (always 1), condensed permits
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Combo Modal — equal-width buttons, even spacing
// ─────────────────────────────────────────────────────────────

function ComboModal({ combo, companyId, trucks, trailers, onClose, onDone, onDecouple }: {
  combo: Combo | null; companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void; onDecouple?: () => void;
}) {
  const isNew = !combo;
  // For new combos only: truck/trailer selection state
  const [newTruckId,   setNewTruckId]   = useState(trucks[0]?.truck_id ?? "");
  const [newTrailerId, setNewTrailerId] = useState(trailers[0]?.trailer_id ?? "");
  const truckId   = isNew ? newTruckId   : (combo?.truck_id   ?? "");
  const trailerId = isNew ? newTrailerId : (combo?.trailer_id ?? "");

  const [tareLbs,   setTareLbs]   = useState(String(combo?.tare_lbs ?? ""));
  const [target,    setTarget]    = useState(String(combo?.target_weight ?? "80000"));
  // Derive initial status from the truck (both should match when COUPLED)
  const [comboStatus,    setComboStatus]    = useState(combo?.combo_status_code ?? "AVAIL");
  const [comboStatusLoc, setComboStatusLoc] = useState(combo?.combo_status_location ?? "");
  const [err,     setErr]     = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  // Resolve display names from props
  const truckName   = trucks.find(t => t.truck_id === truckId)?.truck_name
    ?? (Array.isArray(combo?.truck)   ? combo?.truck[0]?.truck_name   : combo?.truck?.truck_name)
    ?? truckId;
  const trailerName = trailers.find(t => t.trailer_id === trailerId)?.trailer_name
    ?? (Array.isArray(combo?.trailer) ? combo?.trailer[0]?.trailer_name : combo?.trailer?.trailer_name)
    ?? trailerId;

  async function save() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true); setErr(null);
    if (isNew) {
      const { data: coupleData, error } = await supabase.rpc("couple_combo", { p_truck_id: truckId, p_trailer_id: trailerId, p_tare_lbs: parseFloat(tareLbs), p_target_weight: parseFloat(target) || 80000 });
      if (error) { setErr(error.message); setSaving(false); return; }
      await Promise.all([
        supabase.from("trucks").update({ status_code: "COUPLED", status_location: null }).eq("truck_id", truckId),
        supabase.from("trailers").update({ status_code: "COUPLED", status_location: null }).eq("trailer_id", trailerId),
        supabase.from("equipment_combos").update({ combo_status_code: "AVAIL" }).eq("truck_id", truckId).eq("trailer_id", trailerId).eq("active", true),
      ]);
    } else {
      const { error } = await supabase.from("equipment_combos").update({
        tare_lbs: parseFloat(tareLbs), target_weight: parseFloat(target) || null,
        combo_status_code: comboStatus || null, combo_status_location: comboStatusLoc || null,
      }).eq("combo_id", combo!.combo_id);
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

      {/* ── Combo header — names read-only for existing, dropdowns for new ── */}
      {isNew ? (
        <>
          <Field label="Truck">
            <select value={newTruckId} onChange={e => setNewTruckId(e.target.value)} style={{ ...css.select, width: "100%" }}>
              {trucks.length === 0 && <option value="">No active trucks</option>}
              {trucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_name}</option>)}
            </select>
          </Field>
          <Field label="Trailer">
            <select value={newTrailerId} onChange={e => setNewTrailerId(e.target.value)} style={{ ...css.select, width: "100%" }}>
              {trailers.length === 0 && <option value="">No active trailers</option>}
              {trailers.map(t => <option key={t.trailer_id} value={t.trailer_id}>{t.trailer_name}</option>)}
            </select>
          </Field>
        </>
      ) : (
        <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)", padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2, marginBottom: 2 }}>
            {truckName} / {trailerName}
          </div>
          <div style={{ fontSize: 11, color: T.muted }}>To change units, decouple and create a new combo.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Tare Weight (lbs)</label>
          <input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Target Gross (lbs)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 80000" style={css.input} />
        </div>
      </div>

      {!isNew && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={css.label}>Status</label>
            <select value={comboStatus} onChange={e => setComboStatus(e.target.value)} style={{ ...css.select, width: "100%", background: T.surface2, color: T.text }}>
              <option value="">— Select —</option>
              <option value="AVAIL">AVAIL — Available</option>
              <option value="PARK">PARK — Parked</option>
              <option value="MAINT">MAINT — Maintenance</option>
              <option value="INSP">INSP — Inspection</option>
              <option value="OOS">OOS — Out of Service</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={css.label}>Status Location</label>
            <input value={comboStatusLoc} onChange={e => setComboStatusLoc(e.target.value)}
              placeholder="e.g. Yard 1" style={css.input} />
          </div>
        </div>
      )}

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
    // Set COUPLED on both units — clear individual location (managed at combo level)
    await Promise.all([
      supabase.from("trucks").update({ status_code: "COUPLED", status_location: null }).eq("truck_id", truckId),
      supabase.from("trailers").update({ status_code: "COUPLED", status_location: null }).eq("trailer_id", trailerId),
    ]);
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
  const [decoupleOpen,  setDecoupleOpen]  = useState(false);
  const [decoupleComboPending, setDecoupleComboPending] = useState<{ combo: Combo } | null>(null);
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

      // Trucks + trailers — direct query so we get all fields including notes, reg_notes, etc.
      const truckFields = "truck_id, truck_name, active, vin_number, plate_number, make, model, year, region, local_area, status_code, status_location, in_use_by, reg_expiration_date, reg_enforcement_date, reg_notes, inspection_shop, inspection_issue_date, inspection_expiration_date, inspection_enforcement_date, inspection_notes, ifta_expiration_date, ifta_enforcement_date, ifta_notes, phmsa_expiration_date, phmsa_enforcement_date, phmsa_notes, alliance_expiration_date, alliance_enforcement_date, alliance_notes, fleet_ins_expiration_date, fleet_ins_enforcement_date, fleet_ins_notes, hazmat_lic_expiration_date, hazmat_lic_enforcement_date, hazmat_lic_notes, inner_bridge_expiration_date, inner_bridge_enforcement_date, inner_bridge_notes, notes";
      const trailerFields = "trailer_id, trailer_name, active, vin_number, plate_number, make, model, year, cg_max, region, local_area, status_code, status_location, in_use_by, last_load_config, trailer_reg_expiration_date, trailer_reg_enforcement_date, trailer_reg_notes, trailer_inspection_shop, trailer_inspection_issue_date, trailer_inspection_expiration_date, trailer_inspection_enforcement_date, trailer_inspection_notes, tank_v_expiration_date, tank_k_expiration_date, tank_l_expiration_date, tank_t_expiration_date, tank_i_expiration_date, tank_p_expiration_date, tank_uc_expiration_date, tank_v_notes, tank_k_notes, tank_l_notes, tank_t_notes, tank_i_notes, tank_p_notes, tank_uc_notes, notes";
      const [{ data: truckRowsRaw, error: truckErr }, { data: trailerRowsRaw, error: trailerErr }] = await Promise.all([
        supabase.from("trucks").select(truckFields).eq("company_id", cid).order("truck_name"),
        supabase.from("trailers").select(trailerFields).eq("company_id", cid).order("trailer_name"),
      ]);
      if (truckErr) throw truckErr;
      if (trailerErr) throw trailerErr;
      const truckRows   = truckRowsRaw   ?? [];
      const trailerRows = trailerRowsRaw ?? [];

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
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, combo_status_code, combo_status_location, truck:trucks(truck_name), trailer:trailers(trailer_name)")
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
    background: "none", border: "none", padding: "0 4px", fontSize: 24, lineHeight: "1",
    color: T.accent, cursor: "pointer", flexShrink: 0, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    WebkitTapHighlightColor: "transparent",
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
            {filteredTrucks.map(t => {
              const tCombo = combos.find(c => c.truck_id === t.truck_id);
              const coupledTo = tCombo ? (Array.isArray(tCombo.trailer) ? tCombo.trailer[0]?.trailer_name : tCombo.trailer?.trailer_name) ?? null : null;
              return <TruckCard key={t.truck_id} truck={t} onEdit={() => setTruckModal(t)} otherPermits={truckOtherPermits[t.truck_id]} coupledTo={coupledTo} />;
            })}
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
            {filteredTrailers.map(t => {
              const trCombo = combos.find(c => c.trailer_id === t.trailer_id);
              const coupledTo = trCombo ? (Array.isArray(trCombo.truck) ? trCombo.truck[0]?.truck_name : trCombo.truck?.truck_name) ?? null : null;
              return <TrailerCard key={t.trailer_id} trailer={t} onEdit={() => setTrailerModal(t)} coupledTo={coupledTo} />;
            })}
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
          onDecouple={() => {
            const combo = comboModal as Combo;
            const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
            const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;
            setDecoupleComboPending({ combo });
            setComboModal(null);
            setDecoupleOpen(true);
          }}
        />
      )}
      {decoupleComboPending && (() => {
        const { combo } = decoupleComboPending;
        const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
        const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;
        const coupledTruckIds   = new Set(combos.filter(c => c.active).map(c => c.truck_id));
        const coupledTrailerIds = new Set(combos.filter(c => c.active).map(c => c.trailer_id));
        return (
          <DecoupleModal
            open={decoupleOpen}
            onClose={() => { setDecoupleOpen(false); setDecoupleComboPending(null); }}
            comboId={String(combo.combo_id)}
            truckId={combo.truck_id}
            trailerId={combo.trailer_id}
            truckName={truckName ?? combo.truck_id}
            trailerName={trailerName ?? combo.trailer_id}
            companyId={companyId}
            uncoupledTrucks={trucks.filter(t => t.active && !coupledTruckIds.has(t.truck_id)).map(t => ({ id: t.truck_id, name: t.truck_name }))}
            uncoupledTrailers={trailers.filter(t => t.active && !coupledTrailerIds.has(t.trailer_id)).map(t => ({ id: t.trailer_id, name: t.trailer_name }))}
            onDecoupled={() => { setDecoupleOpen(false); setDecoupleComboPending(null); loadAll(); }}
          />
        );
      })()}

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
