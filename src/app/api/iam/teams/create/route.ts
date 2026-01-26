import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId, getUserRoles } from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owner = await getOrgUserByClickUpId(String(session.user.id));
  if (!owner) return NextResponse.json({ error: "Not provisioned" }, { status: 403 });

  const roles = await getUserRoles(owner.id);
  if (!roles.includes("OWNER")) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Team name required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ team: data });
}
