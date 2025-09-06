// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { getAuthHeader, cuUpdateTimeEstimate, cuCreateManualTimeEntry } from "@/lib/clickup";

type Body =
  | {
      type: "estimate";
      userId: string;
      taskId: string;
      taskName?: string;
      date: string;   // YYYY-MM-DD
      hours: number;  // decimal hours
      syncToClickUp?: boolean;
    }
  | {
      type: "tracked";
      userId: string;
      taskId: string;
      taskName?: string;
      date: string;   // YYYY-MM-DD
      hours: number;  // decimal hours
      note?: string;
      syncToClickUp?: boolean;
    };

function toEpochMsAtNoonUTC(ymd: string) {
  // store around midday to avoid DST edge cases
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { userId, taskId, date } = body;

    if (!userId || !taskId || !date) {
      return NextResponse.json({ error: "Missing userId/taskId/date" }, { status: 400 });
    }

    // ---- 1) Persist to Supabase (upsert per (userId, taskId, date)) ----
    const baseRow: any = {
      user_id: String(userId),
      task_id: String(taskId),
      date, // YYYY-MM-DD
      task_name: (body as any).taskName || null,
    };

    if (body.type === "estimate") {
      baseRow.estimate_hours = Number(body.hours) || 0;
      baseRow.estimate_locked = true;
    } else {
      baseRow.tracked_hours = Number(body.hours) || 0;
      baseRow.tracked_note = (body as any).note || null;
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("timesheet_entries")
      .upsert(baseRow, { onConflict: "user_id,task_id,date" });

    if (upsertErr) {
      return NextResponse.json({ error: "DB upsert failed", details: upsertErr.message }, { status: 500 });
    }

    // ---- 2) Optional: sync to ClickUp ----
    if (body.syncToClickUp) {
      const authHeader = await getAuthHeader(req);

      if (body.type === "estimate") {
        // ClickUp expects total estimate for the task (ms). We’ll set it to the
        // week-day’s estimate value; if you want cumulative, change this to your own sum.
        const timeMs = Math.max(0, Math.floor(Number(body.hours) * 3600_000));
        await cuUpdateTimeEstimate(authHeader, taskId, timeMs);
      } else {
        const startMs = toEpochMsAtNoonUTC(date);
        const timeMs = Math.max(1, Math.floor(Number(body.hours) * 3600_000));
        // If your userId is a numeric ClickUp member id, this will include it; otherwise omit.
        const assignee = /^[0-9]+$/.test(String(userId)) ? Number(userId) : undefined;
        await cuCreateManualTimeEntry({
          authHeader,
          taskId,
          startMs,
          timeMs,
          description: body.note || undefined,
          assignee,
          billable: true,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("/api/timesheet POST error:", err);
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
