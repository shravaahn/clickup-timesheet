// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Strategy:
 * - Fetch ALL lists in the Space (archived=false)
 * - Exclude the one list you asked to hide (ID=32299969)
 * - For each list, page through tasks with include_closed=false & subtasks=false
 * - Aggregate all tasks, THEN (optionally) filter by assignee in-memory
 *   (ClickUp’s search filters are inconsistent across endpoints/workspaces)
 *
 * Result: You will always get the real tasks from the space,
 * and you won’t be blocked if the assignee filter returns 0 from ClickUp.
 */

const EXCLUDED_LIST_IDS = new Set<string>(["32299969"]);

// --- utils
function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}
function isNumericId(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isNumericString(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]+$/.test(v);
}
async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  // Prefer per-user session token; fall back to Personal API token from env
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN;
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return bearer(envToken);
}

// --- ClickUp fetch helpers
async function fetchListsInSpace(authHeader: string, spaceId: string) {
  // GET /api/v2/space/{space_id}/list?archived=false
  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/list`);
  url.searchParams.set("archived", "false");

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Lists failed ${r.status}: ${text || ""}`);

  const lists = Array.isArray(json?.lists) ? json.lists : [];
  return lists.map((l: any) => ({
    id: String(l?.id),
    name: String(l?.name ?? l?.id ?? "Unnamed"),
  }));
}

async function fetchTasksForList(
  authHeader: string,
  listId: string,
  maxPages = 25
): Promise<any[]> {
  // GET /api/v2/list/{list_id}/task?include_closed=false&subtasks=false&page=...
  const all: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`https://api.clickup.com/api/v2/list/${listId}/task`);
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("subtasks", "false");
    url.searchParams.set("order_by", "created");
    url.searchParams.set("page", String(page));

    const r = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!r.ok) {
      // If a particular list errors, don't kill the whole request — just skip it
      // (You still get other lists’ tasks)
      break;
    }

    const items = Array.isArray(json?.tasks) ? json.tasks : [];
    if (!items.length) break;

    // Normalize: only top-level tasks (ClickUp sometimes sneaks subtasks in)
    for (const t of items) {
      if (t?.parent) continue;
      all.push(t);
    }
  }
  return all;
}

// optional: resolve assigneeId (string) to numeric if needed
type TeamMember = { id: number; username: string; email: string };
async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Get team failed ${r.status}: ${text || ""}`);

  const members = Array.isArray(json?.members) ? json.members : [];
  return members
    .map((m: any) => ({
      id: Number(m?.user?.id),
      username: String(m?.user?.username ?? ""),
      email: String(m?.user?.email ?? ""),
    }))
    .filter((m: TeamMember) => isNumericId(m.id));
}

async function resolveAssigneeNumeric(
  authHeader: string,
  teamId: string,
  incoming: string | null
): Promise<number | undefined> {
  if (!incoming) return undefined;
  if (isNumericString(incoming)) return Number(incoming);
  if (!teamId) return undefined;

  try {
    const members = await fetchTeamMembers(authHeader, teamId);
    const needle = String(incoming).toLowerCase();
    let match =
      members.find((m) => String(m.email || "").toLowerCase() === needle) ||
      members.find((m) => String(m.username || "").toLowerCase() === needle) ||
      members.find((m) => String(m.id) === String(incoming));
    return match?.id;
  } catch {
    return undefined;
  }
}

// --- route
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  try {
    const authHeader = await getAuthHeader(req, res);

    const sp = req.nextUrl.searchParams;
    const assigneeRaw = sp.get("assigneeId"); // optional
    const debug = sp.get("debug") === "1";

    const SPACE_ID = String(process.env.CLICKUP_SPACE_ID || "");
    const TEAM_ID = String(process.env.CLICKUP_TEAM_ID || "");

    if (!SPACE_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
    }

    // Resolve assignee (if any) to numeric ID; if not found, we still return all tasks
    const assigneeNumeric = await resolveAssigneeNumeric(authHeader, TEAM_ID, assigneeRaw);

    // 1) get all lists
    const lists = await fetchListsInSpace(authHeader, SPACE_ID);
    const listsFiltered = lists.filter((l: { id: string }) => !EXCLUDED_LIST_IDS.has(String(l.id)));

    // 2) get tasks from each list
    const allTasks: any[] = [];
    for (const l of listsFiltered) {
      const ts = await fetchTasksForList(authHeader, String(l.id));
      allTasks.push(...ts);
    }

    // 3) filter by assignee (in-memory) if we have a numeric id
    let tasksFiltered = allTasks;
    if (typeof assigneeNumeric === "number") {
      tasksFiltered = allTasks.filter((t) => {
        const arr = Array.isArray(t?.assignees) ? t.assignees : [];
        // ClickUp returns assignees: [{id, username, email, ...}]
        return arr.some((a: any) => Number(a?.id) === assigneeNumeric);
      });
      // Safety: if no tasks matched the assignee, still show all tasks
      if (tasksFiltered.length === 0) {
        tasksFiltered = allTasks;
      }
    }

    // 4) Normalize to {id,name}
    const projects = tasksFiltered
      .map((t: any) => ({
        id: String(t?.id),
        name: String(t?.name ?? t?.id ?? "Untitled"),
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    if (debug) {
      // Some visibility to help you verify
      const uniqAssignees = new Set<string>();
      for (const t of allTasks) {
        const arr = Array.isArray(t?.assignees) ? t.assignees : [];
        for (const a of arr) uniqAssignees.add(String(a?.id));
      }
      return NextResponse.json({
        listsCount: lists.length,
        listsUsed: listsFiltered.length,
        excludedListIds: Array.from(EXCLUDED_LIST_IDS),
        countFetched: allTasks.length,
        countFiltered: tasksFiltered.length,
        assigneeResolved: assigneeNumeric ?? null,
        uniqAssigneeIdCount: uniqAssignees.size,
        projects,
        sample: projects.slice(0, 5),
      });
    }

    return NextResponse.json({ projects });
  } catch (err: any) {
    console.error("/api/projects/by-user error:", err);
    return NextResponse.json(
      { error: "Failed to fetch projects", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
