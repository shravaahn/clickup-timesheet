// src/app/api/analytics/availability/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * Availability = 40 - tracked_hours
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

  const availability = Math.max(0, 40 - tracked);

  return NextResponse.json({
    userId,
    weekStart,
    trackedHours: tracked,
    availableHours: availability,
  });
}
