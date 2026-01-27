// src/app/api/iam/users/role/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { ensureOwnerByEnv } from "@/lib/iam";

/**
 * POST /api/iam/users/role
 *
 * Body:
 * {
 *   userId: string,        // org_users.id
 *   role: "OWNER" | "ADMIN" | "MANAGER" | "CONSULTANT",
 *   action: "ADD" | "REMOVE"
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
  const { userId, role, action } = body || {};

  if (!userId || !role || !action) {
    return NextResponse.json(
      { error: "Missing userId, role or action" },
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
     Prevent removing last OWNER
  -------------------------------------------- */
  if (role === "OWNER" && action === "REMOVE") {
    const { data: owners } = await supabaseAdmin
      .from("org_roles")
      .select("user_id")
      .eq("role", "OWNER");

    if ((owners || []).length <= 1) {
      return NextResponse.json(
        { error: "At least one OWNER is required" },
        { status: 409 }
      );
    }
  }

  /* -------------------------------------------
     Apply role change
  -------------------------------------------- */
  if (action === "ADD") {
    await supabaseAdmin
      .from("org_roles")
      .insert({ user_id: userId, role })
      .throwOnError();
  }

  if (action === "REMOVE") {
    await supabaseAdmin
      .from("org_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role)
      .throwOnError();
  }

  return NextResponse.json({ ok: true });
}