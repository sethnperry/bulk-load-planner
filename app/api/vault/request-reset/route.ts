// app/api/vault/request-reset/route.ts
//
// Replaces the Vault's old instant, unverified "Forgot PIN -> immediately
// pick a new one" bypass with a real email-confirmation step. Mirrors
// app/api/admin/invite/route.ts's exact shape: a service-role client,
// caller identity verified via a Bearer access token (not the cookie-
// based lib/authz.ts helpers, which are page-redirect-oriented) and the
// same Resend fetch pattern for the email itself.
//
// Never touches vault_entries or user_vault_pin -- this route only
// issues a one-time reset token. The actual pattern reset happens later,
// client-side, through /api/vault/confirm-reset (which just validates
// the token) followed by the normal authenticated upsert the app already
// uses to set a pattern -- so stored entries are never in this write
// path at all.
//
// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_APP_URL, RESEND_API_KEY, INVITE_FROM_EMAIL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: "Reset your ProTankr Vault pattern",
      html: buildEmailHtml(resetUrl),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const admin = getAdmin();
    const { data: userRes } = await admin.auth.getUser(token);
    const user = userRes?.user;
    if (!user?.id || !user.email) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error: insertErr } = await admin.from("vault_reset_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (insertErr) throw insertErr;

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://protankr.com";
    const resetUrl = `${origin}/planner/vault?resetToken=${encodeURIComponent(rawToken)}`;

    await sendResetEmail(user.email, resetUrl);

    // Mask the address for the client to display ("Check s***@gmail.com")
    // without re-exposing the full address unnecessarily.
    const [local, domain] = user.email.split("@");
    const masked = domain ? `${local.slice(0, 1)}***@${domain}` : user.email;

    return NextResponse.json({ ok: true, maskedEmail: masked });
  } catch (e: any) {
    console.error("[vault/request-reset] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}

function buildEmailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your ProTankr Vault pattern</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

  <tr><td style="padding:0 0 24px;border-bottom:1px solid #e5e5e5;">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td valign="middle">
        <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#111111;white-space:nowrap;">ProTankr</div>
      </td>
      <td valign="middle" align="right" width="40">
        <img src="https://protankr.com/icons/icon-email-black.png" width="36" height="36" alt="ProTankr" style="display:block;" />
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:28px 0 8px;">
    <div style="font-size:20px;font-weight:800;color:#111111;">Reset your Vault pattern?</div>
  </td></tr>
  <tr><td style="padding:0 0 24px;">
    <div style="font-size:14px;line-height:1.6;color:#333333;">
      Someone (hopefully you) asked to reset the unlock pattern on your ProTankr Vault.
      Tapping the button below will let you draw a new pattern -- your saved logins and
      passwords are never affected either way. If you didn't request this, you can safely
      ignore this email.
    </div>
  </td></tr>

  <tr><td style="padding:0 0 28px;">
    <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#111111;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
        Reset Vault Pattern
      </a>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding:0 0 8px;border-top:1px solid #e5e5e5;padding-top:16px;">
    <div style="font-size:12px;color:#888888;">This link expires in 30 minutes and can only be used once.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
