// app/calculator/terminal/labels.ts
//
// Lane numbers are continuous across every rack at a terminal (e.g. South
// Rack 1-5, North Rack picks up at 6-10) -- per explicit user direction,
// since a real terminal never has two physical "lane 1"s. Racks are
// ordered by created_at (whichever rack was set up first gets the lower
// numbers) and each rack's own local lane count determines how much of
// the range it occupies; nothing is stored on the rack itself, this is
// always derived so it can never drift out of sync with the racks list.
//
// Arms stay rack-local (they're physically inside one rack's own lanes,
// not shared across racks) and, per explicit direction, never use letters
// -- always plain numbers. Lanes dropped the letter option too (a global
// numbering scheme and per-rack lettering don't compose sensibly).

import type { TerminalRack } from "./types";

export function computeLaneOffsets(racks: TerminalRack[]): Record<string, number> {
  const ordered = [...racks].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const offsets: Record<string, number> = {};
  let running = 0;
  for (const r of ordered) {
    offsets[r.rack_id] = running;
    running += r.lane_count;
  }
  return offsets;
}

export function laneLabel(localLaneNumber: number, rack: TerminalRack, laneOffset: number): string {
  const local = rack.lane_reversed ? rack.lane_count - localLaneNumber + 1 : localLaneNumber;
  return String(laneOffset + local);
}

export function armLabel(armNumber: number, rack: TerminalRack): string {
  const n = rack.arm_reversed ? rack.arm_count - armNumber + 1 : armNumber;
  return String(n);
}
