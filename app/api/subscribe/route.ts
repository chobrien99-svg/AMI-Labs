import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

function makeToken(email: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`${email}:${expires}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const { email, ftjOptIn } = await req.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const secret = process.env.CONFIRM_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://amilabs.xyz";

  if (!apiKey || !audienceId || !secret) {
    console.error("Missing RESEND_API_KEY, RESEND_AUDIENCE_ID, or CONFIRM_SECRET.");
    return NextResponse.json({ error: "Subscription service not configured." }, { status: 503 });
  }

  // Add contact as unsubscribed (unconfirmed) so they won't receive broadcasts yet
  const contactRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, unsubscribed: true }),
  });

  if (!contactRes.ok) {
    const body = await contactRes.json().catch(() => ({}));
    console.error("Resend contact error:", contactRes.status, body);
    return NextResponse.json({ error: "Could not subscribe. Please try again." }, { status: 502 });
  }

  // Build a signed confirmation link valid for 48 hours
  const expires = Date.now() + 48 * 60 * 60 * 1000;
  const token = makeToken(email, expires, secret);
  const confirmUrl = `${siteUrl}/api/confirm?email=${encodeURIComponent(email)}&expires=${expires}&token=${token}`;

  // Send confirmation email
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM_EMAIL || "AMI Labs <digest@amilabs.xyz>",
      to: [email],
      subject: "Confirm your AMI Labs subscription",
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:60px 16px;">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr>
          <td style="padding:0 0 24px;">
            <p style="margin:0;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;">AMI Labs</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#f1f5f9;">Confirm your subscription</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 32px;">
            <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">
              You requested to receive the AMI Labs weekly digest — news, jobs, and updates from the team.
              Click the button below to confirm your email address.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 40px;">
            <a href="${confirmUrl}"
               style="display:inline-block;padding:12px 28px;background:#f1f5f9;color:#0a0a0a;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;">
              Confirm subscription
            </a>
          </td>
        </tr>
        <tr>
          <td>
            <p style="margin:0;font-size:12px;color:#334155;">
              This link expires in 48 hours. If you didn&rsquo;t request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    }),
  });

  if (!emailRes.ok) {
    const body = await emailRes.json().catch(() => ({}));
    console.error("Resend email error:", emailRes.status, body);
    return NextResponse.json(
      { error: `Confirmation email failed (${emailRes.status}): ${JSON.stringify(body)}` },
      { status: 502 }
    );
  }

  // Optionally add to The French Tech Journal audience
  if (ftjOptIn) {
    const ftjAudienceId = process.env.RESEND_FTJ_AUDIENCE_ID;
    if (ftjAudienceId) {
      await fetch(`https://api.resend.com/audiences/${ftjAudienceId}/contacts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, unsubscribed: false }),
      }).catch((e) => console.error("FTJ audience error:", e));
    }
  }

  return NextResponse.json({ ok: true });
}
