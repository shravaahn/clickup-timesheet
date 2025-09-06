// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/* ---------------- ClickUp helpers ---------------- */

const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID || "";

function asBearer(raw: string) {
  return raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return asBearer(String(sess));
  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Missing auth: login or set CLICKUP_API_TOKEN");
  return asBearer(envToken);
}

async function pushEstimateToClickUp(authHeader: string, taskId: string) {
  // Strategy: set task's default "time_estimate" to the SUM of all estimates across users/dates
  // (ClickUp default estimate is task-level, not per day)
  const { data, error } = await supabase
    .from("timesheet_entries")
    .select("estimate_hours")
    .eq("task_id", taskId)
    .not("estimate_hours", "is", null);
  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  const totalHours = (data || []).reduce((acc, r: any) => acc + Number(r.estimate_hours || 0), 0);
  const totalMs = Math.round(totalHours * 60 * 60 * 1000);

  // PATCH task with time_estimate (ms)
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "PUT",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ time_estimate: totalMs }),
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`ClickUp set estimate failed ${r.status}: ${t}`);
  }
}

async function pushTrackedToClickUp(authHeader: string, taskId: string, userId: string, dateISO: string, hours: number, note: string) {
  // Create a time entry on the task using default time tracking
  // We place "start" at the provided date 12:00 local with duration = hours
  const startDate = new Date(dateISO + "T12:00:00"); // midday for the date (no timezone fuss)
  const durationMs = Math.round(Number(hours) * 60 * 60 * 1000);

  const body: any = {
    // ClickUp accepts milliseconds
    start: startDate.getTime(),
    duration: durationMs,
    description: note || undefined,
    // Optional assignee: ClickUp member id (if your userId is not a member id, omit)
    // We'll try to pass it if it's numeric-like, otherwise omit
    assignee: /^[0-9]+$/.test(userId) ? Number(userId) : undefined,
  };

  // Endpoint: POST /task/{task_id}/time
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`ClickUp add time failed ${r.status}: ${t}`);
  }
}

/* ---------------- API ---------------- */

// GET: /api/timesheet?userId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId") || "";
  const start = sp.get("start") || "";
  const end = sp.get("end") || "";

  if (!userId || !start || !end) {
    return NextResponse.json({ error: "Missing userId/start/end" }, { status: 400 });
  }

  // pull for range (inclusive) for the user
  const { data, error } = await supabase
    .from("timesheet_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "DB read failed", details: error.message }, { status: 500 });
  }

  // shape what the dashboard expects
  const entries = (data || []).map((r: any) => ({
    user_id: r.user_id,
    task_id: r.task_id,
    date: r.date,
    estimate_hours: r.estimate_hours,
    estimate_locked: !!r.estimate_locked,
    tracked_hours: r.tracked_hours,
    tracked_note: r.tracked_note,
    task_name: r.task_name || null, // optional
  }));

  return NextResponse.json({ entries });
}

// POST body (two modes):
//  { type:"estimate", userId, taskId, taskName, date, hours, syncToClickUp: true }
//  { type:"tracked",  userId, taskId, taskName, date, hours, note,  syncToClickUp: true }
export async function POST(req: NextRequest) {
  const res = new NextResponse();

  const {
    type,
    userId,
    taskId,
    taskName,
    date,
    hours,
    note,
    syncToClickUp,
  } = await req.json().catch(()=> ({}));

  if (!type || !userId || !taskId || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // upsert local row
  const patch: any = { user_id: String(userId), task_id: String(taskId), date: String(date) };

  if (type === "estimate") {
    patch.estimate_hours = Number(hours);
    patch.estimate_locked = true;
  } else if (type === "tracked") {
    patch.tracked_hours = Number(hours);
    patch.tracked_note = typeof note === "string" ? note : null;
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (taskName) patch.task_name = String(taskName);

  // upsert by PK (user_id, task_id, date)
  const { data, error } = await supabase
    .from("timesheet_entries")
    .upsert(patch, { onConflict: "user_id,task_id,date" })
    .select();

  if (error) {
    return NextResponse.json({ error: "DB upsert failed", details: error.message }, { status: 500 });
  }

  // Optionally sync to ClickUp
  if (syncToClickUp) {
    try {
      const authHeader = await getAuthHeader(req, res);

      if (type === "estimate") {
        await pushEstimateToClickUp(authHeader, String(taskId));
      } else {
        await pushTrackedToClickUp(authHeader, String(taskId), String(userId), String(date), Number(hours), String(note || ""));
      }
    } catch (e: any) {
      // We still succeeded locally; return 207 Multi-Status style payload
      return NextResponse.json({ ok: true, saved: data?.[0] || patch, clickupSync: { ok: false, error: e?.message || String(e) } }, { status: 207 });
    }
  }

  return NextResponse.json({ ok: true, saved: data?.[0] || patch });
}
