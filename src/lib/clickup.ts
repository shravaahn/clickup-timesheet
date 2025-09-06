// src/lib/clickup.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/** Build a proper Authorization header from either a raw token or an existing "Bearer ..." string */
export function makeAuthHeader(tokenOrBearer: string) {
  return tokenOrBearer?.startsWith("Bearer ") ? tokenOrBearer : `Bearer ${tokenOrBearer}`;
}

/** Get an Authorization header (prefer session OAuth, fall back to env personal token) */
export async function getAuthHeader(req?: NextRequest, res?: NextResponse) {
  if (req && res) {
    const session: any = await getIronSession(req, res, sessionOptions);
    const sess = session?.access_token || session?.accessToken;
    if (sess) return makeAuthHeader(String(sess));
  }
  const env = process.env.CLICKUP_API_TOKEN;
  if (!env) throw new Error("Missing CLICKUP_API_TOKEN and no session token available");
  return makeAuthHeader(env);
}

/** Create a task (optionally with assignees) */
export async function cuCreateTask(opts: {
  authHeader: string;
  listId: string;
  name: string;
  tags?: string[];
  assignees?: number[]; // ClickUp member numeric IDs
}) {
  const { authHeader, listId, name, tags = [], assignees } = opts;
  const body: any = { name, tags };
  if (assignees && assignees.length) body.assignees = assignees;

  const r = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Create task failed ${r.status}: ${t}`);
  }
  return r.json();
}

/** Overwrite a task's total time estimate (in milliseconds) */
export async function cuUpdateTimeEstimate(authHeader: string, taskId: string, totalMs: number) {
  // ClickUp expects the total (not a delta) in `time_estimate` (milliseconds)
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "PUT",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ time_estimate: Math.max(0, Math.floor(totalMs)) }),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Estimate update failed ${r.status}: ${t}`);
  }
  return r.json();
}

/**
 * Add a manual time entry to a task.
 * Provide BOTH:
 *  - start: ms-since-epoch (when the work happened)
 *  - time: duration in ms
 * Optionally:
 *  - description, assignee (numeric), tid (tracking provider id)
 */
export async function cuCreateManualTimeEntry(opts: {
  authHeader: string;
  taskId: string;
  startMs: number;          // e.g., midday of the chosen date
  timeMs: number;           // hours * 3600000
  description?: string;
  assignee?: number;        // ClickUp member numeric ID
}) {
  const { authHeader, taskId, startMs, timeMs, description, assignee } = opts;

  const body: any = {
    start: Math.floor(startMs),
    time: Math.max(1, Math.floor(timeMs)), // must be >0
  };
  if (description) body.description = description;
  if (Number.isFinite(assignee as number)) body.assignee = assignee;

  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Time entry failed ${r.status}: ${t}`);
  }
  return r.json();
}
