// src/app/api/iam/teams/assign-member/route.ts
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

  const { teamId, orgUserId } = await req.json();
  if (!teamId || !orgUserId) {
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

  // Verify user exists and check if they're an OWNER
  const { data: user, error: userError } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("id", orgUserId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if user has OWNER role
  const userRoles = await getUserRoles(orgUserId);
  if (userRoles.includes("OWNER")) {
    return NextResponse.json({ error: "Cannot assign OWNER to a team" }, { status: 400 });
  }

  // Update user's team_id (overwrites any previous assignment)
  const { error: updateError } = await supabaseAdmin
    .from("org_users")
    .update({ team_id: teamId })
    .eq("id", orgUserId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}