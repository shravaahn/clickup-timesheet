// src/lib/clickup.ts
/* Minimal ClickUp REST v2 helper focused on tasks and time entries.
   Uses default time fields: `time_estimate` and time entries API.
*/
const API = "https://api.clickup.com/api/v2";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function headers() {
  return {
    "Authorization": requiredEnv("CLICKUP_API_TOKEN"),
    "Content-Type": "application/json",
  };
}

export type ClickUpTask = {
  id: string;
  name: string;
  time_estimate?: number | null; // ms
};

export async function cuCreateTask(listId: string, payload: {
  name: string;
  assignees?: number[]; // ClickUp member IDs (numbers)
  description?: string;
}): Promise<ClickUpTask> {
  const res = await fetch(`${API}/list/${listId}/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
    // NOTE: ClickUp sometimes needs "assignees" as array of numbers on create.
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    throw new Error(`ClickUp create task failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function cuUpdateTask(taskId: string, patch: Partial<ClickUpTask>) {
  const res = await fetch(`${API}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    throw new Error(`ClickUp update task failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/** Create a time entry using team-level endpoint (works with default time tracking).
    start: epoch ms UTC; duration: ms; assignee: ClickUp user ID (number)
*/
export async function cuCreateTimeEntry(teamId: string, payload: {
  start: number;          // epoch ms UTC
  duration: number;       // ms
  task_id: string;
  assignee?: number;
  description?: string;
  billable?: boolean;
}) {
  const res = await fetch(`${API}/team/${teamId}/time_entries`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>"");
    throw new Error(`ClickUp time entry failed: ${res.status} ${txt}`);
  }
  return res.json();
}
