// src/app/api/iam/teams/assign-manager/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId, getUserRoles } from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const owner = await getOrgUserByClickUpId(String(session.user.id));
  if (!owner) return NextResponse.json({ error: "Not provisioned" }, { status: 403 });

  const roles = await getUserRoles(owner.id);
  if (!roles.includes("OWNER")) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const { teamId, managerUserId } = await req.json();
  if (!teamId || !managerUserId) {
    return NextResponse.json({ error: "Missing inputs" }, { status: 400 });
  }

  // Verify team exists
  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Verify user exists
  const { data: user, error: userError } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("id", managerUserId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify user has MANAGER role and NOT OWNER role
  const managerRoles = await getUserRoles(managerUserId);
  
  if (managerRoles.includes("OWNER")) {
    return NextResponse.json({ error: "Cannot assign OWNER as team manager" }, { status: 409 });
  }

  if (!managerRoles.includes("MANAGER")) {
    return NextResponse.json({ error: "User must have MANAGER role" }, { status: 409 });
  }

  // Update team's manager
  const { error: updateError } = await supabaseAdmin
    .from("teams")
    .update({ manager_user_id: managerUserId })
    .eq("id", teamId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}