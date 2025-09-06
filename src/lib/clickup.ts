// src/lib/clickup.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

export function makeAuthHeader(tokenOrBearer: string) {
  const t = String(tokenOrBearer || "").trim();
  return t.startsWith("Bearer ") ? t : `Bearer ${t}`;
}

/** Try session first, then env. Return null if neither exists (so callers can choose to skip sync but still succeed). */
export async function getAuthHeaderMaybe(req?: NextRequest, res?: NextResponse): Promise<string | null> {
  try {
    if (req && res) {
      const session: any = await getIronSession(req, res, sessionOptions);
      const sess = session?.access_token || session?.accessToken;
      if (sess) return makeAuthHeader(String(sess));
    }
  } catch {
    // ignore session errors; we'll try env next
  }
  const env = process.env.CLICKUP_API_TOKEN;
  if (env && String(env).trim()) return makeAuthHeader(String(env));
  return null;
}

/** Strict version: throw if not available. Use sparingly. */
export async function getAuthHeader(req?: NextRequest, res?: NextResponse) {
  const h = await getAuthHeaderMaybe(req, res);
  if (!h) throw new Error("No ClickUp token found: add CLICKUP_API_TOKEN (Personal API Token) or sign in with ClickUp OAuth.");
  return h;
}

/** Create a task (optionally with assignees) */
export async function cuCreateTask(opts: {
  authHeader: string;
  listId: string;
  name: string;
  tags?: string[];
  assignees?: number[]; // numeric ClickUp member IDs
}) {
  const { authHeader, listId, name, tags = [], assignees } = opts;
  const body: any = { name, tags };
  if (assignees?.length) body.assignees = assignees;

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

/** Overwrite a task's total time estimate (milliseconds) */
export async function cuUpdateTimeEstimate(authHeader: string, taskId: string, totalMs: number) {
  const r = await fetch(`https://api/clickup.com/api/v2/task/${taskId}`.replace("api/", "api/"), {
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

/** Add a manual time entry (requires start + time, both in ms) */
export async function cuCreateManualTimeEntry(opts: {
  authHeader: string;
  taskId: string;
  startMs: number;
  timeMs: number;
  description?: string;
  assignee?: number;
}) {
  const { authHeader, taskId, startMs, timeMs, description, assignee } = opts;

  const body: any = {
    start: Math.floor(startMs),
    time: Math.max(1, Math.floor(timeMs)), // must be > 0
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
