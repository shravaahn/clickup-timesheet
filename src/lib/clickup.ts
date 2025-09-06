// src/lib/clickup.ts
/**
 * Minimal ClickUp helpers:
 * - makeAuthHeader
 * - pushEstimateToClickUp(taskId, hours)
 * - createTimeEntry(teamId, taskId, assigneeId, hours, note)
 *
 * Notes:
 * - ClickUp time_estimate is milliseconds on the task.
 * - Time entries are created at team level.
 */
export function makeAuthHeader(token: string) {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function pushEstimateToClickUp(auth: string, taskId: string, hours: number) {
  // ClickUp expects ms for time_estimate
  const ms = Math.max(0, Math.round(hours * 3600_000));
  const r = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ time_estimate: ms }),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp estimate update failed ${r.status}: ${t}`);
  }
}

export async function createTimeEntry(opts: {
  auth: string;
  teamId: string;
  taskId: string;
  assigneeId?: string | number | null;
  hours: number;
  note?: string;
}) {
  const { auth, teamId, taskId, assigneeId, hours, note } = opts;
  const durationMs = Math.max(1, Math.round(hours * 3600_000)); // at least 1ms

  // Create a time entry starting "now - duration"
  const end = Date.now();
  const start = end - durationMs;

  const payload: any = {
    description: note || "",
    tags: [],
    start,
    end,
    tid: String(taskId), // task id
  };
  if (assigneeId != null) payload.assignee = String(assigneeId);

  const r = await fetch(`https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/time_entries`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp time entry failed ${r.status}: ${t}`);
  }
}
