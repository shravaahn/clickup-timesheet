// src/app/api/cron/lock-timesheets/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { syncWeekDailyToClickUp } from "@/lib/clickup";

/**
 * AUTO-SUBMIT weekly timesheets
 * Triggered by Vercel Cron
 * Schedule enforced by vercel.json (Friday 11:00 PM CST)
 *
 * Rules:
 * - Server-only
 * - Idempotent
 * - No timezone logic here
 * - No session / auth
 * - Never touches APPROVED / REJECTED
 * - Syncs tracked time to ClickUp after submission
 */

function getWeekStartUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // Sun=0
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  try {
    // Safety: only allow in production
    if (process.env.VERCEL_ENV !== "production") {
      return NextResponse.json({
        skipped: true,
        reason: "Not production",
      });
    }

    const now = new Date();
    const weekStart = getWeekStartUTC(now);

    // 1. Fetch OPEN weekly timesheets for current week
    const { data: openRows, error } = await supabaseAdmin
      .from("weekly_timesheets")
      .select("user_id, week_start, status")
      .eq("week_start", weekStart)
      .eq("status", "OPEN");

    if (error) throw error;

    if (!openRows || openRows.length === 0) {
      return NextResponse.json({
        ok: true,
        submitted: 0,
      });
    }

    const userIds = openRows.map(r => r.user_id);

    // 2. Update → SUBMITTED
    const { error: updateErr } = await supabaseAdmin
      .from("weekly_timesheets")
      .update({
        status: "SUBMITTED",
        submitted_at: now.toISOString(),
        locked_at: now.toISOString(),
      })
      .eq("week_start", weekStart)
      .eq("status", "OPEN");

    if (updateErr) throw updateErr;

    // 3. Audit log (system action)
    await supabaseAdmin.from("timesheet_approvals").insert(
      userIds.map(userId => ({
        user_id: userId,
        week_start: weekStart,
        action: "AUTO_SUBMIT",
        action_by: null,
        created_at: now.toISOString(),
      }))
    );

    // 4. Sync tracked time to ClickUp for each user
    const authHeader = `Bearer ${process.env.CLICKUP_API_TOKEN}`;
    let syncedCount = 0;
    let syncFailedCount = 0;

    for (const userId of userIds) {
      try {
        await syncWeekDailyToClickUp({
          userId,
          weekStart,
          authHeader,
        });
        syncedCount++;
        console.log(`Cron auto-submit: ClickUp sync successful for user ${userId}, week ${weekStart}`);
      } catch (err) {
        syncFailedCount++;
        console.error(`Cron auto-submit: ClickUp sync failed for user ${userId}, week ${weekStart}:`, err);
        // Continue with other users - don't block cron
      }
    }

    return NextResponse.json({
      ok: true,
      submitted: userIds.length,
      week_start: weekStart,
      clickup_synced: syncedCount,
      clickup_failed: syncFailedCount,
    });
  } catch (err: any) {
    console.error("cron lock-timesheets failed", err);
    return NextResponse.json(
      { error: "Auto-submit failed", details: String(err) },
      { status: 500 }
    );
  }
}