// src/lib/clickup.ts
/**
 * ClickUp helpers:
 *  - Creates the correct Authorization header for either OAuth or Personal token
 *  - Exposes estimate and time-entry helpers
 *  - Also exposes getAuthHeader(req) that prefers user OAuth (iron-session) and falls back to env token
 */

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/** Important:
 *  - If value already starts with "Bearer ", return as-is (OAuth).
 *  - Otherwise, return token raw (Personal API token). DO NOT prepend "Bearer".
 */
export function makeAuthHeader(token: string) {
  const t = (token || "").trim();
  return t.startsWith("Bearer ") ? t : t; // raw personal token
}

/** Prefer OAuth token from session; else fall back to CLICKUP_API_TOKEN (personal) */
export async function getAuthHeader(req: Request, res?: Response): Promise<string> {
  // (1) Try user session
  try {
    // @ts-ignore – Next Request/Response is fine for iron-session on API routes
    const session: any = await getIronSession(req as any, (res as any) || {}, sessionOptions);
    const sessTok = session?.access_token || session?.accessToken;
    if (sessTok) return makeAuthHeader(String(sessTok));
  } catch {
    // ignore; we'll fall back
  }

  // (2) Try request header (rare, but allow it)
  const incoming = (req.headers.get("authorization") || "").trim();
  if (incoming) return makeAuthHeader(incoming);

  // (3) Fall back to env Personal token
  const envTok = process.env.CLICKUP_API_TOKEN || "";
  if (!envTok) throw new Error("No ClickUp token available (session/env)");
  return makeAuthHeader(envTok);
}

/* ---------- Estimates ---------- */

export async function cuUpdateTimeEstimate(authHeader: string, taskId: string, timeEstimateMs: number) {
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

/* ---------- Time tracking ---------- */

type CreateTimeParams = {
  authHeader: string;
  taskId: string;
  startMs: number;       // epoch ms
  timeMs: number;        // duration in ms
  description?: string;
  assignee?: number;     // ClickUp member id
  billable?: boolean;
};

export async function cuCreateManualTimeEntry({
  authHeader,
  taskId,
  startMs,
  timeMs,
  description,
  assignee,
  billable = true,
}: CreateTimeParams) {
  const cleanStart = Math.max(0, Math.floor(startMs));
  const cleanTime = Math.max(1, Math.floor(timeMs));

  // 1) Primary: task-scoped endpoint (start + time)
  {
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/time`;
    const body: any = {
      start: cleanStart,
      time: cleanTime,
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

    const txt = await r.text().catch(() => "");
    const shouldFallback =
      r.status === 404 ||
      txt.includes("Route not found") ||
      txt.includes("Must time spent if providing interval without an end");
    if (!shouldFallback) {
      throw new Error(`Task time entry failed ${r.status}: ${txt || r.statusText}`);
    }
  }

  // 2) Fallback: team-level time_entries (requires TEAM_ID), uses start + end + tid
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  if (!TEAM_ID) {
    throw new Error("Task time entry failed and no CLICKUP_TEAM_ID set for team-level fallback");
  }

  const endMs = cleanStart + cleanTime;
  const url2 = `https://api.clickup.com/api/v2/team/${encodeURIComponent(TEAM_ID)}/time_entries`;
  const body2: any = {
    start: cleanStart,
    end: endMs,
    tid: String(taskId),
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

/* ---------- Create Task ---------- */

type CreateTaskBody = {
  name: string;
  description?: string;
  tags?: string[];
  assignees?: number[]; // ClickUp member numeric IDs
  status?: string;
  priority?: number;
};

export async function cuCreateTask(authHeader: string, listId: string, body: CreateTaskBody) {
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
