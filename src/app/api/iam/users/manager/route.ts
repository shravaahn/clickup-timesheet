// src/app/api/iam/users/manager/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { ensureOwnerByEnv } from "@/lib/iam";

/**
 * POST /api/iam/users/manager
 *
 * Assign REPORTING manager (independent of team)
 *
 * Body:
 * {
 *   userId: string,          // org_users.id
 *   managerUserId?: string  // org_users.id | null to clear
 * }
 *
 * OWNER-only
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { userId, managerUserId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (userId === managerUserId) {
    return NextResponse.json(
      { error: "User cannot report to themselves" },
      { status: 400 }
    );
  }

  /* -------------------------------------------
     Resolve viewer
  -------------------------------------------- */
  const { data: viewer } = await supabaseAdmin
    .from("org_users")
    .select("id, email")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!viewer) {
    return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
  }

  // ENV-based OWNER bootstrap
  await ensureOwnerByEnv(viewer);

  /* -------------------------------------------
     OWNER check
  -------------------------------------------- */
  const { data: viewerRoles } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", viewer.id);

  const isOwner = (viewerRoles || []).some(r => r.role === "OWNER");
  if (!isOwner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  /* -------------------------------------------
     Validate manager role (if provided)
  -------------------------------------------- */
  if (managerUserId) {
    const { data: managerRoles } = await supabaseAdmin
      .from("org_roles")
      .select("role")
      .eq("user_id", managerUserId);

    const isManager = (managerRoles || []).some(r => r.role === "MANAGER");
    if (!isManager) {
      return NextResponse.json(
        { error: "Reporting manager must have MANAGER role" },
        { status: 409 }
      );
    }
  }

  /* -------------------------------------------
     Upsert reporting manager
  -------------------------------------------- */
  if (managerUserId) {
    await supabaseAdmin
      .from("org_reporting_managers")
      .upsert(
        {
          user_id: userId,
          manager_user_id: managerUserId,
        },
        { onConflict: "user_id" }
      )
      .throwOnError();
  } else {
    await supabaseAdmin
      .from("org_reporting_managers")
      .delete()
      .eq("user_id", userId)
      .throwOnError();
  }

  return NextResponse.json({ ok: true });
}
