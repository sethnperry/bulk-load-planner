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
  <title>Welcome to ProTankr</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">

  <tr><td style="background:#1c1c1c;padding:28px 32px 22px;border-bottom:1px solid #2a2a2a;">
    <div style="font-size:22px;font-weight:800;color:#f97316;letter-spacing:-0.5px;">&#9981; ProTankr</div>
    <div style="font-size:13px;color:#666;margin-top:3px;">Bulk Liquid Load Planner</div>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#f0f0f0;">
      You've been added to <span style="color:#f97316;">${companyName}</span> on ProTankr.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#999;line-height:1.65;">
      ProTankr is a mobile load planning tool for fuel drivers — compartment-level fuel planning,
      DOT hazmat placarding, and real-time weight calculations, all from your phone.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#f97316;border-radius:8px;">
        <a href="${confirmUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
          Set Up Your Profile &#8594;
        </a>
      </td></tr>
    </table>

    <div style="background:#222;border-radius:8px;padding:18px 20px;margin-bottom:22px;border-left:3px solid #f97316;">
      <div style="font-size:12px;font-weight:700;color:#ccc;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px;">Fill these in when you arrive at your profile</div>
      <table cellpadding="0" cellspacing="4" width="100%">
        <tr>
          <td style="font-size:12px;font-weight:600;color:#f97316;width:140px;padding:3px 0;">Display Name</td>
          <td style="font-size:12px;color:#888;">How your name appears to dispatchers</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:600;color:#f97316;padding:3px 0;">Employee Number</td>
          <td style="font-size:12px;color:#888;">Used on Bill of Lading and load records</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:600;color:#f97316;padding:3px 0;">Division</td>
          <td style="font-size:12px;color:#888;">Your operating division or fleet group</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:600;color:#f97316;padding:3px 0;">Region</td>
          <td style="font-size:12px;color:#888;">e.g. Southeast, Gulf Coast, Southwest</td>
        </tr>
        <tr>
          <td style="font-size:12px;font-weight:600;color:#f97316;padding:3px 0;">Local Area</td>
          <td style="font-size:12px;color:#888;">e.g. Tampa Bay, Houston Metro</td>
        </tr>
      </table>
    </div>

    <div style="background:#1e1e1e;border-radius:8px;padding:18px 20px;">
      <div style="font-size:12px;font-weight:700;color:#ccc;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px;">Getting started</div>
      <table cellpadding="0" cellspacing="0" width="100%">
        ${[
          ["1", "Tap the button above to log in and finish setting up your profile."],
          ["2", "Open the Load Planner and select your truck and trailer under Equipment."],
          ["3", "Choose a terminal and tap the products you're loading. Compartment fills, weight, and DOT placards are calculated automatically."],
          ["4", "Tap Save Load when done to record it. Load history and Bill of Lading info are available from the loads screen."],
        ].map(([n, text]) => `
        <tr>
          <td valign="top" style="width:28px;padding-bottom:10px;">
            <div style="background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;">${n}</div>
          </td>
          <td style="font-size:13px;color:#999;line-height:1.5;padding-bottom:10px;">${text}</td>
        </tr>`).join("")}
      </table>
    </div>
  </td></tr>

  <tr><td style="padding:18px 32px;border-top:1px solid #252525;background:#161616;">
    <p style="margin:0;font-size:11px;color:#444;line-height:1.7;">
      This link expires in 24 hours and works only once. If you didn't expect this, you can safely ignore it.<br/>
      Button not working? Copy and paste: <a href="${confirmUrl}" style="color:#f97316;word-break:break-all;">${confirmUrl}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
