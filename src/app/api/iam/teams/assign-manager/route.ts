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

  const { error } = await supabaseAdmin
    .from("teams")
    .update({ manager_user_id: managerUserId })
    .eq("id", teamId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
