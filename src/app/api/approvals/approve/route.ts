// src/app/api/approvals/approve/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);
  const { userId, weekStart } = await req.json();

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

  const { error } = await supabaseAdmin
    .from("weekly_timesheet_status")
    .update({
      status: "APPROVED",
      approved_at: new Date().toISOString(),
      approved_by: manager.id,
    })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("status", "SUBMITTED");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("timesheet_approvals").insert({
    user_id: userId,
    week_start: weekStart,
    action: "APPROVE",
    action_by: manager.id,
  });

  return NextResponse.json({ ok: true });
}
