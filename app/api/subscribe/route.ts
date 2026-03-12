import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    console.error("RESEND_API_KEY or RESEND_AUDIENCE_ID not set.");
    return NextResponse.json({ error: "Subscription service not configured." }, { status: 503 });
  }

  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, unsubscribe: false }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Resend error:", res.status, body);
    return NextResponse.json({ error: "Could not subscribe. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
