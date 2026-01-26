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

  let query = supabaseAdmin
    .from("teams")
    .select(`
      id,
      name,
      manager_user_id,
      team_members (
        org_user_id,
        org_users ( id, name, email )
      )
    `);

  if (!isOwner && isManager) {
    query = query.eq("manager_user_id", viewer.id);
  }

  if (!isOwner && !isManager) {
    query = query.eq("team_members.org_user_id", viewer.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ teams: data });
}
