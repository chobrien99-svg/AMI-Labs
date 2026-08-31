import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

// Signed over the address alone: an unsubscribe link must keep working in a digest
// someone opens months later, so unlike the confirmation link it never expires.
// The "unsubscribe:" prefix is domain separation — it stops a confirmation token
// being replayed here (and vice versa) even though both use CONFIRM_SECRET.
function makeToken(email: string, secret: string) {
  return createHmac("sha256", secret).update(`unsubscribe:${email}`).digest("hex");
}

function verify(email: string, token: string, secret: string) {
  const expected = makeToken(email, secret);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

// Mark the contact unsubscribed in the Resend audience. Returns true on success.
async function unsubscribeContact(email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) return false;

  const res = await fetch(
    `https://api.resend.com/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unsubscribed: true }),
    }
  );

  if (!res.ok) {
    console.error("Resend unsubscribe error:", res.status, await res.text());
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const secret = process.env.CONFIRM_SECRET;
  if (!secret) {
    return page("Configuration error", "The unsubscribe service is not configured.");
  }
  if (!email || !verify(email, token, secret)) {
    return page(
      "Invalid link",
      "This unsubscribe link is not valid. Reply to any digest and we will remove you by hand."
    );
  }

  if (!(await unsubscribeContact(email))) {
    return page(
      "Something went wrong",
      "We could not process the request. Reply to any digest and we will remove you by hand."
    );
  }

  return page(
    "You're unsubscribed",
    `${escapeHtml(email)} will no longer receive the AMI Labs digest.`
  );
}

// RFC 8058 one-click. Gmail and Apple Mail POST here when the reader uses the
// unsubscribe control in the mail client, and expect a 2xx with no interaction.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const secret = process.env.CONFIRM_SECRET;
  if (!secret || !email || !verify(email, token, secret)) {
    return new NextResponse(null, { status: 400 });
  }

  const ok = await unsubscribeContact(email);
  return new NextResponse(null, { status: ok ? 200 : 502 });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function page(title: string, message: string) {
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
