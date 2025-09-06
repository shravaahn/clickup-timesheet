// src/lib/clickup.ts
/**
 * ClickUp helpers:
 *  - Creates the correct Authorization header for either OAuth or Personal token
 *  - Exposes estimate, time-entry, and create-task helpers
 *  - Exposes getAuthHeader(req,res?) that prefers user OAuth (iron-session) and falls back to env token
 *
 * IMPORTANT:
 *  - Personal API tokens must be sent RAW (no "Bearer " prefix).
 *  - OAuth tokens must be sent with "Bearer " prefix.
 */

import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/* ================= Auth ================= */

export function makeAuthHeader(token: string): string {
  const t = (token || "").trim();
  // If already "Bearer ...", pass through; otherwise keep raw (personal token)
  return t.startsWith("Bearer ") ? t : t;
}

/**
 * Prefer OAuth token from session (iron-session). If missing, use:
 *  - request "authorization" header if present (rare)
 *  - env CLICKUP_API_TOKEN (personal token)
 */
export async function getAuthHeader(req: Request, res?: Response): Promise<string> {
  // 1) Try session OAuth token
  try {
    // @ts-ignore – Next's Request/Response works with iron-session in API routes
    const session: any = await getIronSession(req as any, (res as any) || {}, sessionOptions);
    const sessTok = session?.access_token || session?.accessToken;
    if (sessTok) return makeAuthHeader(String(sessTok));
  } catch {
    // ignore; continue to next sources
  }

  // 2) Request header (if someone proxied a token through)
  const incoming = (req.headers.get("authorization") || "").trim();
  if (incoming) return makeAuthHeader(incoming);

  // 3) Env personal token
  const envTok = process.env.CLICKUP_API_TOKEN || "";
  if (!envTok) throw new Error("No ClickUp token available (session/header/env)");
  return makeAuthHeader(envTok);
}

/* ================= Estimates ================= */

/**
 * ClickUp expects TOTAL task estimate in milliseconds on the task object.
 * This overwrites the task's aggregate estimate (not a per-day value).
 */
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

/* ================= Time Tracking ================= */

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
 * Robust tracked-time creator:
 *  1) Try TEAM endpoint (recommended): POST /team/{TEAM_ID}/time_entries with duration
 *  2) Fallback to TASK endpoint:     POST /task/{taskId}/time with "time" (duration)
 *
 * Uses whichever token you provide in Authorization:
 *   - raw personal token (no Bearer) OR
 *   - "Bearer <oauth>"
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
  const cleanTime = Math.max(1, Math.floor(timeMs));

  /* ---- Primary: TEAM endpoint with duration ---- */
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  if (TEAM_ID) {
    const url = `https://api.clickup.com/api/v2/team/${encodeURIComponent(TEAM_ID)}/time_entries`;
    const body: any = {
      start: cleanStart,
      duration: cleanTime,
      task_id: String(taskId), // <-- team endpoint expects "task_id"
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

    // Only fall back on conditions we know we can recover from
    const txt = await r.text().catch(() => "");
    const shouldFallback =
      r.status === 404 ||
      txt.includes("Route not found") ||
      // in case workspace doesn't allow team endpoint or needs different shape
      r.status === 400;

    if (!shouldFallback) {
      throw new Error(`Team time entry failed ${r.status}: ${txt || r.statusText}`);
    }
  }

  /* ---- Fallback: TASK endpoint with "time" (duration) ---- */
  const url2 = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/time`;
  const body2: any = {
    start: cleanStart,
    time: cleanTime, // <-- task endpoint expects "time" for duration
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
    throw new Error(`Task time entry failed ${r2.status}: ${txt2 || r2.statusText}`);
  }
}

/* ================= Create Task ================= */

type CreateTaskBody = {
  name: string;
  description?: string;
  tags?: string[];
  assignees?: number[]; // ClickUp member numeric IDs
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep null
  }

  if (!r.ok) {
    throw new Error(`ClickUp create failed ${r.status}: ${text || r.statusText}`);
  }
  return json;
}
