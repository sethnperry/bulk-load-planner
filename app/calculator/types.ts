// types.ts — shared types for the calculator feature
// Extracted from page.tsx. Import from here, not from page.tsx.

export type CompPlanInput = {
  empty: boolean;
  productId: string; // "" means none selected
  // Temporary per-load ceiling, bounded to the compartment's configured
  // cap_gallons -- never exceeds it. null/undefined = use the full
  // configured cap. Lives here (not separate state) so it rides along with
  // the rest of compPlan's existing localStorage + preset persistence for
  // free (usePlanSlots serializes compPlan wholesale).
  capOverride?: number | null;
};

export type PlanRow = {
  comp_number: number;
  max_gallons: number;
  planned_gallons: number;
  productId?: string;
  lbsPerGal?: number;
  position?: number;
};

export type PlanCalcRow = PlanRow & { lbsPerGal: number; position: number };

export type ComboRow = {
  combo_id: string;
  combo_name: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  target_weight: number | null;   // renamed from gross_limit_lbs
  coupled?: boolean | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  active: boolean | null;
};

export type TerminalRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  carded_on: string | null;
  expires_on?: string | null;
  status: "valid" | "expired" | "not_carded";
  starred: boolean | null;
};

export type TerminalCatalogRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  timezone?: string | null;
  active: boolean | null;
  renewal_days?: number | null;
};

export type StateRow = {
  state_code: string;
  state_name: string | null;
  active: boolean | null;
};

export type CityRow = {
  city_id: string;
  state_code: string | null;
  city_name: string | null;
  active: boolean | null;
};

export type CompRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number | null; // total physical volume -- informational only
  cap_gallons: number | null; // overflow-prevention ceiling -- this is what the solver uses
  position: number | null;
  active: boolean | null;
};

export type ProductRow = {
  product_id: string;
  product_name: string | null;
  display_name?: string | null;
  description?: string | null;
  product_code?: string | null;
  button_code?: string | null;
  hex_code?: string | null;
  api_60: number | null;
  alpha_per_f: number | null;
  last_api?: number | null;
  last_api_updated_at?: string | null;
  last_temp_f?: number | null;   // observed temp when last_api was recorded
  last_loaded_at?: string | null;
  un_number?: string | null;     // DOT UN number e.g. "UN1203" for placard logic
  is_dyed?: boolean | null;
  // When set, this product's API/temp tracking pools onto the canonical
  // product's terminal_products row instead of its own (rack-injected
  // variance like dye -- same tank, same feed). Driver-facing selection/
  // labeling is unaffected; only the underlying tracking is redirected.
  canonical_product_id?: string | null;
};

export type TerminalProductMetaRow = {
  terminal_id: string;
  product_id: string;
  last_api: number | null;
  last_api_updated_at: string | null;
  last_temp_f: number | null;
  last_loaded_at: string | null;
};

export type ActiveComp = {
  compNumber: number;
  maxGallons: number;
  position: number;
  productId: string;
  lbsPerGal: number;
};

export type PlanSnapshot = {
  v: 1;
  savedAt: number;
  terminalId: string;
  tempF: number;
  cgSlider: number;
  compPlan: Record<number, CompPlanInput>;
};

export type LoadReport = {
  planned_total_gal: number;
  planned_gross_lbs: number | null;
  actual_gross_lbs: number | null;
  diff_lbs: number | null;
  // Incentive system ("Recovered Gallons") -- null when the company hasn't
  // enabled it, or calculate_load_points hasn't returned yet.
  recovered_points: number | null;
};
