// app/api/vault/confirm-reset/route.ts
//
// Verifies a Vault reset token (issued by /api/vault/request-reset) and
// marks it used. Deliberately does NOT touch user_vault_pin itself --
// once this returns { ok: true }, the client performs the actual pattern
// upsert directly through the normal authenticated Supabase client
// (existing RLS already allows user_id = auth.uid() on that table), the
// same write path the original PIN-setup flow already used. Keeping the
// token check and the actual write in separate steps means the token
// table never becomes a path that can touch stored entries.
//
// Same auth pattern as request-reset: Bearer access token, service-role
// client, no cookie-based helpers.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const authToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!authToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { resetToken } = (await req.json()) as { resetToken?: string };
    if (!resetToken) return NextResponse.json({ error: "Missing reset token." }, { status: 400 });

    const admin = getAdmin();
    const { data: userRes } = await admin.auth.getUser(authToken);
    const user = userRes?.user;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    const { data: row, error: findErr } = await admin
      .from("vault_reset_tokens")
      .select("id, expires_at, used_at")
      .eq("user_id", user.id)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (findErr) throw findErr;

    if (!row) {
      return NextResponse.json({ error: "This reset link is invalid." }, { status: 400 });
    }
    if (row.used_at) {
      return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This reset link has expired." }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from("vault_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[vault/confirm-reset] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}
