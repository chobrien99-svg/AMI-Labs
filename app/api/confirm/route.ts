import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

function makeToken(email: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`${email}:${expires}`).digest("hex");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const expires = parseInt(searchParams.get("expires") ?? "0", 10);
  const token = searchParams.get("token") ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://amilabs.xyz";

  const secret = process.env.CONFIRM_SECRET;
  if (!secret) {
    return html("Configuration error", "The confirmation service is not configured.", false);
  }

  // Verify expiry
  if (!expires || Date.now() > expires) {
    return html("Link expired", "This confirmation link has expired. Please subscribe again.", false);
  }

  // Verify HMAC using timing-safe comparison
  const expected = makeToken(email, expires, secret);
  let valid = false;
  try {
    valid = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    valid = false;
  }

  if (!valid) {
    return html("Invalid link", "This confirmation link is invalid.", false);
  }

  // Activate the contact by setting unsubscribed: false
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    return html("Configuration error", "The subscription service is not configured.", false);
  }

  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  if (!res.ok) {
    console.error("Resend confirm error:", res.status, await res.text());
    return html("Something went wrong", "We could not confirm your subscription. Please try again.", false);
  }

  return NextResponse.redirect(`${siteUrl}?subscribed=true`, 302);
}

function html(title: string, message: string, _success: boolean) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title} — AMI Labs</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;">
    <p style="margin:0 0 4px;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;">AMI Labs</p>
    <h1 style="margin:8px 0 16px;font-size:22px;color:#f1f5f9;">${title}</h1>
    <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;">${message}</p>
    <a href="/" style="color:#64748b;font-size:13px;">← Back to site</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
