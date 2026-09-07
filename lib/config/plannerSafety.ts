// Planner safety knobs.
//
// Single source of truth for values that will eventually be operator-tunable
// from the super-admin dashboard. Kept here (not inlined) so that, when the
// dashboard settings pass happens, there's exactly one place the app reads
// from and the swap to a DB-backed value is a one-file change.
//
// DEFAULT_STALE_API_DAYS -- how old a terminal's last API reading for a
// planned product may be before the LOAD flow surfaces the "Good / Better /
// Best" stale-API safety overlay. Lower = prompt more often (more
// conservative). See app/superadmin/page.tsx for the placeholder control
// that will host this.
export const DEFAULT_STALE_API_DAYS = 7;
