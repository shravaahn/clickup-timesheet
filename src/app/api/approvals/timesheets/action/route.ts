// src/app/api/approvals/timesheets/action/route.ts

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const { approvalId, action, comment } = await req.json();

  if (!approvalId || !action) {
    return NextResponse.json({ error: "Missing input" }, { status: 400 });
  }

  const { data: manager } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!manager) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  await supabaseAdmin
    .from("timesheet_approvals")
    .update({
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      manager_comment: comment || null,
      acted_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("manager_user_id", manager.id)
    .throwOnError();

  return NextResponse.json({ ok: true });
}
