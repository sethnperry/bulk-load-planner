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
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111111;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:32px 36px 24px;border-bottom:1px solid rgba(255,255,255,0.07);">
    <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">Pro<span style="color:#d48a0a;">Tankr</span></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 36px 0;">

    <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:6px;line-height:1.4;">
      You've been added to<br><span style="color:#d48a0a;">${companyName}</span> on ProTankr.
    </div>

    <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.50);line-height:1.6;">
      ProTankr helps you verify your load before you cross a scale —
      tracking weight, compartment fills, and environmental variables
      so overweight surprises stay in the past.
    </p>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr><td style="background:#d48a0a;border-radius:12px;">
        <a href="${confirmUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
          Set Up Your Account &#8594;
        </a>
      </td></tr>
    </table>

    <!-- What's in the app -->
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 22px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:14px;">What's in the app</div>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td valign="top" style="width:14px;padding-top:5px;"><div style="width:6px;height:6px;border-radius:50%;background:#d48a0a;"></div></td>
          <td style="font-size:13px;color:rgba(255,255,255,0.70);line-height:1.5;padding-bottom:10px;padding-left:8px;"><strong style="color:rgba(255,255,255,0.85);">Load verification</strong> — check your weight before the scale, accounting for API, temperature, and density shifts.</td>
        </tr>
        <tr>
          <td valign="top" style="width:14px;padding-top:5px;"><div style="width:6px;height:6px;border-radius:50%;background:#d48a0a;"></div></td>
          <td style="font-size:13px;color:rgba(255,255,255,0.70);line-height:1.5;padding-bottom:10px;padding-left:8px;"><strong style="color:rgba(255,255,255,0.85);">Terminal access &amp; credentials</strong> — your terminal cards, permits, and expiration dates in one place.</td>
        </tr>
        <tr>
          <td valign="top" style="width:14px;padding-top:5px;"><div style="width:6px;height:6px;border-radius:50%;background:#d48a0a;"></div></td>
          <td style="font-size:13px;color:rgba(255,255,255,0.70);line-height:1.5;padding-left:8px;"><strong style="color:rgba(255,255,255,0.85);">Shared equipment</strong> — track equipment status, organize and centralize documentation to stay in sync with your team.</td>
        </tr>
      </table>
    </div>

    <!-- Profile fields -->
    <div style="background:rgba(212,138,10,0.07);border:1px solid rgba(212,138,10,0.20);border-radius:12px;padding:16px 20px;margin-bottom:32px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:rgba(212,138,10,0.80);margin-bottom:10px;">Fill in when you set up your profile</div>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size:12px;font-weight:700;color:#d48a0a;width:130px;padding:3px 0;">Display Name</td>
          <td style="font-size:12px;color:rgba(255,255,255,0.50);">How your name appears to dispatch</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:700;color:#d48a0a;padding:3px 0;">Employee Number</td>
          <td style="font-size:12px;color:rgba(255,255,255,0.50);">Your company Employee Number (optional)</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:700;color:#d48a0a;padding:3px 0;">Division</td>
          <td style="font-size:12px;color:rgba(255,255,255,0.50);">Your operating division or fleet group</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:700;color:#d48a0a;padding:3px 0;">Region</td>
          <td style="font-size:12px;color:rgba(255,255,255,0.50);">e.g. Southeast, Gulf Coast, Southwest</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:700;color:#d48a0a;padding:3px 0;">Local Area</td>
          <td style="font-size:12px;color:rgba(255,255,255,0.50);">e.g. Tampa Bay, Houston Metro</td>
        </tr>
      </table>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:0 36px 28px;">
    <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
      This link expires in 24 hours and works only once. If you didn't expect this email, you can safely ignore it.
    </p>
    <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.25);">Button not working? Copy and paste:</p>
    <a href="${confirmUrl}" style="font-size:11px;color:rgba(212,138,10,0.60);word-break:break-all;">${confirmUrl}</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
