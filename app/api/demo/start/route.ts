// app/api/demo/start/route.ts
//
// The shareable "demo login" link. Mints a fresh Supabase magic-link for
// the one fixed demo account (never accepted as a request parameter --
// hardcoded to DEMO_ACCOUNT_EMAIL, server-side env only) and redirects the
// browser straight to it, skipping the email step entirely. Reuses the
// exact same generateLink -> action_link -> /auth/confirm flow already
// proven by app/api/admin/invite/route.ts; app/auth/confirm/page.tsx needs
// zero changes to handle this.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;

  try {
    const email = process.env.DEMO_ACCOUNT_EMAIL;
    if (!email) throw new Error("DEMO_ACCOUNT_EMAIL not set.");

    const admin = getAdmin();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${origin}/auth/confirm` },
    });

    if (error || !data?.properties?.action_link) {
      throw new Error(error?.message ?? "Failed to generate demo login link.");
    }

    return NextResponse.redirect(data.properties.action_link);
  } catch (e: any) {
    console.error("demo/start failed:", e?.message ?? e);
    return NextResponse.redirect(`${origin}/demo/ended?reason=error`);
  }
}
