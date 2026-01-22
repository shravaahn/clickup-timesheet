// src/app/api/me/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  getOrgUserByClickUpId,
  getUserRoles,
  getManagerForUser,
  getTeamForUser,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const clickupUserId = String(session.user.id);

  /* -------------------------------------------
     Resolve org user
  -------------------------------------------- */
  const orgUser = await getOrgUserByClickUpId(clickupUserId);
  if (!orgUser) {
    return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
  }

  /* -------------------------------------------
     Resolve IAM roles
  -------------------------------------------- */
  const roles = await getUserRoles(orgUser.id);

  const isOwner = roles.includes("OWNER");
  const isAdmin = isOwner || roles.includes("ADMIN");
  const isManager = roles.includes("MANAGER");

  /* -------------------------------------------
     Resolve hierarchy (optional but useful)
  -------------------------------------------- */
  const managerId = await getManagerForUser(orgUser.id);
  const teamId = await getTeamForUser(orgUser.id);

  return NextResponse.json({
    user: {
      id: clickupUserId,
      email: orgUser.email,
      username: orgUser.name,
      role: isOwner
        ? "OWNER"
        : isAdmin
        ? "ADMIN"
        : isManager
        ? "MANAGER"
        : "CONSULTANT",
      roles,
      is_owner: isOwner,
      is_admin: isAdmin,
      is_manager: isManager,
      manager_id: managerId,
      team_id: teamId,
    },
  });
}
