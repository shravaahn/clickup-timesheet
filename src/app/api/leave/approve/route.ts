// src/app/api/leave/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
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

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.requestId || "");
    const action = String(body.action || "").toUpperCase(); // APPROVE / REJECT

    if (!requestId || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { data: request } = await supabaseAdmin
      .from("leave_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const reports = await getDirectReports(manager.id);
    if (!reports.includes(request.user_id)) {
      return NextResponse.json(
        { error: "Not authorized to act on this request" },
        { status: 403 }
      );
    }

    // Update request status
    await supabaseAdmin
      .from("leave_requests")
      .update({
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        decided_by: manager.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // Deduct balance only on approval
    if (action === "APPROVE") {
      const days =
        (new Date(request.end_date).getTime() -
          new Date(request.start_date).getTime()) /
          (1000 * 60 * 60 * 24) +
        1;

      await supabaseAdmin
        .from("leave_balances")
        .update({
          used_days: supabaseAdmin.rpc("increment", {
            x: days,
          }),
        })
        .eq("user_id", request.user_id)
        .eq("leave_type_id", request.leave_type_id)
        .eq("year", new Date(request.start_date).getFullYear());
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("leave approval error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
