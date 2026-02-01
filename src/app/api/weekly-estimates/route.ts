// src/app/api/weekly-estimates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
} from "@/lib/db";
import {
  getAuthHeader,
  cuCreateManualTimeEntry,
} from "@/lib/clickup";

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function startOfWeekUTC(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7;   // Monday start
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function allowedWeekStarts() {
  const now = new Date();
  const thisWeek = startOfWeekUTC(now);

  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWeek = startOfWeekUTC(next);

  return [thisWeek, nextWeek];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function noonUtcMs(ymd: string) {
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

/* -------------------------------------------------------
   State Machine Enforcement
-------------------------------------------------------- */

/**
 * Check if user can edit weekly estimates for a given week.
 * Same rules as timesheet entries.
 */
async function checkWeekEditPermission(
  userId: string,
  weekStart: string
): Promise<{ allowed: boolean; status: string | null; reason?: string }> {
  const { data: weeklyTimesheet } = await supabaseAdmin
    .from("weekly_timesheets")
    .select("status")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (!weeklyTimesheet) {
    // No weekly timesheet exists yet - assume OPEN
    return { allowed: true, status: null };
  }

  const status = weeklyTimesheet.status;

  switch (status) {
    case "OPEN":
    case "REJECTED":
      return { allowed: true, status };
    
    case "SUBMITTED":
      return {
        allowed: false,
        status,
        reason: "Week is submitted and awaiting approval. Cannot edit until approved or rejected.",
      };
    
    case "APPROVED":
      return {
        allowed: false,
        status,
        reason: "Week is approved and locked. No further edits allowed.",
      };
    
    default:
      return {
        allowed: false,
        status,
        reason: `Unknown status: ${status}`,
      };
  }
}

/* -------------------------------------------------------
   ClickUp Sync Helper
-------------------------------------------------------- */

/**
 * Sync tracked time to ClickUp for a given week.
 * Creates ONE time entry per task with total weekly hours.
 * Only syncs tasks with tracked_hours > 0.
 */
async function syncWeekToClickUp(
  req: NextRequest,
  userId: string,
  weekStart: string
): Promise<void> {
  try {
    const weekEnd = addDays(weekStart, 4); // Mon-Fri

    // Fetch all tracked time entries for the week
    const { data: entries, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select("task_id, task_name, tracked_hours")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd);

    if (error || !entries) {
      console.error("Failed to fetch timesheet entries for ClickUp sync:", error);
      return;
    }

    // Group by task_id and sum tracked_hours
    const taskTotals = new Map<string, { taskId: string; taskName: string; totalHours: number }>();

    for (const entry of entries) {
      if (!entry.tracked_hours || entry.tracked_hours <= 0) continue;

      const existing = taskTotals.get(entry.task_id);
      if (existing) {
        existing.totalHours += entry.tracked_hours;
      } else {
        taskTotals.set(entry.task_id, {
          taskId: entry.task_id,
          taskName: entry.task_name || entry.task_id,
          totalHours: entry.tracked_hours,
        });
      }
    }

    // Sync each task to ClickUp
    if (taskTotals.size === 0) {
      console.log(`Weekly ClickUp sync: no tracked hours for user ${userId}, week ${weekStart}`);
      return;
    }

    console.log(`Weekly ClickUp sync starting for user ${userId}, week ${weekStart}: ${taskTotals.size} task(s)`);

    const authHeader = await getAuthHeader(req);

    for (const { taskId, totalHours } of taskTotals.values()) {
      try {
        await cuCreateManualTimeEntry({
          authHeader,
          taskId,
          startMs: noonUtcMs(weekStart),
          timeMs: Math.max(1, Math.floor(totalHours * 3600_000)),
          description: "Weekly Timesheet Sync",
          assignee: Number(userId),
          billable: true,
        });
      } catch (err) {
        console.error(`Failed to sync task ${taskId} to ClickUp:`, err);
        // Continue with other tasks even if one fails
      }
    }

    console.log(`Weekly ClickUp sync complete for user ${userId}, week ${weekStart}`);
  } catch (err) {
    console.error("syncWeekToClickUp error:", err);
    // Don't throw - we don't want to fail the estimate submission if ClickUp sync fails
  }
}

/* =======================================================
   GET — Fetch weekly estimates
======================================================= */
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgUser = await getOrgUserByClickUpId(String(sessionUser.id));
    if (!orgUser) {
      return NextResponse.json({ rows: [] });
    }

    const roles = await getUserRoles(orgUser.id);
    const isAdmin = roles.includes("OWNER") || roles.includes("ADMIN");

    const sp = req.nextUrl.searchParams;
    const targetUserId = sp.get("userId");

    // Consultants can only read their own estimates
    if (targetUserId && !isAdmin && targetUserId !== orgUser.clickup_user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const queryUserId = targetUserId || orgUser.clickup_user_id;

    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .select("*")
      .eq("user_id", queryUserId)
      .order("week_start", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "DB query failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: data || [] });
  } catch (err: any) {
    console.error("weekly-estimates GET error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}

/* =======================================================
   POST — Submit weekly estimate
======================================================= */
export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const weekStart = String(body.weekStart || "");
    const hours = Number(body.hours ?? NaN);

    if (!weekStart || !Number.isFinite(hours)) {
      return NextResponse.json(
        { error: "Missing or invalid parameters" },
        { status: 400 }
      );
    }

    const orgUser = await getOrgUserByClickUpId(String(sessionUser.id));
    if (!orgUser) {
      return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
    }

    const roles = await getUserRoles(orgUser.id);
    const isAdmin = roles.includes("OWNER") || roles.includes("ADMIN");

    const targetUserId = body.userId
      ? String(body.userId)
      : orgUser.clickup_user_id;

    // Consultants cannot submit for others
    if (!isAdmin && targetUserId !== orgUser.clickup_user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /* -------- STATE MACHINE ENFORCEMENT -------- */
    
    const permission = await checkWeekEditPermission(targetUserId, weekStart);
    
    if (!permission.allowed) {
      return NextResponse.json(
        {
          error: "Cannot edit weekly estimate",
          reason: permission.reason,
          status: permission.status,
        },
        { status: 403 }
      );
    }

    /* -------- VALIDATION -------- */

    // Only allow current week or next week
    const allowedWeeks = allowedWeekStarts();
    if (!allowedWeeks.includes(weekStart)) {
      return NextResponse.json(
        { error: "Estimates allowed only for current or next week" },
        { status: 409 }
      );
    }

    /* -------- UPSERT ESTIMATE -------- */

    // Check existing
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("weekly_estimates")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (exErr) {
      return NextResponse.json(
        { error: "DB error", details: exErr.message },
        { status: 500 }
      );
    }

    if (existing) {
      if (existing.locked) {
        return NextResponse.json(
          { error: "Estimate already locked" },
          { status: 409 }
        );
      }

      // This is a NEW submission: previously unlocked → now locked
      const isNewSubmission = !existing.locked;

      const { data, error } = await supabaseAdmin
        .from("weekly_estimates")
        .update({
          hours,
          locked: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Update failed", details: error.message },
          { status: 500 }
        );
      }

      // Sync to ClickUp only on NEW submission (when locking for first time)
      if (isNewSubmission) {
        await syncWeekToClickUp(req, targetUserId, weekStart);
      }

      return NextResponse.json({ ok: true, estimate: data });
    }

    // Insert new (locked immediately) - this is always a NEW submission
    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .insert({
        user_id: targetUserId,
        week_start: weekStart,
        hours,
        locked: true,
        created_at: new Date().toISOString(),
        created_by: orgUser.id,
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Insert failed", details: error.message },
        { status: 500 }
      );
    }

    // Sync to ClickUp on NEW submission
    await syncWeekToClickUp(req, targetUserId, weekStart);

    return NextResponse.json({ ok: true, estimate: data });
  } catch (err: any) {
    console.error("weekly-estimates POST error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}