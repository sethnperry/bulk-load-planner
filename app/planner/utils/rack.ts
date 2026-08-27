// app/planner/utils/rack.ts
//
// Extracted from useLoadWorkflow.ts's own inline rack-resolution snippet
// (2026-08-13's "rack-product_status write-through" fix) so it has exactly
// one implementation instead of being copied a second time for
// useTerminalOutageReports.ts -- see this project's own established
// "duplicating this is how the bug creeps back in" rule.

import { supabase } from "@/lib/supabase/client";

/**
 * Resolves the rack a driver is actually loading at, falling back to the
 * terminal's own single rack when none was explicitly selected -- confirmed
 * live (2026-08-13) that `selectedRackId` can genuinely come back empty even
 * when the terminal has exactly one real rack. A terminal with more than one
 * rack is never silently guessed here -- that ambiguity is exactly what
 * chooseTerminal()'s own rack-picker prompt exists to force a real choice on
 * elsewhere in the app; this only ever resolves the unambiguous 0/1-rack case.
 */
export async function resolveEffectiveRackId(
  selectedRackId: string | null | undefined,
  selectedTerminalId: string | null | undefined
): Promise<string | null> {
  if (selectedRackId) return selectedRackId;
  if (!selectedTerminalId) return null;
  const { data: racks } = await supabase
    .from("terminal_racks")
    .select("rack_id")
    .eq("terminal_id", selectedTerminalId);
  if (racks && racks.length === 1) return racks[0].rack_id;
  return null;
}
