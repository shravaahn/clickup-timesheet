// src/app/api/approvals/pending/route.ts
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

  const { data: rows } = await supabaseAdmin
    .from("weekly_timesheet_status")
    .select(`
      user_id,
      week_start,
      submitted_at,
      org_users!inner (
        name,
        reporting_manager_id
      )
    `)
    .eq("status", "SUBMITTED")
    .eq("org_users.reporting_manager_id", viewer.id);

  return NextResponse.json({ pending: rows || [] });
}
