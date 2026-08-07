// app/planner/terminal/labels.ts
//
// Lane and arm labels are explicit, freely-editable text stored directly on
// rack_lanes.label / rack_arms.label (see the 2026-08-04 rework) -- not
// computed from a count+reversed scheme. That scheme couldn't represent a
// lane having a different number of arms than its neighbors, and didn't
// give the admin real control over what a lane/arm is actually called at
// the physical facility. This helper just covers the one remaining edge
// case: a row created before a label was ever typed in.

export function displayLabel(label: string | null | undefined, fallback: number): string {
  return label && label.trim() ? label : String(fallback);
}
