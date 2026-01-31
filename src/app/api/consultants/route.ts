// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
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

  // Read scope query parameter
  const scope = req.nextUrl.searchParams.get("scope");

  // =========================
  // OWNER → all active users
  // =========================
  if (roles.includes("OWNER")) {
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("id, email, name, is_active")
      .eq("is_active", true)
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members: data || [] });
  }

  // =========================
  // MANAGER → direct reports OR team users
  // =========================
  if (roles.includes("MANAGER")) {
    // If scope=direct, return only direct reports from org_reporting_managers
    if (scope === "direct") {
      const { data, error } = await supabaseAdmin
        .from("org_reporting_managers")
        .select(`
          consultant_id,
          org_users!org_reporting_managers_consultant_id_fkey (
            id,
            email,
            name,
            is_active
          )
        `)
        .eq("manager_id", viewer.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Extract and filter active users
      const directReports = (data || [])
        .map(row => {
          const user = Array.isArray(row.org_users)
            ? row.org_users[0]
            : row.org_users;
          return user;
        })
        .filter(user => user?.id && user.is_active);

      return NextResponse.json({
        members: directReports,
      });
    }

    // Default: team-based logic (existing behavior)
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
    });
  }

  // =========================
  // CONSULTANT → self
  // =========================
  return NextResponse.json({
    members: [viewer],
  });
}