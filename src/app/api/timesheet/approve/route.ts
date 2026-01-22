// src/app/api/timesheet/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
  getDirectReports,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const manager = await getOrgUserByClickUpId(String(session.user.id));
    if (!manager) {
      return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
    }

    const roles = await getUserRoles(manager.id);
    const isAdmin = roles.includes("OWNER") || roles.includes("ADMIN");

    if (!isAdmin) {
      return NextResponse.json({ error: "Manager role required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "");
    const weekStart = String(body.weekStart || "");

    if (!userId || !weekStart) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const reports = await getDirectReports(manager.id);
    if (!reports.includes(userId)) {
      return NextResponse.json(
        { error: "Not authorized to approve this user" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("weekly_timesheet_status")
      .update({
        status: "APPROVED",
        approved_by: manager.id,
        approved_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .eq("status", "LOCKED")
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: "Approval failed or already approved" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, row: data });
  } catch (err: any) {
    console.error("approve error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
