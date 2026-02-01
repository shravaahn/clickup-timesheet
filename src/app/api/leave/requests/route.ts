// src/app/api/leave/requests/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgUser = await getOrgUserByClickUpId(String(session.user.id));
    if (!orgUser) {
      return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select(`
        id,
        start_date,
        end_date,
        status,
        reason,
        created_at,
        leave_types (
          name,
          code,
          paid
        )
      `)
      .eq("user_id", orgUser.id)
      .order("start_date", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch leave requests", details: error.message },
        { status: 500 }
      );
    }

    const requests = (data || []).map(r => {
      const leaveType = Array.isArray(r.leave_types)
        ? r.leave_types[0]
        : r.leave_types;

      return {
        id: r.id,
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
        reason: r.reason,
        created_at: r.created_at,
        leave_type: leaveType?.name || "Leave",
        leave_code: leaveType?.code || "LEAVE",
        paid: leaveType?.paid ?? false,
      };
    });

    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error("leave requests error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
