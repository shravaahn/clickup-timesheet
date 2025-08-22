// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * GET /api/consultants
 * Returns ClickUp members for the configured team/workspace.
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  // Pull the OAuth token from iron-session
  const session: any = await getIronSession(req, res, sessionOptions);
  const token = session?.access_token || session?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const TEAM_ID = process.env.CLICKUP_TEAM_ID;
  if (!TEAM_ID) {
    return NextResponse.json(
      { error: "Missing CLICKUP_TEAM_ID env" },
      { status: 500 }
    );
  }

  const auth = String(token).startsWith("Bearer ") ? String(token) : `Bearer ${token}`;

  // ClickUp team endpoint includes members
  const url = `https://api.clickup.com/api/v2/team/${TEAM_ID}`;
  const r = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text for debugging */ }

  if (!r.ok) {
    return NextResponse.json(
      { error: "ClickUp error", details: json ?? text ?? r.statusText },
      { status: 502 }
    );
  }

  // Normalize members -> { id, username, email }
  const members = (json?.team?.members ?? []).map((m: any) => ({
    id: String(m?.user?.id ?? m?.id ?? ""),
    username: m?.user?.username ?? m?.user?.email ?? "",
    email: m?.user?.email ?? null,
  })).filter((m: any) => m.id);

  return NextResponse.json({ members });
}
