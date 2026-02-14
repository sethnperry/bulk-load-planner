"use client";

import React from "react";

type PlanRow = {
  comp_number: number;
  max_gallons: number;
  planned_gallons?: number | null;
  lbsPerGal?: number | null;
  productId?: string | null;
};

type PlanSectionProps = {
  styles: any;

  planRows: PlanRow[];

  // Header numbers (you already compute these in page.tsx)
  targetGallonsRoundedText?: string;
  targetGallonsText?: string;
  plannedGallonsTotalText?: string;
  remainingGallonsText?: string;

  // Product names
  productNameById: Map<string, string>;

  // Load button
  onLoad: () => void;
  loadDisabled: boolean;
  loadLabel: string; // e.g. "Load", "Loading…", "Load started"
};

export default function PlanSection({
  styles,
  planRows,
  targetGallonsRoundedText,
  targetGallonsText,
  plannedGallonsTotalText,
  remainingGallonsText,
  productNameById,
  onLoad,
  loadDisabled,
  loadLabel,
}: PlanSectionProps) {
  return (
    <section style={styles.section}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0 }}>Plan</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={styles.badge}>
            {planRows.length === 0 ? "No plan yet" : `${planRows.length} rows`}
          </span>

          <button
            type="button"
            onClick={onLoad}
            disabled={loadDisabled}
            style={{
              ...(styles as any).button,
              padding: "10px 14px",
              opacity: loadDisabled ? 0.55 : 1,
            }}
          >
            {loadLabel}
          </button>
        </div>
      </div>

      <div style={styles.help}>
        Target: <strong>{targetGallonsRoundedText || targetGallonsText || ""}</strong> gal {" • "}
        Planned: <strong>{planRows.length ? plannedGallonsTotalText || "" : ""}</strong> gal {" • "}
        Remaining: <strong>{planRows.length ? remainingGallonsText || "" : ""}</strong> gal
      </div>

      {planRows.length === 0 ? (
        <div style={styles.help}>
          Select equipment + product, then choose “Fill to max” or enter a custom target.
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Comp #</th>
              <th style={styles.th}>Max Gallons</th>
              <th style={styles.th}>Planned Gallons</th>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>lbs/gal</th>
              <th style={styles.th}>Planned lbs</th>
            </tr>
          </thead>

          <tbody>
            {planRows.map((r: any) => {
              const g = Number(r.planned_gallons ?? 0);
              const lpg = Number(r.lbsPerGal ?? 0);
              const plannedLbs = g * lpg;

              return (
                <tr key={r.comp_number}>
                  <td style={styles.td}>{r.comp_number}</td>
                  <td style={styles.td}>{r.max_gallons}</td>
                  <td style={styles.td}>
                    <strong>{Number.isFinite(g) ? g.toFixed(0) : ""}</strong>
                  </td>
                  <td style={styles.td}>
                    {r.productId ? productNameById.get(r.productId) ?? r.productId : ""}
                  </td>
                  <td style={styles.td}>{lpg ? lpg.toFixed(4) : ""}</td>
                  <td style={styles.td}>{plannedLbs ? plannedLbs.toFixed(0) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
