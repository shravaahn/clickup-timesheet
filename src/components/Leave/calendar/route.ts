// FILE: src/app/api/leave/calendar/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId } from "@/lib/db";

/**
 * GET /api/leave/calendar?year=2026
 *
 * Returns:
 * - Company holidays (country + BOTH)
 * - Approved leave ranges for the user
 */
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

    const year =
      Number(req.nextUrl.searchParams.get("year")) ||
      new Date().getFullYear();

    /* -------------------------------
       1. Holidays (country + BOTH)
    -------------------------------- */
    const { data: holidays, error: holidayErr } = await supabaseAdmin
      .from("holidays")
      .select("date, name, country")
      .eq("year", year)
      .or(`country.eq.${orgUser.country},country.eq.BOTH`);

    if (holidayErr) {
      return NextResponse.json(
        { error: "Failed to fetch holidays", details: holidayErr.message },
        { status: 500 }
      );
    }

    /* -------------------------------
       2. Approved leave ranges
    -------------------------------- */
    const { data: leaves, error: leaveErr } = await supabaseAdmin
      .from("leave_requests")
      .select(`
        id,
        start_date,
        end_date,
        leave_types (
          code,
          name,
          paid
        )
      `)
      .eq("user_id", orgUser.id)
      .eq("status", "APPROVED");

    if (leaveErr) {
      return NextResponse.json(
        { error: "Failed to fetch leaves", details: leaveErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      year,
      holidays: holidays || [],
      leaves:
        leaves?.map(l => {
          const lt = Array.isArray(l.leave_types)
            ? l.leave_types[0]
            : null;

          return {
            id: l.id,
            start_date: l.start_date,
            end_date: l.end_date,
            type: lt?.code || null,
            paid: lt?.paid ?? false,
          };
        }) || [],
    });
  } catch (err: any) {
    console.error("leave calendar error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}