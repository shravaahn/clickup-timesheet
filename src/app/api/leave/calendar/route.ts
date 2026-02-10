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

    const startParam = req.nextUrl.searchParams.get("start");
    const endParam = req.nextUrl.searchParams.get("end");

    const baseDate = startParam
      ? new Date(startParam)
      : endParam
        ? new Date(endParam)
        : new Date();

    const monthStart = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      1
    )
      .toISOString()
      .slice(0, 10);

    const monthEnd = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth() + 1,
      0
    )
      .toISOString()
      .slice(0, 10);

    const start = startParam || monthStart;
    const end = endParam || monthEnd;

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
      .lte("start_date", end)
      .gte("end_date", start);

    /* -------------------------
       Fetch holidays
    -------------------------- */
    const { data: holidays, error: holidayErr } = await supabaseAdmin
      .from("holidays")
      .select("date, name")
      .eq("year", new Date(start).getFullYear())
      .or(`country.eq.${orgUser.country},country.eq.BOTH`)
      .gte("date", start)
      .lte("date", end);

    if (holidayErr) {
      return NextResponse.json(
        { error: "Failed to fetch holidays", details: holidayErr.message },
        { status: 500 }
      );
    }

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
