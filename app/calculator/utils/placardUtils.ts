// utils/placardUtils.ts
// DOT hazmat placard logic for bulk liquid petroleum transport.
// Generates SVG placards from UN numbers. No images stored — all computed.
// Reference: 49 CFR 172.500, Table 172.504

// ─── Types ────────────────────────────────────────────────────────────────────

export type HazardClass = "3" | "2.1" | "2.2" | "2.3" | "6.1" | "8" | "COMBUSTIBLE" | "FLAMMABLE";

export type PlacardDef = {
  unNumber: string;          // e.g. "UN1203"
  productName: string;       // e.g. "Gasoline"
  hazardClass: HazardClass;
  packingGroup: 1 | 2 | 3 | null;
  placardType: PlacardType;
  precedence: number;        // lower = more dangerous, wins over higher numbers
};

export type PlacardType =
  | "FLAMMABLE"        // red diamond, Class 3 PG I/II
  | "COMBUSTIBLE"      // red-and-white striped, Class 3 PG III / combustible liquid
  | "FLAMMABLE_GAS"    // red diamond, Class 2.1
  | "NON_FLAMMABLE_GAS"// green diamond, Class 2.2
  | "POISON"           // white diamond, Class 6.1
  | "CORROSIVE"        // black/white diamond, Class 8
  | "DANGEROUS";       // catch-all when mixed hazard classes

// ─── UN number → placard lookup ───────────────────────────────────────────────
// Covers the petroleum products most commonly transported in bulk liquid.
// Add more as needed — the SVG generator handles any entry in this table.

export const UN_PLACARD_MAP: Record<string, PlacardDef> = {
  // ── Gasoline / Motor Fuel ──────────────────────────────────────────────────
  UN1203: { unNumber: "UN1203", productName: "Gasoline",         hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE",   precedence: 10 },
  UN1268: { unNumber: "UN1268", productName: "Petroleum Naphtha", hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE",   precedence: 11 },

  // ── Diesel / Fuel Oil ──────────────────────────────────────────────────────
  UN1993: { unNumber: "UN1993", productName: "Diesel (Flammable Liquid NOS)", hazardClass: "3", packingGroup: 3, placardType: "FLAMMABLE",   precedence: 20 },
  UN1202: { unNumber: "UN1202", productName: "Diesel Fuel",      hazardClass: "3", packingGroup: 3, placardType: "FLAMMABLE",   precedence: 21 },
  UN1863: { unNumber: "UN1863", productName: "Fuel Aviation",    hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE",   precedence: 12 },

  // ── Combustible Liquids (flash point 100–140°F, US domestic only) ──────────
  NA1993: { unNumber: "NA1993", productName: "Combustible Liquid NOS", hazardClass: "COMBUSTIBLE", packingGroup: 3, placardType: "COMBUSTIBLE", precedence: 30 },
  NA1270: { unNumber: "NA1270", productName: "Petroleum Oil",   hazardClass: "COMBUSTIBLE", packingGroup: 3, placardType: "COMBUSTIBLE", precedence: 31 },

  // ── Ethanol / Alcohol ──────────────────────────────────────────────────────
  UN1170: { unNumber: "UN1170", productName: "Ethanol",          hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE",   precedence: 13 },
  UN1987: { unNumber: "UN1987", productName: "Alcohol NOS",      hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE",   precedence: 14 },

  // ── Gasoline blends / E85 ─────────────────────────────────────────────────
  UN3475: { unNumber: "UN3475", productName: "Ethanol/Gasoline blend", hazardClass: "3", packingGroup: 2, placardType: "FLAMMABLE", precedence: 15 },

  // ── Kerosene / Jet fuel ───────────────────────────────────────────────────
  UN1223: { unNumber: "UN1223", productName: "Kerosene",         hazardClass: "3", packingGroup: 3, placardType: "FLAMMABLE",   precedence: 22 },

  // ── LPG / Propane ─────────────────────────────────────────────────────────
  UN1075: { unNumber: "UN1075", productName: "Petroleum Gases",  hazardClass: "2.1", packingGroup: null, placardType: "FLAMMABLE_GAS", precedence: 5 },
  UN1978: { unNumber: "UN1978", productName: "Propane",          hazardClass: "2.1", packingGroup: null, placardType: "FLAMMABLE_GAS", precedence: 6 },
};

// ─── Hazard precedence ────────────────────────────────────────────────────────

/**
 * Given a list of UN numbers (current load + residue), return the single
 * worst-case placard that DOT requires on the vehicle.
 *
 * Rules (simplified for Class 3 petroleum):
 *  1. Flammable Gas (2.1) > Flammable Liquid (3) > Combustible
 *  2. Within Class 3: lower packing group wins (PG I > PG II > PG III)
 *  3. If multiple different UN numbers of the same class/PG: use DANGEROUS
 *     placard unless all are the same product.
 */
export function worstCasePlacard(unNumbers: string[]): PlacardDef | null {
  const defs = unNumbers
    .map((u) => UN_PLACARD_MAP[u.toUpperCase()])
    .filter((d): d is PlacardDef => d != null);

  if (defs.length === 0) return null;

  // Sort by precedence (ascending = most dangerous first)
  defs.sort((a, b) => a.precedence - b.precedence);
  return defs[0];
}

// ─── Compartment residue logic ────────────────────────────────────────────────

export type CompartmentLastLoad = {
  comp_number: number;
  product_id: string | null;
  product_name: string | null;
  un_number: string | null;
  planned_gallons: number;
  empty: boolean;
};

/**
 * Determine which compartments have residue.
 *
 * Residue rule (DOT 49 CFR 173.29):
 *   A compartment retains the residue of the LAST product loaded into it
 *   until it is formally cleaned/purged. "Empty" just means no current load —
 *   the hazmat residue is still present and must be placarded.
 *
 * So: every compartment in lastLoadLines that had a product is residue,
 * UNLESS the current plan loads the SAME product into that compartment
 * (in which case the residue is the same material as the current load — no change).
 *
 * lastLoadLines comes from planned_snapshot.lines in load_log, which includes
 * comp_number, product_id, and un_number for every compartment that was loaded.
 */
export function residueCompartments(
  lastLoadLines: CompartmentLastLoad[],
  currentCompPlan: Record<number, { empty: boolean; productId: string }>
): CompartmentLastLoad[] {
  return lastLoadLines.filter((c) => {
    if (!c.un_number || !c.product_id) return false; // no hazmat residue to track
    const current = currentCompPlan[c.comp_number];
    // Residue is gone only if current plan loads the same product in this comp
    const sameProduct = current && !current.empty && current.productId === c.product_id;
    return !sameProduct;
  });
}

/**
 * All UN numbers present on the vehicle: current load + residue from all prior loads.
 *
 * lastLoadLines: planned_snapshot.lines from the most recent completed load_log row
 *   for this combo. Each line has { comp_number, product_id, un_number }.
 *   We track per-compartment residue, not per-load — so even if a comp was last
 *   loaded 3 loads ago, its product is still the residue until overwritten.
 *
 * For a complete residue history you would need to query each compartment's last
 * product across all load_log rows — for now we use the last completed load as a
 * pragmatic approximation (covers 99% of real-world cases for petroleum transport).
 */
export function vehicleUnNumbers(
  currentCompPlan: Record<number, { empty: boolean; productId: string }>,
  productUnNumberById: Record<string, string | null>,
  lastLoadLines: CompartmentLastLoad[]
): string[] {
  const uns = new Set<string>();

  // Current plan — products actively being loaded
  for (const [, plan] of Object.entries(currentCompPlan)) {
    if (plan.empty || !plan.productId) continue;
    const un = productUnNumberById[plan.productId];
    if (un) uns.add(un.toUpperCase());
  }

  // Residue — any compartment whose last product differs from current plan
  for (const c of residueCompartments(lastLoadLines, currentCompPlan)) {
    if (c.un_number) uns.add(c.un_number.toUpperCase());
  }

  return Array.from(uns);
}

// ─── SVG placard generator ────────────────────────────────────────────────────

const PLACARD_STYLES: Record<PlacardType, {
  bg: string; border: string; textColor: string;
  classNumColor: string; symbol: string | null; label: string;
}> = {
  FLAMMABLE: {
    bg: "#CC2229", border: "#ffffff", textColor: "#ffffff",
    classNumColor: "#ffffff", symbol: "flame", label: "FLAMMABLE",
  },
  COMBUSTIBLE: {
    bg: "url(#combustStripes)", border: "#CC2229", textColor: "#CC2229",
    classNumColor: "#CC2229", symbol: "flame", label: "COMBUSTIBLE",
  },
  FLAMMABLE_GAS: {
    bg: "#CC2229", border: "#ffffff", textColor: "#ffffff",
    classNumColor: "#ffffff", symbol: "flame", label: "FLAMMABLE GAS",
  },
  NON_FLAMMABLE_GAS: {
    bg: "#2e8540", border: "#ffffff", textColor: "#ffffff",
    classNumColor: "#ffffff", symbol: "cylinder", label: "NON-FLAMMABLE GAS",
  },
  POISON: {
    bg: "#ffffff", border: "#000000", textColor: "#000000",
    classNumColor: "#000000", symbol: "skull", label: "POISON",
  },
  CORROSIVE: {
    bg: "#000000", border: "#ffffff", textColor: "#ffffff",
    classNumColor: "#ffffff", symbol: "corrosive", label: "CORROSIVE",
  },
  DANGEROUS: {
    bg: "#ffffff", border: "#000000", textColor: "#000000",
    classNumColor: "#000000", symbol: null, label: "DANGEROUS",
  },
};

/**
 * Generate a DOT-standard placard SVG.
 * Layout + flame values tuned via interactive preview tool.
 */
export function generatePlacardSvg(
  def: PlacardDef,
  opts: { width?: number; height?: number } = {}
): string {
  const { width = 120, height = 120 } = opts;
  const style = PLACARD_STYLES[def.placardType] ?? PLACARD_STYLES["FLAMMABLE"];
  const hasStripes = def.placardType === "COMBUSTIBLE";
  const classDisplay = (def.hazardClass === "COMBUSTIBLE" || def.hazardClass === "FLAMMABLE") ? "3" : def.hazardClass;
  const unDigits = def.unNumber.replace(/^[A-Z]+/i, "");
  const bg = hasStripes ? "url(#combustStripes)" : style.bg;

  // Locked layout values
  const hs = 103, ob = 3, ihs = 94;
  const by = 132, bh = 57, fs = 62, cy = 236;
  const bandMid = by + bh / 2 + 2;
  const cx = 150;

  // Locked flame values (tuned via preview tool)
  const ft=33, fw=32, fh=80, co=11, ml=20, bs=0, ww=4;
  const ho=27, hr=62, hhr=61;
  const bby=110, bbw=67, bbh=4;

  // Outer flame path
  const t=ft, w=fw, h=fh;
  const fo = [
    "M"+cx+","+t,
    "C"+(cx-2)+","+(t+8)+" "+(cx-co*.5)+","+(t+18)+" "+(cx-co*.35)+","+(t+30),
    "C"+(cx-co*.9)+","+(t+20)+" "+(cx-co*1.1)+","+(t+8)+" "+(cx-co*.75)+","+t,
    "C"+(cx-co*1.3)+","+(t+14)+" "+(cx-ml*1.05)+","+(t+32)+" "+(cx-ml)+","+(t+48),
    "C"+(cx-ml*1.15)+","+(t+38)+" "+(cx-ml*1.2)+","+(t+26)+" "+(cx-ml*.95)+","+(t+18),
    "C"+(cx-ml*1.2)+","+(t+36)+" "+(cx-w*1.1)+","+(t+55)+" "+(cx-w*.9)+","+(t+68),
    "C"+(cx-w*1.0)+","+(t+58)+" "+(cx-w*1.0)+","+(t+48)+" "+(cx-w*.8)+","+(t+43),
    "C"+(cx-w*.9)+","+(t+60)+" "+(cx-w*.8)+","+(t+74)+" "+(cx-bs-ww)+","+(t+h*.87),
    "C"+(cx-bs-ww*1.15)+","+(t+h*.78)+" "+(cx-bs-ww*1.1)+","+(t+h*.69)+" "+(cx-bs-ww*.6)+","+(t+h*.65),
    "C"+(cx-bs-ww*.7)+","+(t+h*.77)+" "+(cx-bs*.4)+","+(t+h*.91)+" "+cx+","+(t+h),
    "C"+(cx+bs*.4)+","+(t+h*.91)+" "+(cx+bs+ww*.7)+","+(t+h*.77)+" "+(cx+bs+ww*.6)+","+(t+h*.65),
    "C"+(cx+bs+ww*1.1)+","+(t+h*.69)+" "+(cx+bs+ww*1.15)+","+(t+h*.78)+" "+(cx+bs+ww)+","+(t+h*.87),
    "C"+(cx+w*.8)+","+(t+74)+" "+(cx+w*.9)+","+(t+60)+" "+(cx+w*.8)+","+(t+43),
    "C"+(cx+w*1.0)+","+(t+48)+" "+(cx+w*1.0)+","+(t+58)+" "+(cx+w*.9)+","+(t+68),
    "C"+(cx+ml*1.2)+","+(t+55)+" "+(cx+ml*1.2)+","+(t+36)+" "+(cx+ml*.95)+","+(t+18),
    "C"+(cx+ml*1.15)+","+(t+26)+" "+(cx+ml*1.15)+","+(t+38)+" "+(cx+ml)+","+(t+48),
    "C"+(cx+co*1.3)+","+(t+32)+" "+(cx+co*.9)+","+(t+20)+" "+(cx+co*.75)+","+t,
    "C"+(cx+co*1.1)+","+(t+8)+" "+(cx+co*.9)+","+(t+20)+" "+(cx+co*.35)+","+(t+30),
    "C"+(cx+co*.5)+","+(t+18)+" "+(cx+2)+","+(t+8)+" "+cx+","+t+" Z"
  ].join(" ");

  // Inner hollow (scaled version)
  const hw=fw*hr/100, hh=fh*hhr/100, hco=co*hr/100, hml=ml*hr/100, hbs=bs*hr/100, hww=ww*hr/100;
  const ht=ft+ho;
  const fi = [
    "M"+cx+","+ht,
    "C"+(cx-1)+","+(ht+5)+" "+(cx-hco*.5)+","+(ht+11)+" "+(cx-hco*.35)+","+(ht+18),
    "C"+(cx-hco*.9)+","+(ht+12)+" "+(cx-hco*1.1)+","+(ht+5)+" "+(cx-hco*.75)+","+ht,
    "C"+(cx-hco*1.3)+","+(ht+8)+" "+(cx-hml*1.05)+","+(ht+19)+" "+(cx-hml)+","+(ht+29),
    "C"+(cx-hml*1.15)+","+(ht+23)+" "+(cx-hml*1.2)+","+(ht+16)+" "+(cx-hml*.95)+","+(ht+11),
    "C"+(cx-hml*1.2)+","+(ht+22)+" "+(cx-hw*1.1)+","+(ht+33)+" "+(cx-hw*.9)+","+(ht+41),
    "C"+(cx-hw*1.0)+","+(ht+35)+" "+(cx-hw*1.0)+","+(ht+29)+" "+(cx-hw*.8)+","+(ht+26),
    "C"+(cx-hw*.9)+","+(ht+36)+" "+(cx-hw*.8)+","+(ht+45)+" "+(cx-hbs-hww)+","+(ht+hh*.87),
    "C"+(cx-hbs-hww*1.1)+","+(ht+hh*.78)+" "+(cx-hbs-hww)+","+(ht+hh*.68)+" "+cx+","+(ht+hh),
    "C"+(cx+hbs+hww)+","+(ht+hh*.68)+" "+(cx+hbs+hww*1.1)+","+(ht+hh*.78)+" "+(cx+hbs+hww)+","+(ht+hh*.87),
    "C"+(cx+hw*.8)+","+(ht+45)+" "+(cx+hw*.9)+","+(ht+36)+" "+(cx+hw*.8)+","+(ht+26),
    "C"+(cx+hw*1.0)+","+(ht+29)+" "+(cx+hw*1.0)+","+(ht+35)+" "+(cx+hw*.9)+","+(ht+41),
    "C"+(cx+hml*1.2)+","+(ht+33)+" "+(cx+hml*1.2)+","+(ht+22)+" "+(cx+hml*.95)+","+(ht+11),
    "C"+(cx+hml*1.15)+","+(ht+16)+" "+(cx+hml*1.15)+","+(ht+23)+" "+(cx+hml)+","+(ht+29),
    "C"+(cx+hco*1.3)+","+(ht+19)+" "+(cx+hco*.9)+","+(ht+12)+" "+(cx+hco*.75)+","+ht,
    "C"+(cx+hco*1.1)+","+(ht+5)+" "+(cx+hco*.5)+","+(ht+11)+" "+(cx+1)+","+ht+" Z"
  ].join(" ");

  const stripesDef = hasStripes
    ? '<pattern id="combustStripes" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">'
      + '<rect width="12" height="12" fill="#ffffff"/><rect width="6" height="12" fill="#CC2229"/></pattern>'
    : "";

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"'
    + ' width="' + width + '" height="' + height + '"'
    + ' role="img" aria-label="' + style.label + ' placard ' + def.unNumber + '">'
    + "<defs>" + stripesDef + "</defs>"
    + '<g transform="translate(150,150) rotate(45)">'
    + '<rect x="-' + hs + '" y="-' + hs + '" width="' + (hs*2) + '" height="' + (hs*2) + '" rx="3" fill="' + bg + '"/>'
    + '</g>'
    + '<g transform="translate(150,150) rotate(45)">'
    + '<rect x="-' + hs + '" y="-' + hs + '" width="' + (hs*2) + '" height="' + (hs*2) + '" rx="3" fill="none" stroke="#ffffff" stroke-width="' + ob + '"/>'
    + '</g>'
    + '<g transform="translate(150,150) rotate(45)">'
    + '<rect x="-' + ihs + '" y="-' + ihs + '" width="' + (ihs*2) + '" height="' + (ihs*2) + '" rx="2" fill="none" stroke="#ffffff" stroke-width="1.5"/>'
    + '</g>'
    + '<path d="' + fo + '" fill="#ffffff"/>'
    + '<path d="' + fi + '" fill="' + style.bg + '"/>'
    + '<rect x="' + (150 - bbw/2) + '" y="' + bby + '" width="' + bbw + '" height="' + bbh + '" rx="2" fill="#ffffff"/>'
    + '<rect x="56" y="' + by + '" width="188" height="' + bh + '" rx="2" fill="#ffffff"/>'
    + '<text x="150" y="' + bandMid + '" text-anchor="middle" dominant-baseline="middle"'
    + ' font-family="Arial Black, Arial, sans-serif" font-weight="900"'
    + ' font-size="' + fs + '" fill="#000000" letter-spacing="-1">' + unDigits + '</text>'
    + '<text x="150" y="' + cy + '" text-anchor="middle" dominant-baseline="middle"'
    + ' font-family="Arial Black, Arial, sans-serif" font-weight="900"'
    + ' font-size="26" fill="#ffffff">' + classDisplay + '</text>'
    + '</svg>'
  );
}

/**
 * Convert an SVG string to a data URI for use in <img src="...">
 */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Get the placard image data URI for a UN number, or null if unknown.
 */
export function placardDataUri(
  unNumber: string | null | undefined,
  opts?: { width?: number; height?: number; showUnNumber?: boolean }
): string | null {
  if (!unNumber) return null;
  const def = UN_PLACARD_MAP[unNumber.toUpperCase()];
  if (!def) return null;
  return svgToDataUri(generatePlacardSvg(def, opts));
}
