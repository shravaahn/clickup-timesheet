// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import axios from "axios";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Base = { userId: string; taskId: string; taskName?: string; date: string; hours: number };
type EstimateBody = Base & { type: "estimate" };
type TrackedBody  = Base & { type: "tracked"; note: string };

async function setCustomFieldValue(
  token: string,
  taskId: string,
  fieldId: string,
  value: number
) {
  // ClickUp: Set Custom Field Value
  // POST https://api.clickup.com/api/v2/task/{task_id}/field/{field_id}
  await axios.post(
    `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(fieldId)}`,
    { value },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

async function createTimeEntry(
  token: string,
  teamId: string,
  taskId: string,
  dateISO: string, // day the user picked (local noon to avoid TZ issues)
  hours: number,
  note: string
) {
  // ClickUp: Create a time entry
  // POST https://api.clickup.com/api/v2/team/{teamId}/time_entries
  // Minimal body: start + duration + task id (+ description)
  const start = new Date(dateISO);
  // put "noon" to keep it in the same local day even with TZ offsets
  start.setHours(12, 0, 0, 0);

  await axios.post(
    `https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/time_entries`,
    {
      start: start.toISOString(),          // ISO datetime string
      duration: Math.round(hours * 3600000), // ms
      task: taskId,                        // ClickUp requires the task id here
      description: note || undefined,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

// GET /api/timesheet?userId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const start  = searchParams.get("start");
    const end    = searchParams.get("end");
    if (!userId || !start || !end) {
      return NextResponse.json({ error: "Missing userId/start/end" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      entries: (data || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        task_id: r.task_id,
        task_name: r.task_name,
        date: r.date,
        estimate_hours: r.estimate_hours,
        estimate_locked: r.estimate_locked,
        tracked_hours: r.tracked_hours,
        tracked_note: r.tracked_note,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "DB error (fetch)", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// POST /api/timesheet { type, userId, taskId, taskName?, date, hours, note? }
export async function POST(req: NextRequest) {
  // attach iron-session so we can read the user's ClickUp token
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const token   = session.accessToken || null;

  try {
    const body = (await req.json()) as EstimateBody | TrackedBody;
    const { type, userId, taskId, taskName, date, hours } = body as any;

    if (!type || !userId || !taskId || !date || typeof hours !== "number" || !Number.isFinite(hours)) {
      return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400, headers: res.headers });
    }

    // Upsert to DB first (keeps the app fast even if ClickUp is slow)
    if (type === "estimate") {
      const { error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          {
            user_id: userId,
            task_id: taskId,
            task_name: taskName ?? null,
            date,
            estimate_hours: hours,
            estimate_locked: true,
          },
          { onConflict: "user_id,task_id,date", ignoreDuplicates: false }
        )
        .select("id");

      if (error) throw error;
    } else if (type === "tracked") {
      const note = (body as TrackedBody).note ?? "";
      const { error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          {
            user_id: userId,
            task_id: taskId,
            task_name: taskName ?? null,
            date,
            tracked_hours: hours,
            tracked_note: note,
          },
          { onConflict: "user_id,task_id,date", ignoreDuplicates: false }
        )
        .select("id");

      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Unknown type" }, { status: 400, headers: res.headers });
    }

    // Optional mirror to ClickUp (feature-flagged)
    const mirror = process.env.CLICKUP_SYNC_ENABLED === "true";
    if (mirror && token) {
      try {
        if (type === "estimate") {
          // single global field id (or support map later)
          const fieldId = process.env.CLICKUP_ESTIMATE_FIELD_ID;
          if (fieldId) {
            await setCustomFieldValue(token, taskId, fieldId, hours);
          }
        } else if (type === "tracked") {
          const teamId = process.env.CLICKUP_TEAM_ID;
          const note   = (body as TrackedBody).note ?? "";
          if (teamId) {
            await createTimeEntry(token, teamId, taskId, date, hours, note);
          }
        }
      } catch (e) {
        // Don't fail the request if ClickUp mirroring fails; just log.
        console.warn("ClickUp mirror failed:", (e as any)?.response?.data || (e as any)?.message || e);
      }
    }

    return new NextResponse(JSON.stringify({ ok: true }), {
      headers: { ...res.headers, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new NextResponse(JSON.stringify({
      error: "DB error (insert/upsert)",
      details: err?.message ?? String(err),
    }), {
      status: 500,
      headers: { ...res.headers, "Content-Type": "application/json" },
    });
  }
}
