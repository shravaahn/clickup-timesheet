// src/lib/clickup.ts
/**
 * ClickUp helpers:
 *  - Auth header builder (OAuth "Bearer ..." vs Personal token raw)
 *  - Estimate updater
 *  - Time entry (robust: task first, then team with multiple fallbacks)
 *  - Create task
 *  - Weekly time sync helper
 */

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/* ============ Auth ============ */

export function makeAuthHeader(token: string): string {
  const t = (token || "").trim();
  return t.startsWith("Bearer ") ? t : t; // raw personal token stays raw
}

export async function getAuthHeader(req: Request, res?: Response): Promise<string> {
  try {
    // @ts-ignore next Request/Response work with iron-session in route handlers
    const session: any = await getIronSession(req as any, (res as any) || {}, sessionOptions);
    const sessTok = session?.access_token || session?.accessToken;
    if (sessTok) return makeAuthHeader(String(sessTok));
  } catch {}

  const incoming = (req.headers.get("authorization") || "").trim();
  if (incoming) return makeAuthHeader(incoming);

  const envTok = process.env.CLICKUP_API_TOKEN || "";
  if (!envTok) throw new Error("No ClickUp token available (session/header/env)");
  return makeAuthHeader(envTok);
}

/* ============ Estimates ============ */

export async function cuUpdateTimeEstimate(
  authHeader: string,
  taskId: string,
  timeEstimateMs: number
): Promise<void> {
  const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ time_estimate: Math.max(0, Math.floor(timeEstimateMs)) }),
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Estimate update failed ${r.status}: ${txt || r.statusText}`);
  }
}

/* ============ Time Tracking ============ */

type CreateTimeParams = {
  authHeader: string;
  taskId: string;
  startMs: number;        // epoch ms
  timeMs: number;         // duration in ms (>0)
  description?: string;
  assignee?: number;      // ClickUp member id (optional)
  billable?: boolean;     // default true
};

/**
 * Robust tracked-time:
 *  A) Try TASK endpoint with duration: POST /task/{taskId}/time  { start, time, ... }
 *  B) Fallback TEAM endpoint with *both* ids and *both* duration+end:
 *     POST /team/{TEAM_ID}/time_entries { start, duration, end, tid, task_id, ... }
 *
 * This covers workspaces that:
 *  - only accept task route,
 *  - accept team route but require `tid`,
 *  - accept team route but require `task_id`,
 *  - require `duration`, or prefer explicit `end`.
 */
export async function cuCreateManualTimeEntry({
  authHeader,
  taskId,
  startMs,
  timeMs,
  description,
  assignee,
  billable = true,
}: CreateTimeParams): Promise<void> {
  const cleanStart = Math.max(0, Math.floor(startMs));
  const cleanTime  = Math.max(1, Math.floor(timeMs));

  /* ---- A) TASK endpoint first (most consistent) ---- */
  {
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/time`;
    const body: any = {
      start: cleanStart,
      time: cleanTime,             // duration in ms
      description: description || undefined,
      billable,
    };
    if (Number.isFinite(assignee as number)) body.assignee = Number(assignee);

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (r.ok) return;

    // If it's a hard auth/permission error, surface it now.
    if (r.status === 401 || r.status === 403) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Task time entry failed ${r.status}: ${txt || r.statusText}`);
    }

    // Otherwise, fall through to team route.
  }

  /* ---- B) TEAM endpoint with multiple compat fields ---- */
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  if (!TEAM_ID) {
    throw new Error("Task time entry failed and no CLICKUP_TEAM_ID set for team-level fallback");
  }

  const endMs = cleanStart + cleanTime;
  const url2 = `https://api.clickup.com/api/v2/team/${encodeURIComponent(TEAM_ID)}/time_entries`;
  const body2: any = {
    start: cleanStart,
    duration: cleanTime,          // duration (accepted in many workspaces)
    end: endMs,                   // plus end for strict validators
    tid: String(taskId),          // some workspaces expect `tid`
    task_id: String(taskId),      // others expect `task_id`
    description: description || undefined,
    billable,
  };
  if (Number.isFinite(assignee as number)) body2.assignee = Number(assignee);

  const r2 = await fetch(url2, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body2),
    cache: "no-store",
  });

  if (!r2.ok) {
    const txt2 = await r2.text().catch(() => "");
    throw new Error(`Team time entry failed ${r2.status}: ${txt2 || r2.statusText}`);
  }
}

/* ============ Weekly Time Sync ============ */

/**
 * Sync tracked time to ClickUp for a given week on a PER-DAY basis.
 * Creates one ClickUp time entry per task per day with tracked hours.
 * 
 * @param userId - ClickUp user ID
 * @param weekStart - Week start date in YYYY-MM-DD format (Monday)
 * @param authHeader - ClickUp auth header
 */
export async function syncWeekDailyToClickUp({
  userId,
  weekStart,
  authHeader,
}: {
  userId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  authHeader: string;
}): Promise<void> {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);

  const weekEnd = end.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("task_id, tracked_hours, date")
    .eq("user_id", userId)
    .gt("tracked_hours", 0)
    .gte("date", weekStart)
    .lte("date", weekEnd);

  if (error || !data) {
    console.error("ClickUp sync load failed", error);
    return;
  }

  for (const row of data) {
    try {
      const startMs = new Date(`${row.date}T12:00:00Z`).getTime();
      const timeMs = Math.floor(Number(row.tracked_hours) * 60 * 60 * 1000);

      await cuCreateManualTimeEntry({
        authHeader,
        taskId: row.task_id,
        startMs,
        timeMs,
        description: `Timesheet • ${row.date}`,
        billable: true,
      });
    } catch (err) {
      // NEVER fail submission
      console.error(
        `ClickUp sync failed: task=${row.task_id}, date=${row.date}`,
        err
      );
    }
  }
}

/* ============ Create Task ============ */

type CreateTaskBody = {
  name: string;
  description?: string;
  tags?: string[];
  assignees?: number[]; // numeric ClickUp member IDs
  status?: string;
  priority?: number;
};

export async function cuCreateTask(
  authHeader: string,
  listId: string,
  body: CreateTaskBody
): Promise<any> {
  const url = `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await r.text().catch(() => "");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!r.ok) {
    throw new Error(`ClickUp create failed ${r.status}: ${text || r.statusText}`);
  }
  return json;
}