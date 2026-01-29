// FILE: src/app/api/approvals/pending/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: viewer } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!viewer) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const { data: roles } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", viewer.id);

  const isOwner = roles?.some(r => r.role === "OWNER");
  const isManager = roles?.some(r => r.role === "MANAGER");

  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = supabaseAdmin
    .from("weekly_timesheet_status")
    .select(`
      user_id,
      week_start,
      submitted_at,
      org_users (
        id,
        name,
        reporting_manager_id
      )
    `)
    .eq("status", "SUBMITTED");

  if (isManager && !isOwner) {
    query = query.eq("org_users.reporting_manager_id", viewer.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const approvals =
    data?.map((r: any) => ({
      user_id: r.user_id,
      user_name: r.org_users?.name,
      week_start: r.week_start,
      submitted_at: r.submitted_at,
    })) || [];

  return NextResponse.json({ approvals });
}
