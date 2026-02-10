// src/app/api/leave/calendar/route.ts

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

    if (!orgUser.country) {
      return NextResponse.json(
        { error: "Country not set. Contact admin." },
        { status: 409 }
      );
    }

    const start = req.nextUrl.searchParams.get("start");
    const end = req.nextUrl.searchParams.get("end");
    const baseDate = start
      ? new Date(start)
      : end
        ? new Date(end)
        : new Date();
    const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    /* -------------------------
       Fetch leave requests
    -------------------------- */
    const { data: leaves } = await supabaseAdmin
      .from("leave_requests")
      .select(`
        id,
        start_date,
        end_date,
        status,
        leave_types (
          code,
          paid
        )
      `)
      .eq("user_id", orgUser.id)
      .in("status", ["APPROVED", "PENDING"])
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart);

    /* -------------------------
       Fetch holidays
    -------------------------- */
    const { data: holidays, error: holidayErr } = await supabaseAdmin
      .from("holidays")
      .select("date, name, country")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    const results: any[] = [];

    /* -------------------------
       Normalize holidays
    -------------------------- */
    for (const h of holidays || []) {
      results.push({
        type: "HOLIDAY",
        date: h.date,
        name: h.name,
        status: "APPROVED",
      });
    }

    /* -------------------------
       Normalize leaves
    -------------------------- */
    for (const l of leaves || []) {
      const leaveType = Array.isArray(l.leave_types)
        ? l.leave_types[0]
        : l.leave_types;

      const startDate = new Date(l.start_date);
      const endDate = new Date(l.end_date);

      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dateStr = d.toISOString().slice(0, 10);

        results.push({
          type: "LEAVE",
          date: dateStr,
          leave_type: leaveType?.code || "LEAVE",
          paid: leaveType?.paid ?? false,
          status: l.status,
        });
      }
    }

    return NextResponse.json({ calendar: results });
  } catch (err: any) {
    console.error("leave calendar error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
