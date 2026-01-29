// FILE: src/app/api/approvals/timesheets/action/route.ts

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { approvalId, action, comment } = await req.json();

  if (!approvalId || !["APPROVE", "REJECT"].includes(action)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: manager } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!manager) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  // Fetch approval row to validate state + ownership
  const { data: approval } = await supabaseAdmin
    .from("timesheet_approvals")
    .select("id, user_id, week_start, status")
    .eq("id", approvalId)
    .eq("manager_user_id", manager.id)
    .maybeSingle();

  if (!approval || approval.status !== "PENDING") {
    return NextResponse.json(
      { error: "Approval not found or already processed" },
      { status: 409 }
    );
  }

  // Update approval record
  await supabaseAdmin
    .from("timesheet_approvals")
    .update({
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      manager_comment: comment || null,
      acted_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .throwOnError();

  // Update timesheet status (SOURCE OF TRUTH)
  await supabaseAdmin
    .from("weekly_timesheet_status")
    .update({
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      approved_by: action === "APPROVE" ? manager.id : null,
      approved_at: action === "APPROVE" ? new Date().toISOString() : null,
    })
    .eq("user_id", approval.user_id)
    .eq("week_start", approval.week_start)
    .eq("status", "SUBMITTED")
    .throwOnError();

  return NextResponse.json({ ok: true });
}
