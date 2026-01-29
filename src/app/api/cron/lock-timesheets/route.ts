// src/app/api/cron/lock-timesheets/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * AUTO-SUBMIT weekly timesheets
 * Friday 11:00 PM CST
 */
export async function POST() {
  try {
    const now = new Date();

    // CST = UTC-6 (business rule, no DST)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const cst = new Date(utc - 6 * 60 * 60 * 1000);

    const day = cst.getDay(); // Friday = 5
    const hour = cst.getHours();

    if (day !== 5 || hour < 23) {
      return NextResponse.json({
        skipped: true,
        reason: "Not Friday 11 PM CST",
      });
    }

    const { data: openRows, error } = await supabaseAdmin
      .from("weekly_timesheet_status")
      .select(`
        user_id,
        week_start,
        org_users!inner (
          reporting_manager_id
        )
      `)
      .eq("status", "OPEN");

    if (error) {
      throw error;
    }

    const validRows =
      openRows?.filter(
        (r: any) =>
          Array.isArray(r.org_users) &&
          r.org_users.length > 0 &&
          r.org_users[0].reporting_manager_id
      ) || [];

    if (validRows.length === 0) {
      return NextResponse.json({ ok: true, submitted: 0 });
    }

    // Update status → SUBMITTED
    const { error: updateErr } = await supabaseAdmin
      .from("weekly_timesheet_status")
      .update({
        status: "SUBMITTED",
        locked_at: now.toISOString(),
        submitted_at: now.toISOString(),
      })
      .in(
        "user_id",
        validRows.map((r: any) => r.user_id)
      )
      .in(
        "week_start",
        validRows.map((r: any) => r.week_start)
      );

    if (updateErr) {
      throw updateErr;
    }

    // Audit log
    await supabaseAdmin.from("timesheet_approvals").insert(
      validRows.map((r: any) => ({
        user_id: r.user_id,
        week_start: r.week_start,
        action: "SUBMIT",
        action_by: r.org_users[0].reporting_manager_id,
      }))
    );

    return NextResponse.json({
      ok: true,
      submitted: validRows.length,
    });
  } catch (err: any) {
    console.error("auto-submit failed", err);
    return NextResponse.json(
      { error: "Auto submit failed", details: String(err) },
      { status: 500 }
    );
  }
}
