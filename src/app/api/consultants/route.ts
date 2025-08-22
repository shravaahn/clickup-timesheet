// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Returns ClickUp team members for the configured team.
 * Env required:
 *  - CLICKUP_TEAM_ID
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const rawToken = session?.access_token || session?.accessToken;
  if (!rawToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const Authorization = String(rawToken).startsWith("Bearer ")
    ? String(rawToken)
    : `Bearer ${rawToken}`;

  const TEAM_ID = process.env.CLICKUP_TEAM_ID;
  if (!TEAM_ID) {
    return NextResponse.json(
      { error: "Server misconfiguration: CLICKUP_TEAM_ID not set" },
      { status: 500 },
    );
  }

  try {
    // ClickUp: GET /team/{team_id}/member
    const url = `https://api.clickup.com/api/v2/team/${TEAM_ID}/member`;
    const r = await fetch(url, {
      headers: { Authorization, Accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { error: "ClickUp error", details: json || text },
        { status: 502 },
      );
    }

    const members =
      (json?.members || json?.team_members || []).map((m: any) => ({
        id: String(m?.user?.id ?? m?.id ?? ""),
        username: m?.user?.username || m?.user?.email || m?.username || "",
        email: m?.user?.email || m?.email || "",
      }));

    return NextResponse.json({ members });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Consultants fetch failed", details: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
