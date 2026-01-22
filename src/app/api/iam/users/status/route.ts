// src/app/api/iam/users/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actor = await getOrgUserByClickUpId(String(session.user.id));
  if (!actor) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const roles = await getUserRoles(actor.id);
  if (!roles.includes("OWNER")) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const orgUserId = String(body.orgUserId || "");
  const isActive = Boolean(body.isActive);

  if (!orgUserId) {
    return NextResponse.json({ error: "Missing orgUserId" }, { status: 400 });
  }

  await supabaseAdmin
    .from("org_users")
    .update({ is_active: isActive })
    .eq("id", orgUserId);

  return NextResponse.json({ ok: true });
}
