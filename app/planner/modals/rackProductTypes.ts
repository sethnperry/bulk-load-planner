// app/planner/modals/rackProductTypes.ts
// Shared types for the relocated rack-status action modals
// (RackProductStatusModal / EditTerminalModal) -- moved here from the
// now-deleted app/planner/terminal/ page, since STUD + Edit Terminal now
// live inside MyTerminalsModal.tsx's expanded terminal-card view instead of
// a dedicated Terminal tab. Named rackProductTypes.ts, not types.ts --
// app/planner/types.ts already exists one level up with unrelated content
// (ActiveComp, CompPlanInput, etc.), and reusing the bare "types.ts" name in
// this directory risked exactly the relative-vs-absolute import mix-up that
// name collision invites.
//
// RackLane/RackArm (the old per-arm status model) were dropped in this move
// -- they've been dead since the Lane/Arm Layout view was removed on
// 2026-08-31 (see CLAUDE.md's "Terminal tab pivot"), confirmed via a
// repo-wide grep to have no remaining importer.

export type TerminalRack = {
  rack_id: string;
  terminal_id: string;
  rack_name: string;
  created_at: string;
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
  // When set, this product's API/temp tracking pools onto the canonical
  // product's terminal_products row instead of its own (rack-injected
  // variance like dye -- same tank, same feed). Mirrors ActiveComp's own
  // canonical_product_id in app/planner/types.ts; needed here so
  // RackProductStatusModal's STUD write-through pools the same way
  // useLoadWorkflow.ts's real-load write already does.
  canonical_product_id: string | null;
};
