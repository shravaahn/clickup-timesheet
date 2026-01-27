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

  let query = supabaseAdmin
    .from("teams")
    .select(`
      id,
      name,
      manager_user_id,
      manager:org_users!teams_manager_user_id_fkey (
        id,
        name,
        email
      )
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

  // Fetch all members for each team
  const teamsWithMembers = await Promise.all(
    teams.map(async (team) => {
      const { data: members, error: membersError } = await supabaseAdmin
        .from("org_users")
        .select("id, name, email")
        .eq("team_id", team.id);

      if (membersError) {
        console.error(`Error fetching members for team ${team.id}:`, membersError);
      }

      return {
        id: team.id,
        name: team.name,
        manager_user_id: team.manager_user_id,
        manager: team.manager,
        members: members || []
      };
    })
  );

  return NextResponse.json({ teams: teamsWithMembers });
}