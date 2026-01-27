// src/app/api/iam/teams/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId, getUserRoles } from "@/lib/db";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const viewer = await getOrgUserByClickUpId(String(session.user.id));
  if (!viewer) return NextResponse.json({ error: "Not provisioned" }, { status: 403 });

  const roles = await getUserRoles(viewer.id);
  const isOwner = roles.includes("OWNER");
  const isManager = roles.includes("MANAGER");
  const isConsultant = roles.includes("CONSULTANT");

  // 1. Fetch teams
  let query = supabaseAdmin
    .from("teams")
    .select(`
      id,
      name,
      manager_user_id
    `);

  if (!isOwner && isManager) {
    query = query.eq("manager_user_id", viewer.id);
  }

  if (!isOwner && !isManager && isConsultant) {
    query = query.eq("id", viewer.team_id);
  }

  const { data: teams, error: teamsError } = await query;

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  if (!teams) {
    return NextResponse.json({ teams: [] });
  }

  // 2. Fetch all managers for these teams
  const managerIds = Array.from(
    new Set(teams.map(t => t.manager_user_id).filter(Boolean))
  );

  const { data: managers } = managerIds.length
    ? await supabaseAdmin
        .from("org_users")
        .select("id, name, email")
        .in("id", managerIds)
    : { data: [] };

  const managersById = Object.fromEntries((managers || []).map(m => [m.id, m]));

  // 3. Fetch members for each team
  const teamsWithMembers = await Promise.all(
    teams.map(async (team) => {
      const { data: members, error: membersError } = await supabaseAdmin
        .from("org_users")
        .select("id, name, email")
        .eq("team_id", team.id);

      if (membersError) {
        console.error(`Error fetching members for team ${team.id}:`, membersError);
      }

      const manager = team.manager_user_id ? managersById[team.manager_user_id] : null;

      return {
        id: team.id,
        name: team.name,
        manager_user_id: team.manager_user_id,
        manager: manager || null,
        members: members || []
      };
    })
  );

  return NextResponse.json({ teams: teamsWithMembers });
}