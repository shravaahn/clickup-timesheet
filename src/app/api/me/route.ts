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

  const accessToken = session?.accessToken || session?.access_token;
  const sessionUser = session?.user;

  if (!accessToken || !sessionUser?.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  /* -------------------------------------------
     Resolve org user
  -------------------------------------------- */
  const orgUser = await getOrgUserByClickUpId(String(sessionUser.id));

  if (!orgUser) {
    // User authenticated but not yet provisioned in IAM
    return NextResponse.json({
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        username: sessionUser.username,
        provisioned: false,
        roles: [],
        is_admin: false,
        is_owner: false,
        manager_id: null,
        team_id: null,
        country: null,
      },
    });
  }

  /* -------------------------------------------
     Resolve roles (inheritance-aware)
  -------------------------------------------- */
  const roles = await getUserRoles(orgUser.id);
  const isOwner = roles.includes("OWNER");
  const isAdmin = isOwner || roles.includes("ADMIN");

  /* -------------------------------------------
     Resolve hierarchy
  -------------------------------------------- */
  const managerId = await getManagerForUser(orgUser.id);
  const teamId = await getTeamForUser(orgUser.id);

  /* -------------------------------------------
     Final response shape (frontend contract)
  -------------------------------------------- */
  return NextResponse.json({
    user: {
      id: sessionUser.id,                 // ClickUp user id
      org_user_id: orgUser.id,             // Supabase org_users.id
      email: orgUser.email,
      username: orgUser.name,
      country: orgUser.country,
      roles,
      is_admin: isAdmin,
      is_owner: isOwner,
      manager_id: managerId,
      team_id: teamId,
      provisioned: true,
    },
  });
}
