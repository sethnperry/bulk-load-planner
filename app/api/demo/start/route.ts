// app/api/demo/start/route.ts
//
// The shareable "demo login" link. Mints a fresh Supabase magic-link for one
// of a small fixed set of demo accounts -- selected only by the ?persona=
// query param matching a known key ("alpha" | "beta"), which maps to a
// server-side-only email env var. The email itself is never accepted as a
// request parameter, so this can only ever log someone into one of the
// designated demo accounts. Redirects straight through the generated link,
// skipping the email step entirely -- reuses the exact same generateLink ->
// action_link -> /auth/confirm flow already proven by
// app/api/admin/invite/route.ts; app/auth/confirm/page.tsx needs zero
// changes to handle this.
//
// Two independent personas exist so two different people can each have
// their own live demo session without kicking each other's (demo_sessions/
// demo_commandeer tracks activity per-user, not as a single global lock).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PERSONA_EMAIL_ENV: Record<string, string | undefined> = {
  alpha: process.env.DEMO_ACCOUNT_EMAIL_ALPHA,
  beta: process.env.DEMO_ACCOUNT_EMAIL_BETA,
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;

  try {
    const persona = (new URL(req.url).searchParams.get("persona") ?? "alpha").toLowerCase();
    const email = PERSONA_EMAIL_ENV[persona];
    if (!email) throw new Error(`Unknown or unconfigured demo persona: ${persona}`);

    const admin = getAdmin();
    const redirectTo = `${origin}/auth/confirm`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    // Build confirmUrl from token_hash pointing at our own /auth/confirm
    // route -- NOT Supabase's raw action_link (<project>.supabase.co/auth/
    // v1/verify), which is a GET that consumes the one-time token on the
    // very first hit. Any prefetch/link-scanner/preflight that requests
    // that URL before the "real" navigation completes silently burns it --
    // the exact class of bug already found and fixed for the invite email
    // (see app/api/admin/invite/route.ts, and CLAUDE.md's "magic link /
    // login reliability" history) but never ported to this route.
    // /auth/confirm/page.tsx already expects `?token_hash=...&type=...`
    // and only consumes it via an explicit client-side verifyOtp() call,
    // so this is a drop-in fix, not a new mechanism.
    if (error || !data?.properties?.hashed_token) {
      throw new Error(error?.message ?? "Failed to generate demo login link.");
    }
    const confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink`;

    return NextResponse.redirect(confirmUrl);
  } catch (e: any) {
    console.error("demo/start failed:", e?.message ?? e);
    return NextResponse.redirect(`${origin}/demo/ended?reason=error`);
  }
}
