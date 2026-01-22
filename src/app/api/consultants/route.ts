// src/app/api/consultants/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * GET /api/consultants
 *
 * Temporary stable implementation:
 * - ADMIN  -> sees all ClickUp team members
 * - USER   -> sees self only
 *
 * NOTE:
 * IAM-based hierarchy (OWNER / ADMIN / REPORTS)
 * will be reintroduced after db.ts stabilizes.
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const token = session?.accessToken || session?.access_token;
  const user = session?.user;

  if (!token || !user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const TEAM_ID = process.env.CLICKUP_TEAM_ID;
  if (!TEAM_ID) {
    return NextResponse.json(
      { error: "Missing CLICKUP_TEAM_ID env" },
      { status: 500 }
    );
  }

  const authHeader = String(token).startsWith("Bearer ")
    ? String(token)
    : `Bearer ${token}`;

  /* -------------------------------------------
     ADMIN: fetch all ClickUp team members
  -------------------------------------------- */
  if (user.is_admin) {
    const r = await fetch(
      `https://api.clickup.com/api/v2/team/${TEAM_ID}`,
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { error: "ClickUp error", details: json || text },
        { status: 502 }
      );
    }

    const members =
      json?.team?.members?.map((m: any) => ({
        id: String(m?.user?.id),
        username: m?.user?.username || m?.user?.email,
        email: m?.user?.email || null,
      })) || [];

    return NextResponse.json({ members });
  }

  /* -------------------------------------------
     CONSULTANT: self only
  -------------------------------------------- */
  return NextResponse.json({
    members: [
      {
        id: String(user.id),
        username: user.username || user.email,
        email: user.email || null,
      },
    ],
  });
}
