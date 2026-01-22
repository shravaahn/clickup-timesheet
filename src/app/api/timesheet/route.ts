// FILE: src/app/api/timesheet/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import {
  getAuthHeader,
  cuUpdateTimeEstimate,
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

  const upsertRow: any = {
    user_id: String(session.user.id),
    task_id: taskId,
    task_name: body.taskName ?? null,
    date,
  };

  if (body.type === "estimate") {
    upsertRow.estimate_hours = body.hours;
    upsertRow.estimate_locked = true;
  } else {
    upsertRow.tracked_hours = body.hours;
    upsertRow.tracked_note = body.note ?? null;
  }

  const { error } = await supabaseAdmin
    .from("timesheet_entries")
    .upsert(upsertRow, {
      onConflict: "user_id,task_id,date",
    });

  if (error) {
    return NextResponse.json(
      { error: "DB upsert failed", details: error.message },
      { status: 500 }
    );
  }

  /* -------- Optional ClickUp Sync -------- */

  if (body.syncToClickUp) {
    const authHeader = await getAuthHeader(req);

    if (body.type === "estimate") {
      const { data: rows } = await supabaseAdmin
        .from("timesheet_entries")
        .select("estimate_hours")
        .eq("task_id", taskId)
        .not("estimate_hours", "is", null);

      const totalHours =
        (rows || []).reduce(
          (sum, r: any) => sum + Number(r.estimate_hours || 0),
          0
        ) || 0;

      await cuUpdateTimeEstimate(
        authHeader,
        taskId,
        Math.floor(totalHours * 3600_000)
      );
    } else {
      await cuCreateManualTimeEntry({
        authHeader,
        taskId,
        startMs: noonUtcMs(date),
        timeMs: Math.max(1, Math.floor(body.hours * 3600_000)),
        description: body.note,
        assignee: Number(session.user.id),
        billable: true,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
