// src/app/api/leave/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
} from "@/lib/db";

export async function POST(req: NextRequest) {
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

    if (!orgUser.country) {
      return NextResponse.json(
        { error: "Country not set. Contact admin." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const leaveTypeId = String(body.leaveTypeId || "");
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    const reason = String(body.reason || "");

    if (!leaveTypeId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        user_id: orgUser.id,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "PENDING",
        created_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to apply leave", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, request: data });
  } catch (err: any) {
    console.error("leave apply error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}