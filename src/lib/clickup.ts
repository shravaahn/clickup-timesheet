// src/lib/clickup.ts
/**
 * ClickUp API helpers (OAuth or Personal Token).
 * We support both the task-scoped time endpoint and a fallback to the team-level time_entries API.
 */

export function makeAuthHeader(token: string) {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function getAuthHeader(req: Request, res?: Response): Promise<string> {
  // If you're already calling this via /api where you kept session logic elsewhere, you can just
  // pass a prebuilt Authorization header down to these helpers instead of using this function.
  // Keeping this for compatibility with your current imports.
  const hdr = (req.headers.get("authorization") || "").trim();
  if (hdr) return makeAuthHeader(hdr);

  // Fallback to env token (personal token) if present
  const envTok = process.env.CLICKUP_API_TOKEN || "";
  if (!envTok) throw new Error("No Authorization header and no CLICKUP_API_TOKEN env set");
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

  // 1) Primary: task-scoped endpoint
  {
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/time`;
    const body: any = {
      start: cleanStart,
      time: cleanTime, // ClickUp expects "time" (duration) when no end is provided
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

    if (r.ok) return; // success!

    // Read body for diagnostics
    const txt = await r.text().catch(() => "");
    const msg = `${r.status}: ${txt || r.statusText}`;

    // If it's clearly the "interval" validation or route mismatch, try fallback
    const shouldFallback =
      r.status === 404 ||
      txt.includes("Route not found") ||
      txt.includes("Must time spent if providing interval without an end");

    if (!shouldFallback) {
      throw new Error(`Task time entry failed ${msg}`);
    }
  }

  // 2) Fallback: team-level time_entries endpoint (requires TEAM_ID)
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  if (!TEAM_ID) {
    throw new Error(
      "Task time entry failed and no CLICKUP_TEAM_ID set for team-level fallback"
    );
  }

  const endMs = cleanStart + cleanTime;
  const url2 = `https://api.clickup.com/api/v2/team/${encodeURIComponent(TEAM_ID)}/time_entries`;
  const body2: any = {
    start: cleanStart,
    end: endMs,
    tid: String(taskId), // task ID field name for this endpoint
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
