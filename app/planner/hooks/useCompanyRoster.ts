"use client";
// app/planner/hooks/useCompanyRoster.ts
//
// Company member list (user_id + display_name) via get_display_names_full --
// the same roster-fetch shape independently duplicated by
// DriverAssignmentModal.tsx and FleetCardsModal.tsx. This is now the third
// call site (Dispatch tab's driver picker, Driver Training's trainee
// picker), so it's shared here rather than copied a third time.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type RosterMember = { user_id: string; display_name: string };

export function useCompanyRoster(companyId: string | null, opts?: { excludeUserId?: string }) {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) { setMembers([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: memberRows } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId);
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (memberIds.length === 0) { if (!cancelled) { setMembers([]); setLoading(false); } return; }
      const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: memberIds });
      if (cancelled) return;
      const list = ((nameRows ?? []) as any[])
        .map((r) => ({ user_id: r.user_id, display_name: r.display_name ?? "Unknown" }))
        .filter((d) => d.user_id !== opts?.excludeUserId)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      setMembers(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, opts?.excludeUserId]);

  return { members, loading };
}
