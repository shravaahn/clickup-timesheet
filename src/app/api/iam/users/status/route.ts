// src/app/api/iam/users/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { ensureOwnerByEnv } from "@/lib/iam";

/**
 * POST /api/iam/users/status
 *
 * Body:
 * {
 *   userId: string,     // org_users.id
 *   isActive: boolean
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
  const { userId, isActive } = body || {};

  if (!userId || typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "Missing or invalid userId / isActive" },
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
     Prevent disabling last OWNER
  -------------------------------------------- */
  if (!isActive) {
    const { data: owners } = await supabaseAdmin
      .from("org_roles")
      .select("user_id")
      .eq("role", "OWNER");

    if ((owners || []).length <= 1) {
      const lastOwnerId = owners?.[0]?.user_id;
      if (lastOwnerId === userId) {
        return NextResponse.json(
          { error: "Cannot deactivate the last OWNER" },
          { status: 409 }
        );
      }
    }
  }

  /* -------------------------------------------
     Update status
  -------------------------------------------- */
  await supabaseAdmin
    .from("org_users")
    .update({ is_active: isActive })
    .eq("id", userId)
    .throwOnError();

  return NextResponse.json({ ok: true });
}