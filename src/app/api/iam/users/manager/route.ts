// src/app/api/iam/users/manager/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * POST /api/iam/users/manager
 *
 * Body:
 * {
 *   userId: string,       // org_users.id (consultant)
 *   managerId?: string   // org_users.id (manager) | null to clear
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

  const body = await req.json().catch(() => ({}));
  const { userId, managerId } = body || {};

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (managerId && userId === managerId) {
    return NextResponse.json(
      { error: "User cannot be their own manager" },
      { status: 400 }
    );
  }

  /* -------------------------------------------
     Resolve viewer
  -------------------------------------------- */
  const { data: viewer } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!viewer) {
    return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
  }

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
     Prevent circular hierarchy
  -------------------------------------------- */
  if (managerId) {
    let current = managerId;

    while (current) {
      if (current === userId) {
        return NextResponse.json(
          { error: "Circular manager relationship detected" },
          { status: 409 }
        );
      }

      const { data: parent } = await supabaseAdmin
        .from("org_hierarchy")
        .select("manager_id")
        .eq("user_id", current)
        .maybeSingle();

      current = parent?.manager_id || null;
    }
  }

  /* -------------------------------------------
     Upsert hierarchy
  -------------------------------------------- */
  if (managerId) {
    await supabaseAdmin
      .from("org_hierarchy")
      .upsert(
        {
          user_id: userId,
          manager_id: managerId,
        },
        { onConflict: "user_id" }
      )
      .throwOnError();
  } else {
    await supabaseAdmin
      .from("org_hierarchy")
      .delete()
      .eq("user_id", userId)
      .throwOnError();
  }

  return NextResponse.json({ ok: true });
}
