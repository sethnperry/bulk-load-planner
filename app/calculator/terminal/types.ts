// app/calculator/terminal/types.ts
// Shared types for the Terminal tab (racks/lanes/arms). See CLAUDE.md
// "Terminal Tier — Build Spec" for the full design.

export type TerminalRack = {
  rack_id: string;
  terminal_id: string;
  rack_name: string;
  created_at: string;
};

export type RackLane = {
  rack_id: string;
  lane_number: number;
  label: string | null;
  is_down: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type RackArm = {
  arm_id: string;
  rack_id: string;
  lane_number: number;
  arm_number: number;
  label: string | null;
  product_ids: string[];
  is_down: boolean;
  out_product_ids: string[];
  status_updated_at: string | null;
  status_updated_by: string | null;
};

export type RackProductStatusRow = {
  rack_id: string;
  product_id: string;
  is_out: boolean;
  last_api: number | null;
  last_temp_f: number | null;
  updated_at: string;
  active: boolean;
};

export type ProductLite = {
  product_id: string;
  product_name: string | null;
  display_name: string | null;
  description: string | null;
  button_code: string | null;
  hex_code: string | null;
  is_dyed: boolean | null;
};
