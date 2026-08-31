"use client";
// app/planner/terminal/VolumeChart.tsx
//
// A grouped bar chart of gallons loaded per product, one cluster of bars
// per time bucket (day/week/month, adaptively chosen by the selected
// lookback range -- see page.tsx's own bucketLoads()). No chart library --
// plain divs sized by percentage of the chart's own max single-product
// value, matching this app's general "no chart library, hand-rolled"
// convention (report lines, wash lines, etc. are all plain divs too).
// Bars are colored via productColorFor() (diesel=yellow, premium=red,
// else white) -- the same palette the terminal outage banner's detail
// cards already use, so a product reads the same color everywhere in the
// app instead of a second invented palette.

import React from "react";
import { productColorFor } from "../utils/productColor";

export type VolumeBucket = {
  label: string;
  products: Record<string, number>; // product_id -> gallons
};

const CHART_HEIGHT = 150;

export default function VolumeChart({
  buckets, productOrder, productNameById,
}: {
  buckets: VolumeBucket[];
  productOrder: string[];
  productNameById: Record<string, string>;
}) {
  if (buckets.length === 0 || productOrder.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "32px 0" }}>
        No completed loads in this range yet.
      </div>
    );
  }

  const maxVal = Math.max(1, ...buckets.flatMap((b) => productOrder.map((pid) => b.products[pid] ?? 0)));
  const barWidth = productOrder.length <= 2 ? 10 : productOrder.length <= 4 ? 7 : 5;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: CHART_HEIGHT, overflowX: "auto", paddingBottom: 4 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, minWidth: 30 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: CHART_HEIGHT - 20 }}>
              {productOrder.map((pid) => {
                const val = b.products[pid] ?? 0;
                const h = Math.round((val / maxVal) * (CHART_HEIGHT - 20));
                return (
                  <div
                    key={pid}
                    title={`${productNameById[pid] ?? pid}: ${Math.round(val).toLocaleString()} gal`}
                    style={{
                      width: barWidth, height: val > 0 ? Math.max(h, 2) : 0, borderRadius: 2,
                      background: productColorFor(productNameById[pid] ?? ""), opacity: 0.92,
                    }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 6, whiteSpace: "nowrap" as const }}>
              {b.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 14, marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {productOrder.map((pid) => {
          const total = buckets.reduce((s, b) => s + (b.products[pid] ?? 0), 0);
          const name = productNameById[pid] ?? pid;
          return (
            <div key={pid} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: productColorFor(name), flexShrink: 0 }} />
              <span style={{ color: "#fff", fontWeight: 700 }}>{name}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{Math.round(total).toLocaleString()} gal</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
