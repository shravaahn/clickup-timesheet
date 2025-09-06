// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { cuCreateManualTimeEntry, cuUpdateTimeEstimate, getAuthHeaderMaybe } from "@/lib/clickup";

/** helpers */
const toMidday = (d: Date) => { const x = new Date(d); x.setHours(12,0,0,0); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, userId, taskId, taskName, date, hours, note, syncToClickUp } = body || {};

    if (!type || !userId || !taskId || !date || !Number.isFinite(hours)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const day = String(date);
    const hoursNum = Number(hours);

    // ---- 1) UPSERT INTO SUPABASE ----
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

    const { error: upsertErr } = await supabaseAdmin
      .from("timesheet_entries")
      .upsert(upsertPayload, { onConflict: "user_id,task_id,date" });

    if (upsertErr) {
      return NextResponse.json({ error: "DB upsert failed", details: upsertErr.message }, { status: 500 });
    }

    // ---- 2) OPTIONAL SYNC TO CLICKUP ----
    let clickupSync: "skipped" | "ok" | "error" = "skipped";
    let clickupMessage: string | undefined;

    if (syncToClickUp) {
      const authHeader = await getAuthHeaderMaybe(req, new NextResponse());

      if (!authHeader) {
        clickupSync = "skipped";
        clickupMessage = "No ClickUp token configured (set CLICKUP_API_TOKEN or ensure session token).";
      } else {
        try {
          if (type === "estimate") {
            // total up all estimates for this task and overwrite ClickUp's time_estimate
            const { data: rows, error: selErr } = await supabaseAdmin
              .from("timesheet_entries")
              .select("estimate_hours")
              .eq("task_id", String(taskId))
              .not("estimate_hours", "is", null);

            if (selErr) throw new Error(`DB read failed: ${selErr.message}`);

            const totalHours = (rows || []).reduce((acc: number, r: any) => acc + (Number(r.estimate_hours) || 0), 0);
            const totalMs = Math.round(totalHours * 3600000);
            await cuUpdateTimeEstimate(authHeader, String(taskId), totalMs);
            clickupSync = "ok";
          } else {
            // tracked time: add a manual entry on that date
            const [Y, M, D] = day.split("-").map((n: string) => Number(n));
            const startMs = toMidday(new Date(Y, M - 1, D)).getTime();
            const timeMs = Math.max(1, Math.round(hoursNum * 3600000));
            const assigneeNum = /^[0-9]+$/.test(String(userId)) ? Number(userId) : undefined;

            await cuCreateManualTimeEntry({
              authHeader,
              taskId: String(taskId),
              startMs,
              timeMs,
              description: note ? String(note) : undefined,
              assignee: assigneeNum,
            });
            clickupSync = "ok";
          }
        } catch (e: any) {
          clickupSync = "error";
          clickupMessage = e?.message || String(e);
        }
      }
    }

    // IMPORTANT: Always 200 so the UI keeps the value. We include sync status for logging/inspection.
    return NextResponse.json({ ok: true, clickupSync, clickupMessage });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
