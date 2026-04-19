import { NextRequest, NextResponse } from "next/server";
import { client, writeClient } from "@/sanity/lib/client";
import { pendingArticlesQuery } from "@/sanity/lib/queries";

function checkAuth(req: NextRequest): boolean {
  const secret = req.headers.get("x-admin-secret") || req.nextUrl.searchParams.get("secret");
  return !!process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const articles = await client.fetch(pendingArticlesQuery);
    return NextResponse.json({ articles });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await req.json();
  if (!id || !["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "Invalid request — need id and action (approved|rejected)" }, { status: 400 });
  }

  try {
    await writeClient.patch(id).set({ reviewStatus: action }).commit();
    return NextResponse.json({ ok: true, id, reviewStatus: action });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/review] Sanity patch failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
