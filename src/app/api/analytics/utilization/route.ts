// src/app/api/analytics/utilization/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * Utilization = tracked_hours / 40 * 100
 * Weekly, per user
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);
  const user = session?.user;

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId") || user.id;
  const weekStart = sp.get("weekStart");

  if (!weekStart) {
    return NextResponse.json(
      { error: "Missing weekStart" },
      { status: 400 }
    );
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4);

  const { data, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("tracked_hours")
    .eq("user_id", userId)
    .gte("date", weekStart)
    .lte("date", weekEnd.toISOString().slice(0, 10));

  if (error) {
    return NextResponse.json(
      { error: "Failed to load tracked hours", details: error.message },
      { status: 500 }
    );
  }

  const tracked =
    (data || []).reduce(
      (sum, r) => sum + Number(r.tracked_hours || 0),
      0
    );

  const utilization = Math.round((tracked / 40) * 1000) / 10;

  return NextResponse.json({
    userId,
    weekStart,
    trackedHours: tracked,
    utilizationPercent: utilization,
  });
}
