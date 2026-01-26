// src/app/api/consultants/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Logged-in org user
  const viewer = await getOrgUserByClickUpId(String(session.user.id));
  if (!viewer) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const roles = await getUserRoles(viewer.id);
  const isOwner = roles.includes("OWNER");
  const isManager = roles.includes("MANAGER");

  /**
   * OWNER: all active users
   * MANAGER: for now, only self (teams come in Phase 2)
   * CONSULTANT: only self
   */

  if (isOwner) {
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("id, email, name")
      .eq("is_active", true)
      .order("name");

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch users", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      members: data.map(u => ({
        id: u.id,
        email: u.email,
        username: u.name,
      })),
    });
  }

  // MANAGER or CONSULTANT → self only (until teams are wired)
  return NextResponse.json({
    members: [
      {
        id: viewer.id,
        email: viewer.email,
        username: viewer.name,
      },
    ],
  });
}
