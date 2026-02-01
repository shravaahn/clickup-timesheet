// FILE: src/app/api/timesheet/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin, getOrgUserByClickUpId, getUserRoles } from "@/lib/db";
import {
  getAuthHeader,
  cuCreateManualTimeEntry,
} from "@/lib/clickup";

/* ================================
   HELPERS
================================ */

function weekStartFromDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day + 6) % 7; // Monday start
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function noonUtcMs(ymd: string) {
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

/* ================================
   STATE MACHINE ENFORCEMENT
================================ */

/**
 * Check if user can edit timesheet entries for a given week.
 * 
 * Rules:
 * - OPEN: Consultant can edit
 * - SUBMITTED: No edits allowed (waiting for manager approval)
 * - APPROVED: No edits allowed (locked forever)
 * - REJECTED: Consultant can edit (make corrections and resubmit)
 * 
 * @returns { allowed: boolean, status: string | null, reason?: string }
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

/* ================================
   TYPES
================================ */

type Body =
  | {
      type: "estimate";
      taskId: string;
      taskName?: string;
      date: string;
      hours: number;
      syncToClickUp?: boolean;
    }
  | {
      type: "tracked";
      taskId: string;
      taskName?: string;
      date: string;
      hours: number;
      note?: string;
      syncToClickUp?: boolean;
    };

/* ================================
   GET — READ TIMESHEET
================================ */

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const start = sp.get("start");
  const end = sp.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "Missing start or end" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select(
      "user_id, task_id, task_name, date, estimate_hours, estimate_locked, tracked_hours, tracked_note"
    )
    .eq("user_id", String(session.user.id))
    .gte("date", start)
    .lte("date", end)
    .order("task_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "DB read failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ entries: data || [] });
}

/* ================================
   POST — WRITE TIMESHEET
================================ */

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const { taskId, date } = body;

  if (!taskId || !date) {
    return NextResponse.json(
      { error: "Missing taskId or date" },
      { status: 400 }
    );
  }

  /* -------- STATE MACHINE ENFORCEMENT -------- */
  
  const weekStart = weekStartFromDate(date);
  const permission = await checkWeekEditPermission(
    String(session.user.id),
    weekStart
  );

  if (!permission.allowed) {
    return NextResponse.json(
      {
        error: "Cannot edit timesheet",
        reason: permission.reason,
        status: permission.status,
      },
      { status: 403 }
    );
  }

  /* -------- UPSERT TIMESHEET ENTRY -------- */

  // Build the upsert row - ALWAYS include all required fields for the unique constraint
  const upsertRow: any = {
    user_id: String(session.user.id),
    task_id: taskId,
    task_name: body.taskName ?? null,
    date,
  };

  if (body.type === "estimate") {
    // Update estimate fields, preserve tracked fields
    upsertRow.estimate_hours = body.hours;
    upsertRow.estimate_locked = true;
  } else {
    // Update tracked fields, preserve estimate fields
    upsertRow.tracked_hours = body.hours;
    upsertRow.tracked_note = body.note ?? null;
  }

  // CRITICAL: Use upsert with onConflict to UPDATE existing rows instead of creating duplicates
  // This requires a UNIQUE constraint on (user_id, task_id, date) in the database
  const { error } = await supabaseAdmin
    .from("timesheet_entries")
    .upsert(upsertRow, {
      onConflict: "user_id,task_id,date",
      // ignoreDuplicates: false is the default - we want to UPDATE on conflict
    });

  if (error) {
    return NextResponse.json(
      { error: "DB upsert failed", details: error.message },
      { status: 500 }
    );
  }

  /* -------- Optional ClickUp Sync (TRACKED TIME ONLY) -------- */
  /* 
   * DISABLED: ClickUp syncing is currently disabled to prevent duplicate time entries
   * during normal timesheet edits. Re-enable only when a one-time sync mechanism is in place.
   */
  
  // if (body.syncToClickUp) {
  //   // CRITICAL: Only sync TRACKED time to ClickUp, NEVER estimates
  //   // Estimates are portal-only and should remain in Supabase
  //   
  //   if (body.type === "tracked") {
  //     const authHeader = await getAuthHeader(req);
  //     
  //     // Create a manual time entry in ClickUp for tracked hours
  //     await cuCreateManualTimeEntry({
  //       authHeader,
  //       taskId,
  //       startMs: noonUtcMs(date),
  //       timeMs: Math.max(1, Math.floor(body.hours * 3600_000)),
  //       description: body.note,
  //       assignee: Number(session.user.id),
  //       billable: true,
  //     });
  //   }
  //   // If body.type === "estimate", we intentionally do nothing
  //   // Estimates are never synced to ClickUp
  // }

  return NextResponse.json({ ok: true });
}