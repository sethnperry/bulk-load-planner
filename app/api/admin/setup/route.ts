// app/api/admin/setup/route.ts
// Server-side proxy for admin "set up planner for user" operations.
// Validates the caller is an admin, then uses the service role client
// to read/write on behalf of targetUserId, bypassing RLS.
//
// All operations are POST { op, targetUserId, ...params }
// Supported ops:
//   get_primary_equipment   → { primaryTruckIds, primaryTrailerIds }
//   set_primary_truck       → upsert user_primary_trucks
//   remove_primary_truck    → delete user_primary_trucks
//   set_primary_trailer     → upsert user_primary_trailers
//   remove_primary_trailer  → delete user_primary_trailers
//   get_terminal_access     → { accessDateByTerminalId }
//   get_my_terminals        → { terminals }
//   set_terminal_access     → upsert terminal_access
//   set_my_terminal         → upsert my_terminals
//   remove_my_terminal      → delete my_terminals
//   get_card_data           → { cardDataByTerminalId }
//   set_card_data           → upsert user_terminal_cards
//   get_company_id          → { companyId }
//   claim_combo             → calls claim_combo(p_combo_id, p_user_id)
//   slip_seat_combo         → calls slip_seat_combo(p_combo_id, p_user_id)
//   get_carded              → calls get_carded(p_terminal_id, p_carded_on, p_user_id)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceSupabase } from "@/lib/supabase/serviceClient";

// Verify the caller is authenticated and is an admin/lead for their active company.
async function verifyAdmin(req: NextRequest): Promise<{ adminUserId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the JWT belongs to a real user
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get their active company using service role (bypasses RLS)
  const { data: settings } = await serviceSupabase
    .from("user_settings")
    .select("active_company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const companyId = (settings as any)?.active_company_id as string | null;
  if (!companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check they are admin or lead in that specific company
  const { data: membership } = await serviceSupabase
    .from("user_companies")
    .select("role")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .in("role", ["admin", "lead"])
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { adminUserId: user.id };
}

export async function POST(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (adminResult instanceof NextResponse) return adminResult;

  let body: Record<string, any>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { op, targetUserId } = body;
  if (!op || !targetUserId) {
    return NextResponse.json({ error: "Missing op or targetUserId" }, { status: 400 });
  }

  try {
    switch (op) {

      // ── Primary equipment reads ──────────────────────────────────────────────

      case "get_primary_equipment": {
        const [{ data: pt }, { data: ptr }] = await Promise.all([
          serviceSupabase.from("user_primary_trucks").select("truck_id").eq("user_id", targetUserId),
          serviceSupabase.from("user_primary_trailers").select("trailer_id").eq("user_id", targetUserId),
        ]);
        return NextResponse.json({
          primaryTruckIds:   (pt  ?? []).map((r: any) => String(r.truck_id)),
          primaryTrailerIds: (ptr ?? []).map((r: any) => String(r.trailer_id)),
        });
      }

      // ── Primary equipment writes ─────────────────────────────────────────────

      case "set_primary_truck": {
        const { truckId } = body;
        const { error } = await serviceSupabase
          .from("user_primary_trucks")
          .upsert({ user_id: targetUserId, truck_id: truckId }, { onConflict: "user_id,truck_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "remove_primary_truck": {
        const { truckId } = body;
        const { error } = await serviceSupabase
          .from("user_primary_trucks")
          .delete()
          .eq("user_id", targetUserId)
          .eq("truck_id", truckId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "set_primary_trailer": {
        const { trailerId } = body;
        const { error } = await serviceSupabase
          .from("user_primary_trailers")
          .upsert({ user_id: targetUserId, trailer_id: trailerId }, { onConflict: "user_id,trailer_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "remove_primary_trailer": {
        const { trailerId } = body;
        const { error } = await serviceSupabase
          .from("user_primary_trailers")
          .delete()
          .eq("user_id", targetUserId)
          .eq("trailer_id", trailerId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Terminal access ──────────────────────────────────────────────────────

      case "get_terminal_access": {
        const { data, error } = await serviceSupabase
          .from("terminal_access")
          .select("terminal_id, carded_on")
          .eq("user_id", targetUserId);
        if (error) throw error;
        const map: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row?.terminal_id && row?.carded_on)
            map[String(row.terminal_id)] = String(row.carded_on);
        }
        return NextResponse.json({ accessDateByTerminalId: map });
      }

      case "set_terminal_access": {
        const { terminalId, isoDate } = body;
        const { error } = await serviceSupabase
          .from("terminal_access")
          .upsert(
            { user_id: targetUserId, terminal_id: terminalId, carded_on: isoDate },
            { onConflict: "user_id,terminal_id" }
          );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── My terminals ─────────────────────────────────────────────────────────

      case "get_my_terminals": {
        const { data, error } = await serviceSupabase
          .from("my_terminals_with_status")
          .select("*")
          .eq("user_id", targetUserId)
          .order("state", { ascending: true })
          .order("city", { ascending: true })
          .order("terminal_name", { ascending: true });
        if (error) throw error;
        return NextResponse.json({ terminals: data ?? [] });
      }

      case "set_my_terminal": {
        const { terminalId } = body;
        const { error } = await serviceSupabase
          .from("my_terminals")
          .upsert(
            { user_id: targetUserId, terminal_id: terminalId, is_starred: true },
            { onConflict: "user_id,terminal_id" }
          );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "remove_my_terminal": {
        const { terminalId } = body;
        const { error } = await serviceSupabase
          .from("my_terminals")
          .delete()
          .eq("user_id", targetUserId)
          .eq("terminal_id", terminalId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Card data ────────────────────────────────────────────────────────────

      case "get_card_data": {
        const { data, error } = await serviceSupabase
          .from("user_terminal_cards")
          .select("terminal_id, card_number, private_note")
          .eq("user_id", targetUserId);
        if (error) throw error;
        const map: Record<string, { cardNumber: string; privateNote: string }> = {};
        for (const row of data ?? []) {
          map[String(row.terminal_id)] = {
            cardNumber:  row.card_number   ?? "",
            privateNote: row.private_note  ?? "",
          };
        }
        return NextResponse.json({ cardDataByTerminalId: map });
      }

      case "set_card_data": {
        const { terminalId, cardNumber, privateNote } = body;
        const { error } = await serviceSupabase
          .from("user_terminal_cards")
          .upsert(
            {
              user_id:      targetUserId,
              terminal_id:  terminalId,
              card_number:  cardNumber,
              private_note: privateNote,
              updated_at:   new Date().toISOString(),
            },
            { onConflict: "user_id,terminal_id" }
          );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Company ID ───────────────────────────────────────────────────────────

      case "get_company_id": {
        const { data, error } = await serviceSupabase
          .from("user_settings")
          .select("active_company_id")
          .eq("user_id", targetUserId)
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ companyId: (data as any)?.active_company_id ?? null });
      }

      // ── RPC proxies ──────────────────────────────────────────────────────────

      case "claim_combo": {
        const { comboId } = body;
        const { data, error } = await serviceSupabase.rpc("claim_combo", {
          p_combo_id: comboId,
          p_user_id:  targetUserId,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }

      case "slip_seat_combo": {
        const { comboId } = body;
        const { data, error } = await serviceSupabase.rpc("slip_seat_combo", {
          p_combo_id: comboId,
          p_user_id:  targetUserId,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }

      case "get_carded": {
        const { terminalId, cardedOn } = body;
        const { error } = await serviceSupabase.rpc("get_carded", {
          p_terminal_id: terminalId,
          p_carded_on:   cardedOn,
          p_user_id:     targetUserId,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("[admin/setup]", op, e?.message);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
