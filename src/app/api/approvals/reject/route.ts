// FILE: src/app/api/approvals/reject/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const { userId, weekStart, reason } = await req.json();

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

  const { data: target } = await supabaseAdmin
    .from("org_users")
    .select("reporting_manager_id")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.reporting_manager_id !== manager.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await supabaseAdmin
    .from("weekly_timesheet_status")
    .update({
      status: "REJECTED",
      rejected_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("status", "SUBMITTED");

  await supabaseAdmin.from("timesheet_approvals").insert({
    user_id: userId,
    week_start: weekStart,
    action: "REJECT",
    action_by: manager.id,
    reason: reason || null,
  });

  return NextResponse.json({ ok: true });
}
