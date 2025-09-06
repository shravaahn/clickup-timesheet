// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { getAuthHeader, cuUpdateTimeEstimate, cuCreateManualTimeEntry } from "@/lib/clickup";

/** Request bodies we accept */
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

/** normalize → epoch ms at noon UTC to avoid DST weirdness for tracked entries */
function noonUtcMs(ymd: string) {
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

/** ---------- GET: fetch entries for a user & date range ---------- */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId") || "";
    const start = sp.get("start") || "";
    const end = sp.get("end") || "";

    if (!userId || !start || !end) {
      return NextResponse.json(
        { error: "Missing userId/start/end" },
        { status: 400 }
      );
    }

    // Read with service-role (bypasses RLS), so data persists/reloads reliably
    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select(
        "user_id, task_id, task_name, date, estimate_hours, estimate_locked, tracked_hours, tracked_note"
      )
      .eq("user_id", String(userId))
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
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/** ---------- POST: upsert + sync (estimate or tracked) ---------- */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { userId, taskId, date } = body;

    if (!userId || !taskId || !date) {
      return NextResponse.json(
        { error: "Missing userId/taskId/date" },
        { status: 400 }
      );
    }

    // Build row for upsert
    const upsertRow: any = {
      user_id: String(userId),
      task_id: String(taskId),
      date, // YYYY-MM-DD
      task_name: (body as any).taskName ?? null,
    };

    if (body.type === "estimate") {
      upsertRow.estimate_hours = Number(body.hours) || 0;
      upsertRow.estimate_locked = true;
    } else {
      upsertRow.tracked_hours = Number(body.hours) || 0;
      upsertRow.tracked_note = (body as any).note ?? null;
    }

    // Persist (requires unique index on (user_id, task_id, date) for onConflict to work)
    const { error: upsertErr } = await supabaseAdmin
      .from("timesheet_entries")
      .upsert(upsertRow, { onConflict: "user_id,task_id,date" });

    if (upsertErr) {
      return NextResponse.json(
        { error: "DB upsert failed", details: upsertErr.message },
        { status: 500 }
      );
    }

    // Optional: sync to ClickUp
    if (body.syncToClickUp) {
      const authHeader = await getAuthHeader(req as any);

      if (body.type === "estimate") {
        // === ESTIMATE SYNC ===
        // ClickUp `time_estimate` is a *task total* (ms).
        // We compute the TOTAL of all estimate_hours for this task across the table,
        // then push that cumulative value to ClickUp.
        const { data: sumRows, error: sumErr } = await supabaseAdmin
          .from("timesheet_entries")
          .select("estimate_hours")
          .eq("task_id", String(taskId))
          .not("estimate_hours", "is", null);

        if (sumErr) {
          return NextResponse.json(
            { error: "DB sum failed", details: sumErr.message },
            { status: 500 }
          );
        }

        const totalHours =
          (sumRows || []).reduce(
            (acc: number, r: any) => acc + (Number(r.estimate_hours) || 0),
            0
          ) || 0;

        const totalMs = Math.max(0, Math.floor(totalHours * 3600_000));
        await cuUpdateTimeEstimate(authHeader, taskId, totalMs);
      } else {
        // === TRACKED SYNC (unchanged) ===
        const startMs = noonUtcMs(date);
        const timeMs = Math.max(1, Math.floor(Number(body.hours) * 3600_000));
        const maybeAssignee =
          /^[0-9]+$/.test(String(userId)) ? Number(userId) : undefined;

        await cuCreateManualTimeEntry({
          authHeader,
          taskId,
          startMs,
          timeMs,
          description: (body as any).note || undefined,
          assignee: maybeAssignee,
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
