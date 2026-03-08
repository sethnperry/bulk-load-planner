// app/api/admin/invite/route.ts
//
// POST { email, companyId, role, companyName }
// - Verifies the caller is an authenticated admin of that company
// - If user already exists → adds them to user_companies, no email sent
// - If new user → calls inviteUserByEmail with redirectTo pointing at /auth/confirm
//   so the Supabase magic link drops the user on our confirm page, which
//   exchanges the token and redirects straight to /profile.
//
// IMPORTANT: To make Supabase send *your* email template instead of its default,
// go to Supabase Dashboard → Auth → Email Templates → Invite and paste the HTML
// from buildInviteEmailHtml() below, using {{ .ConfirmationURL }} as the link.
// That's the cleanest path.  The route still sets redirectTo correctly regardless.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

export const runtime = "nodejs";

// ─── Admin Supabase client ────────────────────────────────────────────────────
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Verify caller is an authenticated admin of the given company ─────────────
async function verifyAdmin(
  req: NextRequest,
  admin: ReturnType<typeof getAdmin>,
  companyId: string,
): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: uc } = await admin
    .from("user_companies")
    .select("role")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();
  return uc?.role === "admin" ? user.id : null;
}

// ─── POST /api/admin/invite ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, companyId, role = "driver" } = body as {
      email: string; companyId: string; role?: string;
    };

    if (!email || !companyId) {
      return NextResponse.json({ error: "email and companyId are required." }, { status: 400 });
    }

    const admin = getAdmin();

    // 1. Verify caller is an admin
    const callerId = await verifyAdmin(req, admin, companyId);
    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // 2. Resolve company name for the email
    const { data: co } = await admin
      .from("companies")
      .select("company_name")
      .eq("company_id", companyId)
      .maybeSingle();
    const companyName = co?.company_name ?? "your company";

    // 3. The confirm URL — Supabase will append ?token_hash=xxx&type=invite
    //    Our /auth/confirm page exchanges the token and redirects to /profile.
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
      ?? "https://protankr.vercel.app";
    const redirectTo = `${origin}/auth/confirm`;

    // 4. Check if user already exists in auth.users
    //    listUsers with a filter isn't supported in all SDK versions;
    //    inviteUserByEmail returns a 422 if the user already exists — we catch that.
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { company_id: companyId, role },
      });

    if (inviteError) {
      const msg = inviteError.message ?? "";
      // "User already registered" → just add them to the company quietly
      if (msg.toLowerCase().includes("already") || inviteError.status === 422) {
        // Find existing user by email via a workaround
        const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = existingList?.users?.find(
          u => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (existing) {
          await admin.from("user_companies").upsert(
            { user_id: existing.id, company_id: companyId, role },
            { onConflict: "user_id,company_id" }
          );
          return NextResponse.json({ ok: true, existing: true });
        }
      }
      throw inviteError;
    }

    // 5. Pre-create the user_companies row so it's there when they first log in.
    //    inviteData.user.id is the new user's UUID.
    if (inviteData?.user?.id) {
      await admin.from("user_companies").upsert(
        { user_id: inviteData.user.id, company_id: companyId, role },
        { onConflict: "user_id,company_id" }
      );
    }

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    console.error("[invite] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}

// ─── Invite email HTML (paste into Supabase Dashboard → Auth → Email Templates → Invite)
// Replace "{{ .ConfirmationURL }}" with the actual URL variable Supabase provides.
//
// export function buildInviteEmailHtml(confirmUrl: string, companyName: string): string { ... }
//
// Full template for Supabase Dashboard (uses {{ .ConfirmationURL }} token):
export function getSupabaseEmailTemplate(): string {
  return /* html */`
<!DOCTYPE html>
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

  <!-- Header -->
  <tr><td style="background:#1c1c1c;padding:28px 32px 22px;border-bottom:1px solid #2a2a2a;">
    <div style="font-size:22px;font-weight:800;color:#f97316;letter-spacing:-0.5px;">⛽ ProTankr</div>
    <div style="font-size:13px;color:#666;margin-top:3px;">Bulk Liquid Load Planner</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">

    <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#f0f0f0;">
      You've been added to your company's ProTankr account.
    </p>

    <p style="margin:0 0 24px;font-size:14px;color:#999;line-height:1.65;">
      ProTankr is a mobile load planning tool for fuel drivers.
      It handles compartment-level fuel planning, DOT hazmat placarding,
      and real-time weight calculations — all from your phone.
    </p>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#f97316;border-radius:8px;">
        <a href="{{ .ConfirmationURL }}"
           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
          Set Up Your Profile →
        </a>
      </td></tr>
    </table>

    <!-- What to fill in first -->
    <div style="background:#222;border-radius:8px;padding:18px 20px;margin-bottom:22px;border-left:3px solid #f97316;">
      <div style="font-size:12px;font-weight:700;color:#ccc;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px;">
        Fill these in when you arrive at your profile
      </div>
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

    <!-- Quick start -->
    <div style="background:#1e1e1e;border-radius:8px;padding:18px 20px;">
      <div style="font-size:12px;font-weight:700;color:#ccc;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.6px;">
        Getting started with the Load Planner
      </div>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td valign="top" style="width:28px;padding-bottom:10px;">
            <div style="background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;">1</div>
          </td>
          <td style="font-size:13px;color:#999;line-height:1.5;padding-bottom:10px;">
            Tap the button above to log in and finish setting up your profile.
          </td>
        </tr>
        <tr>
          <td valign="top" style="width:28px;padding-bottom:10px;">
            <div style="background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;">2</div>
          </td>
          <td style="font-size:13px;color:#999;line-height:1.5;padding-bottom:10px;">
            Open the app and go to the <strong style="color:#ccc;">Load Planner</strong>. Select your truck and trailer from the Equipment section.
          </td>
        </tr>
        <tr>
          <td valign="top" style="width:28px;padding-bottom:10px;">
            <div style="background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;">3</div>
          </td>
          <td style="font-size:13px;color:#999;line-height:1.5;padding-bottom:10px;">
            Choose a terminal and tap the products you're loading. The planner fills compartments, tracks weight, and generates your DOT placards automatically.
          </td>
        </tr>
        <tr>
          <td valign="top" style="width:28px;">
            <div style="background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;">4</div>
          </td>
          <td style="font-size:13px;color:#999;line-height:1.5;">
            When you're done, tap <strong style="color:#ccc;">Save Load</strong> to record it. You can access saved loads and Bill of Lading info from the load history.
          </td>
        </tr>
      </table>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:18px 32px;border-top:1px solid #252525;background:#161616;">
    <p style="margin:0;font-size:11px;color:#444;line-height:1.7;">
      This link expires in 24 hours and works only once.<br/>
      If you didn't expect this, you can safely ignore it.<br/>
      Button not working? Copy and paste this link:<br/>
      <a href="{{ .ConfirmationURL }}" style="color:#f97316;word-break:break-all;font-size:11px;">{{ .ConfirmationURL }}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
  `.trim();
}
