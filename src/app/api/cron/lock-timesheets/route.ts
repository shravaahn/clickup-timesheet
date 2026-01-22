// src/app/api/cron/lock-timesheets/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Locks all OPEN weekly timesheets
 * Intended to run Fridays at 4:00 PM CST
 */
export async function POST() {
  try {
    const now = new Date();

    // Convert to CST (UTC-6, ignoring DST intentionally for business rule)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const cst = new Date(utc - 6 * 60 * 60 * 1000);

    const day = cst.getDay(); // 5 = Friday
    const hour = cst.getHours();

    if (day !== 5 || hour < 16) {
      return NextResponse.json({
        skipped: true,
        reason: "Not Friday 4 PM CST yet",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("weekly_timesheet_status")
      .update({
        status: "LOCKED",
        locked_at: new Date().toISOString(),
      })
      .eq("status", "OPEN")
      .select("user_id, week_start");

    if (error) {
      return NextResponse.json(
        { error: "Lock failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      locked_count: data?.length || 0,
      rows: data,
    });
  } catch (err: any) {
    console.error("auto-lock error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
