// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/* --------------------------- helpers --------------------------- */

function makeAuthHeader(token: string) {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return makeAuthHeader(String(sess));
  const envToken = process.env.CLICKUP_API_TOKEN;
  if (!envToken) throw new Error("Missing ClickUp auth (session & CLICKUP_API_TOKEN)");
  return makeAuthHeader(envToken);
}

function hoursToMs(h: number) {
  return Math.round(h * 60 * 60 * 1000);
}

/** noon UTC of a YYYY-MM-DD date, in ms */
function middayUtcMs(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0));
  return dt.getTime();
}

/* -------------------- ClickUp sync functions ------------------- */

async function syncEstimateToClickUp(authHeader: string, taskId: string, hours: number) {
  // ClickUp task update: time_estimate is in ms
  const body = { time_estimate: hoursToMs(hours) };
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "PUT",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp estimate sync failed ${r.status}: ${t}`);
  }
}

async function syncTrackedToClickUp(
  authHeader: string,
  taskId: string,
  dateYmd: string,
  hours: number,
  note: string,
  assigneeId: string
) {
  // ClickUp time entry: duration ms, start ms; include assignee (numeric CU user id)
  const body = {
    start: middayUtcMs(dateYmd),
    duration: hoursToMs(hours),
    description: note || "Timesheet entry",
    assignee: assigneeId,
  };

  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp tracked sync failed ${r.status}: ${t}`);
  }
}

/* ----------------------------- GET ----------------------------- */
/**
 * Query params:
 *  - userId: ClickUp numeric id string (required)
 *  - start: YYYY-MM-DD (required)
 *  - end:   YYYY-MM-DD (required)
 *
 * Returns: { entries: Array<...> }
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId");
    const start = sp.get("start");
    const end = sp.get("end");

    if (!userId || !start || !end) {
      return NextResponse.json({ error: "Missing userId/start/end" }, { status: 400 });
    }

    // Pull entries for this user + date range
    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select(
        "task_id, task_name, date, estimate_hours, estimate_locked, tracked_hours, tracked_note"
      )
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "DB read failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/* ----------------------------- POST ---------------------------- */
/**
 * Body for estimate:
 *  {
 *    "type": "estimate",
 *    "userId": "<CU numeric id>",
 *    "taskId": "<clickup task id>",
 *    "taskName": "string",
 *    "date": "YYYY-MM-DD",
 *    "hours": number,
 *    "syncToClickUp": true|false (optional; default true)
 *  }
 *
 * Body for tracked:
 *  {
 *    "type": "tracked",
 *    "userId": "<CU numeric id>",
 *    "taskId": "<clickup task id>",
 *    "taskName": "string",
 *    "date": "YYYY-MM-DD",
 *    "hours": number,
 *    "note": "billable | Meeting",
 *    "syncToClickUp": true|false (optional; default true)
 *  }
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const body = await req.json();
    const {
      type,
      userId,
      taskId,
      taskName,
      date,
      hours,
      note,
      syncToClickUp = true,
    } = body || {};

    if (!type || !userId || !taskId || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const authHeader = syncToClickUp ? await getAuthHeader(req, res) : "";

    if (type === "estimate") {
      const hrs = Number(hours);
      if (!Number.isFinite(hrs) || hrs < 0) {
        return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
      }

      // Upsert estimate in Supabase (locks estimate on create)
      const { data, error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          [
            {
              user_id: String(userId),
              task_id: String(taskId),
              task_name: taskName ? String(taskName) : null,
              date: String(date),
              estimate_hours: hrs,
              estimate_locked: true,
            },
          ],
          { onConflict: "user_id,task_id,date" }
        )
        .select();

      if (error) {
        return NextResponse.json({ error: "DB upsert failed", details: error.message }, { status: 500 });
      }

      // Sync to ClickUp
      if (syncToClickUp) {
        await syncEstimateToClickUp(authHeader, String(taskId), hrs);
      }

      return NextResponse.json({ ok: true, row: (data || [])[0] || null });
    }

    if (type === "tracked") {
      const hrs = Number(hours);
      if (!Number.isFinite(hrs) || hrs <= 0) {
        return NextResponse.json({ error: "Tracked hours must be > 0" }, { status: 400 });
      }
      const noteStr = (note ?? "").toString();

      // Upsert tracked in Supabase
      const { data, error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          [
            {
              user_id: String(userId),
              task_id: String(taskId),
              task_name: taskName ? String(taskName) : null,
              date: String(date),
              tracked_hours: hrs,
              tracked_note: noteStr,
            },
          ],
          { onConflict: "user_id,task_id,date" }
        )
        .select();

      if (error) {
        return NextResponse.json({ error: "DB upsert failed", details: error.message }, { status: 500 });
      }

      // Sync to ClickUp (time entry with assignee)
      if (syncToClickUp) {
        await syncTrackedToClickUp(
          authHeader,
          String(taskId),
          String(date),
          hrs,
          noteStr,
          String(userId)
        );
      }

      return NextResponse.json({ ok: true, row: (data || [])[0] || null });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
