"use client";
// modals/RecordHistoryModal.tsx
//
// Service/Wash history view -- equipment-settings-spec.md §5. Tapping the
// "Service" or "Washed on" report line on the main Equipment modal opens
// this (a full chronological list), not the record-creation modal directly.
//
// Modeled on MyLoadsModal's pattern (search, date-range chips, share via
// copy/text/email, expandable rows).
//
// Records are grouped rather than shown as flat individual rows: a service
// done on both truck and trailer at once (same date + type) collapses into
// one row tagged "Both" instead of two separate Truck/Trailer rows: a wash
// done on both units on the same calendar day likewise collapses into one
// date-group with a line per unit. Selecting the "All" date range also
// broadens scope to every truck/trailer in the company, not just the
// currently selected pair -- driven by trucks/trailers already loaded by
// the parent (no extra fetch needed for name resolution).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";

export type RecordHistoryKind = "service" | "wash";

type ServiceRecordRaw = {
  service_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  service_type_id: string;
  date: string;
  shop_name: string | null;
  location: string | null;
  reading_value: number | null;
  notes: string | null;
};
type WashRecordRaw = {
  wash_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  location: string | null;
  washed_at: string;
  notes: string | null;
};
type ServiceTypeRaw = { service_type_id: string; name: string; interval_kind: string; interval_value: number | null };

type UnitRef = { id: string; label: "Truck" | "Trailer"; name: string };

type ServiceGroupEntry = { unit: UnitRef; dueDisplay: string; shopLocation: string; notes: string | null };
type ServiceGroupRow = { id: string; date: string; typeName: string; entries: ServiceGroupEntry[] };

type WashGroupEntry = { unit: UnitRef; location: string | null; notes: string | null };
type WashGroupRow = { id: string; date: string; entries: WashGroupEntry[] };

const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  return `${mo}/${dy}/${yr}`;
}

function computeRecordDue(record: { date: string; reading_value: number | null }, type: ServiceTypeRaw | undefined, isTrailer: boolean): string {
  // Trailers don't track mileage/hours -- a miles/hours-type record on a
  // trailer only exists because it tagged along on a "Both" service with
  // the truck (see SimpleServiceModal.save()), so there's no due-at
  // calculation to show here either.
  if (isTrailer && type && (type.interval_kind === "miles" || type.interval_kind === "hours")) {
    return `${type.name} (with Truck) · ${fmtDate(record.date)}`;
  }
  if (!type || type.interval_kind === "none" || type.interval_value == null) {
    return `Serviced ${fmtDate(record.date)}`;
  }
  if (type.interval_kind === "duration") {
    const due = new Date(record.date);
    due.setDate(due.getDate() + type.interval_value);
    return `Serviced ${fmtDate(record.date)} · next due ${fmtDate(due.toISOString())}`;
  }
  if (record.reading_value == null) {
    return `Serviced ${fmtDate(record.date)} (reading not recorded)`;
  }
  const unitWord = type.interval_kind === "miles" ? "mi" : "hrs";
  const next = record.reading_value + type.interval_value;
  return `${record.reading_value.toLocaleString()} ${unitWord} · next due ${next.toLocaleString()} ${unitWord}`;
}

function buildShareText(kind: RecordHistoryKind, serviceRows: ServiceGroupRow[], washRows: WashGroupRow[], title: string): string {
  const divider = "─".repeat(40);
  const lines: string[] = [title.toUpperCase(), divider];

  if (kind === "service") {
    for (const row of serviceRows) {
      const unitTag = row.entries.length > 1 ? "Both" : row.entries[0].unit.label;
      lines.push(`${fmtDate(row.date)}  (${unitTag})  ${row.typeName}`);
      for (const e of row.entries) {
        lines.push(`  ${e.unit.name}: ${e.dueDisplay}${e.shopLocation ? `  ·  ${e.shopLocation}` : ""}`);
        if (e.notes) lines.push(`    ${e.notes}`);
      }
    }
  } else {
    for (const row of washRows) {
      lines.push(fmtDate(row.date));
      for (const e of row.entries) {
        lines.push(`  ${e.unit.label} ${e.unit.name}${e.location ? `  ·  ${e.location}` : ""}`);
        if (e.notes) lines.push(`    ${e.notes}`);
      }
    }
  }
  return lines.join("\n");
}

function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}
function shareViaSMS(text: string) {
  window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
}
function shareViaEmail(subject: string, text: string) {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  kind: RecordHistoryKind;
  title: string;
  companyId: string;
  truckId: string | null;
  trailerId: string | null;
  trucks: { truck_id: string; truck_name: string }[];
  trailers: { trailer_id: string; trailer_name: string }[];
};

export default function RecordHistoryModal({ open, onClose, kind, title, companyId, truckId, trailerId, trucks, trailers }: Props) {
  const [search, setSearch] = useState("");
  const [activeDays, setActiveDays] = useState<number | null>(90);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceRows, setServiceRows] = useState<ServiceGroupRow[]>([]);
  const [washRows, setWashRows] = useState<WashGroupRow[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const truckName = (id: string) => trucks.find((t) => t.truck_id === id)?.truck_name ?? "Truck";
  const trailerName = (id: string) => trailers.find((t) => t.trailer_id === id)?.trailer_name ?? "Trailer";

  // Selecting "All" (date range) also broadens scope to every truck/trailer
  // in the company, not just the currently selected pair.
  const allEquipment = activeDays === null;

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 180);

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (kind === "service") {
          let records: ServiceRecordRaw[];
          const cols = "service_record_id, truck_id, trailer_id, service_type_id, date, shop_name, location, reading_value, notes";
          if (allEquipment) {
            const { data, error: e } = await supabase.from("service_records").select(cols).eq("company_id", companyId);
            if (e) throw e;
            records = (data ?? []) as ServiceRecordRaw[];
          } else {
            const [{ data: t, error: e1 }, { data: tr, error: e2 }] = await Promise.all([
              truckId ? supabase.from("service_records").select(cols).eq("truck_id", truckId) : Promise.resolve({ data: [] as ServiceRecordRaw[], error: null }),
              trailerId ? supabase.from("service_records").select(cols).eq("trailer_id", trailerId) : Promise.resolve({ data: [] as ServiceRecordRaw[], error: null }),
            ]);
            if (e1) throw e1;
            if (e2) throw e2;
            records = [...((t ?? []) as ServiceRecordRaw[]), ...((tr ?? []) as ServiceRecordRaw[])];
          }

          const typeIds = Array.from(new Set(records.map((r) => r.service_type_id)));
          let types: ServiceTypeRaw[] = [];
          if (typeIds.length) {
            const { data } = await supabase.from("service_types").select("service_type_id, name, interval_kind, interval_value").in("service_type_id", typeIds);
            types = (data ?? []) as ServiceTypeRaw[];
          }
          const typeById = new Map(types.map((t) => [t.service_type_id, t]));

          const groups = new Map<string, ServiceRecordRaw[]>();
          for (const r of records) {
            const key = `${r.date}|${r.service_type_id}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(r);
          }

          const rows: ServiceGroupRow[] = Array.from(groups.entries()).map(([key, recs]) => {
            const type = typeById.get(recs[0].service_type_id);
            const entries: ServiceGroupEntry[] = recs.map((r) => {
              const unit: UnitRef = r.truck_id
                ? { id: r.truck_id, label: "Truck", name: truckName(r.truck_id) }
                : { id: r.trailer_id!, label: "Trailer", name: trailerName(r.trailer_id!) };
              return {
                unit,
                dueDisplay: computeRecordDue(r, type, unit.label === "Trailer"),
                shopLocation: [r.shop_name, r.location].filter(Boolean).join(" · "),
                notes: r.notes,
              };
            });
            return { id: key, date: recs[0].date, typeName: type?.name ?? "Service", entries };
          }).sort((a, b) => (a.date < b.date ? 1 : -1));

          setServiceRows(rows);
        } else {
          let records: WashRecordRaw[];
          const cols = "wash_record_id, truck_id, trailer_id, location, washed_at, notes";
          if (allEquipment) {
            const { data, error: e } = await supabase.from("wash_records").select(cols).eq("company_id", companyId);
            if (e) throw e;
            records = (data ?? []) as WashRecordRaw[];
          } else {
            const [{ data: t, error: e1 }, { data: tr, error: e2 }] = await Promise.all([
              truckId ? supabase.from("wash_records").select(cols).eq("truck_id", truckId) : Promise.resolve({ data: [] as WashRecordRaw[], error: null }),
              trailerId ? supabase.from("wash_records").select(cols).eq("trailer_id", trailerId) : Promise.resolve({ data: [] as WashRecordRaw[], error: null }),
            ]);
            if (e1) throw e1;
            if (e2) throw e2;
            records = [...((t ?? []) as WashRecordRaw[]), ...((tr ?? []) as WashRecordRaw[])];
          }

          const groups = new Map<string, WashRecordRaw[]>();
          for (const r of records) {
            const day = r.washed_at.slice(0, 10);
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day)!.push(r);
          }

          const rows: WashGroupRow[] = Array.from(groups.entries()).map(([day, recs]) => ({
            id: day,
            date: recs[0].washed_at,
            entries: recs.map((r) => {
              const unit: UnitRef = r.truck_id
                ? { id: r.truck_id, label: "Truck", name: truckName(r.truck_id) }
                : { id: r.trailer_id!, label: "Trailer", name: trailerName(r.trailer_id!) };
              return { unit, location: r.location, notes: r.notes };
            }),
          })).sort((a, b) => (a.date < b.date ? 1 : -1));

          setWashRows(rows);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load history.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, truckId, trailerId, companyId, allEquipment]);

  const filteredService = useMemo(() => {
    let list = serviceRows;
    if (activeDays != null) {
      const cutoff = Date.now() - activeDays * 86400000;
      list = list.filter((r) => new Date(r.date).getTime() >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      r.typeName.toLowerCase().includes(q) ||
      r.entries.some((e) => e.unit.name.toLowerCase().includes(q) || e.shopLocation.toLowerCase().includes(q))
    );
  }, [serviceRows, activeDays, search]);

  const filteredWash = useMemo(() => {
    let list = washRows;
    if (activeDays != null) {
      const cutoff = Date.now() - activeDays * 86400000;
      list = list.filter((r) => new Date(r.date).getTime() >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      r.entries.some((e) => e.unit.name.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q))
    );
  }, [washRows, activeDays, search]);

  const totalCount = kind === "service" ? filteredService.length : filteredWash.length;
  const hasAny = totalCount > 0;

  function handleCopy() {
    shareViaClipboard(buildShareText(kind, filteredService, filteredWash, title), () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }
  function handleSMS() { shareViaSMS(buildShareText(kind, filteredService, filteredWash, title)); }
  function handleEmail() { shareViaEmail(title, buildShareText(kind, filteredService, filteredWash, title)); }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>{title}</div>
            {!loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{totalCount}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === "service" ? "Search type, shop, or location…" : "Search unit or location…"}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        {/* Date-range chips and share controls each get their own row so
            neither crowds the other off narrow screens (Email was getting
            cut off when they shared one row). */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 18px 8px", flexWrap: "nowrap", overflowX: "auto" }}>
          {DATE_RANGES.map(({ label, days }) => {
            const active = activeDays === days;
            return (
              <button
                key={label}
                onClick={() => setActiveDays(days)}
                title={days === null ? "All dates, all equipment" : undefined}
                style={{
                  padding: "5px 10px", borderRadius: 7, border: "1px solid", fontSize: 11, fontWeight: 800,
                  cursor: "pointer", letterSpacing: 0.3, transition: "all 120ms ease", flexShrink: 0,
                  background: active ? "rgba(255,255,255,0.10)" : "transparent",
                  borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, padding: "0 18px 12px" }}>
          {(["copy", "text", "email"] as const).map((type) => {
            const label = type === "copy" ? (copied ? "✓ Copied" : "Copy") : type === "text" ? "Text" : "Email";
            return (
              <button
                key={type}
                disabled={!hasAny}
                onClick={type === "copy" ? handleCopy : type === "text" ? handleSMS : handleEmail}
                style={{
                  flex: 1, padding: "7px 9px", borderRadius: 7, fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
                  cursor: hasAny ? "pointer" : "default", transition: "all 150ms ease", textAlign: "center" as const,
                  border: hasAny ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                  background: hasAny ? "rgba(255,255,255,0.07)" : "transparent",
                  color: hasAny ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && <div style={{ padding: "24px 18px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</div>}
          {!loading && error && <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>}
          {!loading && !error && !hasAny && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No records match your search" : activeDays ? `No records in the last ${activeDays} days` : "No records yet"}
            </div>
          )}

          {!loading && !error && kind === "service" && filteredService.map((row) => {
            const bothTag = row.entries.length > 1;
            return (
              <div key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "11px 18px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontWeight: 500, whiteSpace: "nowrap" }}>{fmtDate(row.date)}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                    {bothTag ? "Both" : row.entries[0].unit.label}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{row.typeName}</div>
                </div>
                {row.entries.map((e, i) => (
                  <div key={i} style={{ paddingLeft: 4, marginTop: i > 0 ? 8 : 0 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                      <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 700 }}>{e.unit.name}</span>
                      {"  ·  "}{e.dueDisplay}
                    </div>
                    {e.shopLocation && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{e.shopLocation}</div>}
                    {e.notes && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2, fontStyle: "italic" }}>{e.notes}</div>}
                  </div>
                ))}
              </div>
            );
          })}

          {!loading && !error && kind === "wash" && filteredWash.map((row) => (
            <div key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "11px 18px 12px" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontWeight: 500, marginBottom: 6 }}>{fmtDate(row.date)}</div>
              {row.entries.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                    {e.unit.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{e.unit.name}</span>
                  {e.location && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>· {e.location}</span>}
                  {e.notes && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>· {e.notes}</span>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ height: 28 }} />
        </div>
      </div>
    </div>,
    document.body
  );
}
