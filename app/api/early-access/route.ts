// app/api/early-access/route.ts
//
// Sends a plain notification email (via the same Resend setup already used
// by app/api/admin/invite/route.ts) whenever someone submits the
// "Request Early Access" form on /get-the-app. No DB write, no auth --
// this is a public marketing-site contact form, not an app feature.
//
// Required env vars (already configured in Vercel for the invite route):
//   RESEND_API_KEY
//   INVITE_FROM_EMAIL   (verified sender, e.g. noreply@protankr.com)

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const NOTIFY_TO = "sethnperry@gmail.com";

async function sendEarlyAccessEmail(fields: {
  name: string;
  email: string;
  company: string;
  fleetSize: string;
  message: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [NOTIFY_TO],
      reply_to: fields.email,
      subject: `Early access request — ${fields.name}`,
      html: buildEmailHtml(fields),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const company = String(body.company ?? "").trim();
    const fleetSize = String(body.fleetSize ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    await sendEarlyAccessEmail({ name, email, company, fleetSize, message });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[early-access] error:", e?.message ?? e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(fields: { name: string; email: string; company: string; fleetSize: string; message: string }): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 0;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#999;width:120px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:14px;color:#111;">${escapeHtml(value)}</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New early access request</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td style="padding:0 0 20px;border-bottom:1px solid #e5e5e5;">
    <div style="font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#111111;">New Early Access Request</div>
  </td></tr>
  <tr><td style="padding:20px 0;">
    <table cellpadding="0" cellspacing="0" width="100%">
      ${row("Name", fields.name)}
      ${row("Email", fields.email)}
      ${row("Company", fields.company)}
      ${row("Fleet size", fields.fleetSize)}
    </table>
    ${fields.message
      ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e5e5;">
           <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#999;margin-bottom:6px;">Message</div>
           <div style="font-size:14px;color:#111;line-height:1.6;white-space:pre-wrap;">${escapeHtml(fields.message)}</div>
         </div>`
      : ""}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
