// src/app/api/approvals/timesheets/route.ts

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: manager } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!manager) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from("timesheet_approvals")
    .select(`
      id,
      week_start,
      week_end,
      status,
      org_users (
        id,
        name,
        email
      )
    `)
    .eq("manager_user_id", manager.id)
    .eq("status", "PENDING");

  return NextResponse.json({ approvals: data || [] });
}
