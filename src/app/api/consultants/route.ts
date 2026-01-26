// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  getOrgUserByClickUpId,
  getUserRoles,
  getTeamsForUser,
  getUsersInTeams,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const viewer = await getOrgUserByClickUpId(String(session.user.id));
  if (!viewer) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const roles = await getUserRoles(viewer.id);

  // OWNER → frontend already fetches all users elsewhere
  if (roles.includes("OWNER")) {
    return NextResponse.json({
      members: [],
      scope: "owner",
    });
  }

  // MANAGER → users in their teams only
  if (roles.includes("MANAGER")) {
    const teams = await getTeamsForUser(viewer.id);
    const teamIds = teams.map(t => t.team_id);

    const rows = await getUsersInTeams(teamIds);

    const unique = new Map<string, any>();

    for (const row of rows) {
      const user = Array.isArray(row.org_users)
        ? row.org_users[0]
        : null;

      if (user?.id && user.is_active) {
        unique.set(user.id, user);
      }
    }

    return NextResponse.json({
      members: Array.from(unique.values()),
      scope: "manager",
    });
  }

  // CONSULTANT → self only
  return NextResponse.json({
    members: [viewer],
    scope: "self",
  });
}
