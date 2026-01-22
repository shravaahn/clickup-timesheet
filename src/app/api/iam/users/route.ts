// src/app/api/iam/users/route.ts
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

  const viewer = await getOrgUserByClickUpId(String(session.user.id));
  if (!viewer) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const roles = await getUserRoles(viewer.id);
  if (!roles.includes("OWNER")) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("org_users")
    .select(`
      id,
      clickup_user_id,
      email,
      name,
      country,
      is_active,
      created_at
    `)
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch users", details: error.message },
      { status: 500 }
    );
  }

  // Attach roles
  const userIds = data.map(u => u.id);
  const { data: roleRows } = await supabaseAdmin
    .from("org_roles")
    .select("user_id, role")
    .in("user_id", userIds);

  const rolesByUser: Record<string, string[]> = {};
  for (const r of roleRows || []) {
    if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
    rolesByUser[r.user_id].push(r.role);
  }

  return NextResponse.json({
    users: data.map(u => ({
      ...u,
      roles: rolesByUser[u.id] || [],
    })),
  });
}
