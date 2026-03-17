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

    if (existing) {
      // User exists — generate a fresh magic link so they can log in
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        throw new Error(linkErr?.message ?? "Failed to generate login link.");
      }
      confirmUrl = linkData.properties.action_link;

      // Ensure they're in the company (re-invite may change role)
      await admin.from("user_companies").upsert(
        { user_id: existing.id, company_id: companyId, role },
        { onConflict: "user_id,company_id" }
      );

      // Set active_company_id so the app knows which company to load
      await admin.from("user_settings").upsert(
        { user_id: existing.id, active_company_id: companyId },
        { onConflict: "user_id" }
      );
    } else {
      // New user — create account via invite
      const { data: inviteData, error: inviteErr } =
        await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { company_id: companyId, role },
        });
      if (inviteErr) throw inviteErr;

      // Generate the actual confirm link (inviteUserByEmail sends Supabase's default
      // email which we want to suppress — we send our own via Resend instead)
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        throw new Error(linkErr?.message ?? "Failed to generate invite link.");
      }
      confirmUrl = linkData.properties.action_link;

      // Pre-create company membership + active company setting
      if (inviteData?.user?.id) {
        await admin.from("user_companies").upsert(
          { user_id: inviteData.user.id, company_id: companyId, role },
          { onConflict: "user_id,company_id" }
        );
        await admin.from("user_settings").upsert(
          { user_id: inviteData.user.id, active_company_id: companyId },
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
<body style="margin:0;padding:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111111;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:28px 36px 22px;border-bottom:1px solid rgba(255,255,255,0.07);">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td valign="middle">
          <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">ProTankr</div>
        </td>
        <td valign="middle" align="right">
          <svg width="36" height="33" viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg">
            <path d="M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z" fill="white"/>
          </svg>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 36px 28px;">

    <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:8px;line-height:1.4;">
      You've been added to<br><span style="color:rgba(255,255,255,0.70);">${companyName}</span>.
    </div>

    <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;">
      Tap the button below to sign in. The link logs you in automatically — no password needed.
    </p>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
      <tr><td style="background:#ffffff;border-radius:12px;">
        <a href="${confirmUrl}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#111111;text-decoration:none;letter-spacing:0.3px;">
          Open ProTankr &#8594;
        </a>
      </td></tr>
    </table>

    <!-- Install instructions -->
    <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,0.28);margin-bottom:18px;">Save it to your home screen</div>

      <!-- Android -->
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;">
        <tr>
          <td style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.60);padding-bottom:4px;">Android / Chrome</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:rgba(255,255,255,0.38);line-height:1.7;">
            Tap the three-dot menu &rsaquo; <span style="color:rgba(255,255,255,0.55);font-weight:600;">Add to Home screen</span> &rsaquo; choose <span style="color:rgba(255,255,255,0.55);font-weight:600;">Install app</span>.
          </td>
        </tr>
      </table>

      <!-- iPhone -->
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.60);padding-bottom:4px;">iPhone / Safari</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:rgba(255,255,255,0.38);line-height:1.7;">
            Must be opened in <span style="color:rgba(255,255,255,0.55);font-weight:600;">Safari</span> — if this email opened in Gmail or another app, copy the link and paste it into Safari first. Then tap the <span style="color:rgba(255,255,255,0.55);font-weight:600;">Share</span> button at the bottom &rsaquo; <span style="color:rgba(255,255,255,0.55);font-weight:600;">Add to Home Screen</span>.
          </td>
        </tr>
      </table>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:0 36px 28px;border-top:1px solid rgba(255,255,255,0.05);">
    <p style="margin:16px 0 6px;font-size:11px;color:rgba(255,255,255,0.18);line-height:1.6;">
      This link expires in 24 hours and works only once. If you didn't expect this, you can safely ignore it.
    </p>
    <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.18);">Button not working? Copy and paste:</p>
    <a href="${confirmUrl}" style="font-size:11px;color:rgba(255,255,255,0.30);word-break:break-all;">${confirmUrl}</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
