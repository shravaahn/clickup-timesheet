// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { cuCreateManualTimeEntry, cuUpdateTimeEstimate, getAuthHeader } from "@/lib/clickup";

/** helpers */
const toMidday = (d: Date) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

/**
 * Expected POST body (both types share common fields):
 *  {
 *    type: "estimate" | "tracked",
 *    userId: string,           // ClickUp numeric id as string, or user row id (we store it)
 *    taskId: string,           // ClickUp task id
 *    taskName: string,
 *    date: "YYYY-MM-DD",
 *    hours: number,            // >0
 *    note?: string,            // for tracked
 *    syncToClickUp?: boolean
 *  }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, userId, taskId, taskName, date, hours, note, syncToClickUp } = body || {};

    if (!type || !userId || !taskId || !date || !Number.isFinite(hours)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ---- 1) UPSERT INTO SUPABASE ----
    const day = String(date);
    const hoursNum = Number(hours);

    // Either insert or update the (user_id, task_id, date) row
    const upsertPayload: any = {
      user_id: String(userId),
      task_id: String(taskId),
      task_name: String(taskName || taskId),
      date: day,
      updated_at: new Date().toISOString(),
    };

    if (type === "estimate") {
      upsertPayload.estimate_hours = hoursNum;
      upsertPayload.estimate_locked = true;
    } else {
      upsertPayload.tracked_hours = hoursNum;
      upsertPayload.tracked_note = String(note || "");
    }

    // Supabase: upsert on the composite key (make sure your table has a unique constraint on user_id+task_id+date)
    const { error: upsertErr } = await supabaseAdmin
      .from("timesheet_entries")
      .upsert(upsertPayload, { onConflict: "user_id,task_id,date" });

    if (upsertErr) {
      return NextResponse.json({ error: "DB upsert failed", details: upsertErr.message }, { status: 500 });
    }

    // ---- 2) SYNC TO CLICKUP (if asked) ----
    if (syncToClickUp) {
      const authHeader = await getAuthHeader();

      if (type === "estimate") {
        // Recompute TOTAL estimate across all rows for this task and set ClickUp's time_estimate to that total
        const { data: rows, error: selErr } = await supabaseAdmin
          .from("timesheet_entries")
          .select("estimate_hours")
          .eq("task_id", String(taskId))
          .not("estimate_hours", "is", null);

        if (selErr) {
          return NextResponse.json({ error: "DB read failed", details: selErr.message }, { status: 500 });
        }

        const totalHours = (rows || []).reduce((acc: number, r: any) => acc + (Number(r.estimate_hours) || 0), 0);
        const totalMs = Math.round(totalHours * 3600000);
        await cuUpdateTimeEstimate(authHeader, String(taskId), totalMs);
      } else {
        // tracked: add a manual time entry for THIS day and THIS hours
        // Use midday of the provided date as the "start" timestamp
        const dayParts = day.split("-").map(Number); // [YYYY,MM,DD]
        const startDate = toMidday(new Date(dayParts[0], (dayParts[1] - 1), dayParts[2]));
        const startMs = startDate.getTime();
        const timeMs = Math.round(hoursNum * 3600000);

        // userId is the ClickUp member id on your UI (you pass it in body.userId). If it's numeric, forward it.
        const assigneeNum = /^[0-9]+$/.test(String(userId)) ? Number(userId) : undefined;

        await cuCreateManualTimeEntry({
          authHeader,
          taskId: String(taskId),
          startMs,
          timeMs,
          description: note ? String(note) : undefined,
          assignee: assigneeNum,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
