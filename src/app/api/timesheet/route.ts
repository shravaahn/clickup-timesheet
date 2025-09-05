// src/app/api/timesheet/route.ts
import { NextResponse } from "next/server";
import { cuCreateTimeEntry, cuUpdateTask } from "@/lib/clickup";

/* NOTE: This file assumes you already handle:
   - parsing body with { type: "estimate" | "tracked", userId, taskId, taskName, date, hours, note?, syncToClickUp? }
   - saving to your DB
   The changes here only add safe ClickUp sync calls AFTER your local save succeeds.
*/

function toMsHours(hours: number) {
  return Math.round(hours * 60 * 60 * 1000);
}

// Pick a neutral "start time" (09:00 UTC) for the day; ClickUp needs a start timestamp.
function startOfDayUtcMs(yyyyMmDd: string, hour = 9) {
  // yyyy-mm-dd -> Date at 09:00:00Z
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hour, 0, 0, 0));
  return dt.getTime();
}

// OPTIONAL: if you can compute a weekly total estimate for a task from your DB,
// replace the simple write with that value for better parity.
// async function getWeeklyEstimateTotalMs(taskId: string, anyDateYmd: string): Promise<number> {
//   // TODO: query your DB for that task’s estimates for Mon..Fri week of anyDateYmd and return sum * 3600000.
//   return 0;
// }

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      type,         // "estimate" | "tracked"
      userId,       // your app's notion of user (ideally ClickUp member id)
      taskId,       // ClickUp task id
      taskName,     // optional
      date,         // "YYYY-MM-DD"
      hours,        // number
      note,         // string | undefined
      syncToClickUp // boolean
    } = body || {};

    if (!type || !userId || !taskId || !date || !(hours >= 0)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // === 1) Save to your DB first (existing logic) ===
    // --- BEGIN YOUR EXISTING SAVE LOGIC ---
    // (Keep all of your current DB code here; omitted for brevity)
    // --- END YOUR EXISTING SAVE LOGIC ---

    // === 2) ClickUp sync (safe, best-effort) ===
    if (syncToClickUp) {
      if (type === "estimate") {
        // Simple: set task's single estimate to current hours.
        // If you prefer weekly sum, compute it and assign instead (see helper above).
        const ms = toMsHours(Number(hours));
        try {
          await cuUpdateTask(String(taskId), { time_estimate: ms });
        } catch (err) {
          console.warn("ClickUp estimate sync failed:", err);
          // Don't fail the request; local save already succeeded.
        }
      }

      if (type === "tracked") {
        const TEAM_ID = process.env.CLICKUP_TEAM_ID;
        if (!TEAM_ID) {
          console.warn("CLICKUP_TEAM_ID not set; skipping tracked time sync.");
        } else {
          const duration = toMsHours(Number(hours));
          const start = startOfDayUtcMs(String(date), 9); // 09:00Z
          const assigneeNum = Number(userId);
          try {
            await cuCreateTimeEntry(String(TEAM_ID), {
              start,
              duration,
              task_id: String(taskId),
              assignee: Number.isFinite(assigneeNum) ? assigneeNum : undefined,
              description: note ? String(note) : undefined,
              // billable: true, // uncomment if you want to mark as billable by default
            });
          } catch (err) {
            console.warn("ClickUp tracked sync failed:", err);
            // Don't fail the request; local save already succeeded.
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("timesheet POST error:", err);
    return NextResponse.json(
      { error: "Timesheet save failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
