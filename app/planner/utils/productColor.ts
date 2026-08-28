// app/planner/utils/productColor.ts
//
// Simple product-family color coding for at-a-glance UI (currently just
// TerminalOutageDetailModal.tsx's report cards, per explicit request:
// "make the product name the product color (red). or yellow if diesel,
// white for regular etc.") -- diesel reads yellow, premium gasoline reads
// red, everything else (regular, mid-grade/plus, and anything unmatched)
// reads white. Matched by substring against the product's own name --
// there's no separate "family" column on `products` to key off instead.

export function productColorFor(productName: string): string {
  const n = (productName || "").toLowerCase();
  if (n.includes("diesel")) return "#eab308";
  if (n.includes("premium")) return "#ef4444";
  return "#ffffff";
}
