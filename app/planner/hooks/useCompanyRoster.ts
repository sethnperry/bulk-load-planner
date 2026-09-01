"use client";
// app/planner/hooks/useCompanyRoster.ts
//
// Company member list (user_id + display_name) via get_display_names_full --
// the same roster-fetch shape independently duplicated by
// DriverAssignmentModal.tsx and FleetCardsModal.tsx. Shared here rather
// than copied again -- callers include the Dispatch tab's driver picker
// and the Period Report/Underloading Dashboard's driver-group filter.
//
// Backed by React Query since 2026-09-01 (see CLAUDE.md's "Performance
// pass #3") -- the raw roster fetch is now cached per companyId, keyed
// ["companyRoster", companyId]. `excludeUserId` is deliberately NOT part
// of the query key: it's a pure post-fetch filter (was already true
// before this change -- it never affected the SQL), so every consumer of
// the same company, regardless of its own excludeUserId, shares one
// underlying network fetch instead of each triggering its own. Exported
// signature is unchanged -- every call site (DriverPicker,
// PayrollReportModal, UnderloadingDashboardModal, DriverGroupPicker,
// Terminal tab) needed zero edits.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// `region` added 2026-08-19 for the Period Report/Underloading Dashboard
// driver-group filter (region-grouped checkbox picker) -- per CLAUDE.md,
// get_display_names_full already returns region/local_area/division/
// employee_number alongside display_name, so this is just widening the
// existing mapping, not a new query.
export type RosterMember = { user_id: string; display_name: string; region: string | null };

async function fetchCompanyRoster(companyId: string): Promise<RosterMember[]> {
  const { data: memberRows } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId);
  const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
  if (memberIds.length === 0) return [];
  const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: memberIds });
  return ((nameRows ?? []) as any[])
    .map((r) => ({ user_id: r.user_id, display_name: r.display_name ?? "Unknown", region: r.region ?? null }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export function useCompanyRoster(companyId: string | null, opts?: { excludeUserId?: string }) {
  const { data: rawMembers = [], isLoading } = useQuery({
    queryKey: ["companyRoster", companyId],
    queryFn: () => fetchCompanyRoster(companyId as string),
    enabled: !!companyId,
  });

  const members = useMemo(
    () => (opts?.excludeUserId ? rawMembers.filter((m) => m.user_id !== opts.excludeUserId) : rawMembers),
    [rawMembers, opts?.excludeUserId]
  );

  return { members, loading: !!companyId && isLoading };
}
