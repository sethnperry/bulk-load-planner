// lib/ui/driver/role.ts
//
// Shared Role type for user_companies.role -- previously typed as bare
// `string` (or `as any`-cast) everywhere, which is how the invite/reassign
// dropdowns drifted out of sync with each other. `role` itself has no DB
// CHECK constraint/enum (confirmed live), so this union is an app-level
// contract only -- an unexpected string from the DB still needs a
// graceful fallback wherever it's rendered (see ROLE_LABELS usage).

export type Role = "driver" | "lead" | "admin" | "dispatch";

export const ROLES: Role[] = ["driver", "lead", "dispatch", "admin"];

export const ROLE_LABELS: Record<Role, string> = {
  driver: "Driver",
  lead: "Lead",
  dispatch: "Dispatch",
  admin: "Admin",
};

export function isRole(value: string | null | undefined): value is Role {
  return !!value && (ROLES as string[]).includes(value);
}
