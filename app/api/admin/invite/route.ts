// app/api/admin/invite/route.ts
//
// Handles both new and existing users:
// - New user: inviteUserByEmail (creates account) + Resend custom email
// - Existing user: generateLink (magic link) + Resend custom email
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_APP_URL          (e.g. https://protankr.com)
//   RESEND_API_KEY               (from resend.com)
//   INVITE_FROM_EMAIL            (e.g. noreply@protankr.com — must be verified in Resend)

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { isRole }                    from "@/lib/ui/driver/role";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyAdmin(
  req: NextRequest,
  admin: ReturnType<typeof getAdmin>,
  companyId: string,
): Promise<boolean> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return false;
  const { data: uc } = await admin
    .from("user_companies").select("role")
    .eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
  return uc?.role === "admin";
}

// ─── Send email via Resend ────────────────────────────────────────────────────
async function sendInviteEmail(to: string, confirmUrl: string, companyName: string) {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: `You've been invited to ${companyName} on ProTankr`,
      html: buildEmailHtml(confirmUrl, companyName),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

// ─── POST /api/admin/invite ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email, companyId, role = "driver" } = await req.json() as {
      email: string; companyId: string; role?: string;
    };
    if (!email || !companyId) {
      return NextResponse.json({ error: "email and companyId are required." }, { status: 400 });
    }
    if (!isRole(role)) {
      return NextResponse.json({ error: `Invalid role "${role}".` }, { status: 400 });
    }

    const admin = getAdmin();
    if (!await verifyAdmin(req, admin, companyId)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: co } = await admin.from("companies").select("company_name")
      .eq("company_id", companyId).maybeSingle();
    const companyName = co?.company_name ?? "your company";

    const origin      = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://protankr.com";
    const redirectTo  = `${origin}/auth/confirm`;

    // ── Check if user already exists ────────────────────────────────────────
    const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = existingList?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    let confirmUrl: string;

    // Both branches build confirmUrl from a token_hash pointing at our own
    // /auth/confirm route -- NOT Supabase's raw action_link, which points
    // at <project>.supabase.co/auth/v1/verify. That endpoint is a GET
    // request that consumes the one-time token on hit, so any link-scanner
    // that prefetches it (Outlook Safe Links, some corporate mail gateways)
    // silently burns the invite before the user ever taps it -- the exact
    // same class of bug already fixed for the Magic Link sign-in email
    // template (see CLAUDE.md's "magic link / login reliability" history).
    // /auth/confirm/page.tsx already expects `?token_hash=...&type=...` and
    // only consumes it via an explicit client-side verifyOtp() call, so
    // this is a drop-in fix, not a new mechanism.

    if (existing) {
      // User exists — generate a fresh magic link so they can log in.
      // generateLink() never sends an email itself either way.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token) {
        throw new Error(linkErr?.message ?? "Failed to generate login link.");
      }
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;

      // Ensure they're in the company -- but do NOT silently overwrite the
      // role of someone who is ALREADY a member. An invite is an "add someone"
      // action; re-sending it (a common thing to do when the first email is
      // lost) must not quietly demote a lead/dispatch/admin back to the
      // default "driver". Role changes for existing members go through the
      // admin roster dropdown, not the invite endpoint.
      const { data: existingMembership } = await admin
        .from("user_companies").select("role")
        .eq("user_id", existing.id).eq("company_id", companyId).maybeSingle();
      if (!existingMembership) {
        await admin.from("user_companies").insert(
          { user_id: existing.id, company_id: companyId, role }
        );
      }

      // Set active_company_id so the app knows which company to load
      await admin.from("user_settings").upsert(
        { user_id: existing.id, active_company_id: companyId },
        { onConflict: "user_id" }
      );
    } else {
      // New user — generateLink({type:"invite"}) both creates the account
      // AND returns a link, without ever sending Supabase's own built-in
      // invite email the way inviteUserByEmail() unavoidably does (that API
      // has no flag to suppress it). Using generateLink directly here --
      // instead of calling inviteUserByEmail() and then generateLink() a
      // second time just to get a link, as before -- is what actually
      // stops Supabase's own (broken, uncustomized) invite email from
      // going out alongside our branded Resend one.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { company_id: companyId, role } },
      });
      if (linkErr || !linkData?.properties?.hashed_token) {
        throw new Error(linkErr?.message ?? "Failed to generate invite link.");
      }
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=invite`;

      // Pre-create company membership + active company setting
      if (linkData.user?.id) {
        await admin.from("user_companies").upsert(
          { user_id: linkData.user.id, company_id: companyId, role },
          { onConflict: "user_id,company_id" }
        );
        await admin.from("user_settings").upsert(
          { user_id: linkData.user.id, active_company_id: companyId },
          { onConflict: "user_id" }
        );
      }
    }

    // ── Send our custom branded email ────────────────────────────────────────
    await sendInviteEmail(email, confirmUrl, companyName);

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    console.error("[invite] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}


// ─── Email HTML ───────────────────────────────────────────────────────────────
function buildEmailHtml(confirmUrl: string, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to ProTankr</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

  <!-- Header -->
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

  <!-- Body -->
  <tr><td style="padding:28px 0 24px;">
    <div style="font-size:17px;font-weight:700;color:#111111;margin-bottom:8px;line-height:1.4;">
      You've been added to<br><span style="color:#555555;">${companyName}</span>.
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.6;">
      Tap the button below to sign in. The link logs you in automatically — no password needed.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
      <tr><td style="background:#111111;border-radius:12px;text-align:center;">
        <a href="${confirmUrl}" style="display:block;padding:15px 24px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">
          Open ProTankr &#8594;
        </a>
      </td></tr>
    </table>
    <div style="border-top:1px solid #e5e5e5;padding-top:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#aaaaaa;margin-bottom:16px;">Save it to your home screen</div>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
        <tr><td style="font-size:12px;font-weight:700;color:#444444;padding-bottom:4px;">Outlook</td></tr>
        <tr><td style="font-size:12px;color:#888888;line-height:1.8;">
          Tap the <span style="color:#333333;font-weight:600;">&#8943;</span> menu in the top-right corner &rsaquo; choose <span style="color:#333333;font-weight:600;">Open in browser</span>. Then follow the steps below for your device.
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
        <tr><td style="font-size:12px;font-weight:700;color:#444444;padding-bottom:4px;">Android / Chrome</td></tr>
        <tr><td style="font-size:12px;color:#888888;line-height:1.8;">
          Tap the three-dot menu &rsaquo; <span style="color:#333333;font-weight:600;">Add to Home screen</span> &rsaquo; choose <span style="color:#333333;font-weight:600;">Install app</span>.
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="font-size:12px;font-weight:700;color:#444444;padding-bottom:4px;">iPhone / Safari</td></tr>
        <tr><td style="font-size:12px;color:#888888;line-height:1.8;">
          Must be opened in <span style="color:#333333;font-weight:600;">Safari</span> — if this email opened in Gmail or another app, copy the link and paste it into Safari first. Then tap <span style="color:#333333;font-weight:600;">Share</span> &rsaquo; <span style="color:#333333;font-weight:600;">Add to Home Screen</span>.
        </td></tr>
      </table>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0 0;border-top:1px solid #e5e5e5;">
    <p style="margin:0 0 6px;font-size:11px;color:#aaaaaa;line-height:1.6;">
      This link expires in 24 hours and works only once. If you didn't expect this, you can safely ignore it.
    </p>
    <p style="margin:0 0 4px;font-size:11px;color:#aaaaaa;">Button not working? Copy and paste into your browser:</p>
    <a href="${confirmUrl}" style="font-size:11px;color:#888888;word-break:break-all;overflow-wrap:break-word;">${confirmUrl}</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
