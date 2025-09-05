// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { makeAuthHeader } from "@/lib/clickupAuth";

/** ---------- Safe string helpers ---------- */
const str = (v: unknown): string => String(v ?? "");
const lc  = (v: unknown): string => str(v).toLowerCase();

/** ---------- Config ---------- */
const EXCLUDED_LIST_IDS = new Set<string>(
  str(process.env.CLICKUP_EXCLUDED_LIST_IDS)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

const PAGE_LIMIT = 100;   // per request
const MAX_PAGES  = 30;    // per list safety cap

/** ---------- Types ---------- */
type TeamMember = { id: number; username: string; email: string };
type CUAssignee = { id?: number; email?: string; username?: string };
type CUTask = {
  id: string;
  name: string;
  list?: { id?: string };
  assignees?: CUAssignee[];
  parent?: string | null;
};

/** ---------- Utils ---------- */
function isNumericId(v: string | null | undefined): v is string {
  return !!v && /^[0-9]+$/.test(v);
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return makeAuthHeader(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return makeAuthHeader(envToken);
}

/** Team members → to resolve email/username -> numeric id (nice-to-have) */
async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Get team failed ${r.status}: ${text}`);
  let j: any = {};
  try { j = text ? JSON.parse(text) : {}; } catch {}
  const membersRaw: any[] = Array.isArray(j?.members) ? j.members : [];
  const members: TeamMember[] = membersRaw
    .map((m: any) => ({
      id: Number(m?.user?.id),
      username: str(m?.user?.username),
      email: str(m?.user?.email),
    }))
    .filter((m: TeamMember) => Number.isFinite(m.id));
  return members;
}

async function resolveAssigneeToNumeric(
  authHeader: string,
  teamId: string,
  incoming: string
): Promise<number | undefined> {
  const incomingStr = str(incoming);
  if (isNumericId(incomingStr)) return Number(incomingStr);
  if (!teamId) return undefined;
  try {
    const members = await fetchTeamMembers(authHeader, teamId);
    const needle = lc(incomingStr);
    let match = members.find(m => lc(m.email) === needle);
    if (match) return match.id;
    match = members.find(m => lc(m.username) === needle);
    if (match) return match.id;
    match = members.find(m => str(m.id) === incomingStr);
    if (match) return match.id;
  } catch {
    // ignore; we can still filter locally by email/username/id string
  }
  return undefined;
}

/** ---------- Space → Lists discovery (folder + space-level) ---------- */
async function fetchSpaceFolderLists(authHeader: string, spaceId: string): Promise<string[]> {
  // 1) Folders in the space
  const foldersRes = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const foldersText = await foldersRes.text();
  if (!foldersRes.ok) throw new Error(`Space folders failed ${foldersRes.status}: ${foldersText}`);
  let foldersJson: any = {};
  try { foldersJson = foldersText ? JSON.parse(foldersText) : {}; } catch {}
  const folders: any[] = Array.isArray(foldersJson?.folders) ? foldersJson.folders : [];

  // 2) All lists inside each folder
  const listIds: Set<string> = new Set();
  for (const f of folders) {
    const folderId = str(f?.id);
    if (!folderId) continue;
    const r = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`Folder lists failed ${r.status}: ${t}`);
    let j: any = {};
    try { j = t ? JSON.parse(t) : {}; } catch {}
    const lists: any[] = Array.isArray(j?.lists) ? j.lists : [];
    for (const l of lists) {
      const lid = str(l?.id);
      if (!lid) continue;
      listIds.add(lid);
    }
  }

  // 3) Space-level lists (not inside folders)
  const spaceListsRes = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const spaceListsText = await spaceListsRes.text();
  if (!spaceListsRes.ok) throw new Error(`Space lists failed ${spaceListsRes.status}: ${spaceListsText}`);
  let spaceListsJson: any = {};
  try { spaceListsJson = spaceListsText ? JSON.parse(spaceListsText) : {}; } catch {}
  const spaceLists: any[] = Array.isArray(spaceListsJson?.lists) ? spaceListsJson.lists : [];
  for (const l of spaceLists) {
    const lid = str(l?.id);
    if (!lid) continue;
    listIds.add(lid);
  }

  // 4) Exclude unwanted lists
  for (const bad of EXCLUDED_LIST_IDS) listIds.delete(bad);

  return Array.from(listIds);
}

/** ---------- List → Tasks (paged) ---------- */
async function fetchTasksForList(authHeader: string, listId: string): Promise<CUTask[]> {
  const tasks: CUTask[] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const url = new URL(`https://api.clickup.com/api/v2/list/${listId}/task`);
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("subtasks", "false");
    url.searchParams.set("order_by", "created");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_LIMIT));

    const r = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`List tasks failed (list ${listId}) ${r.status}: ${text}`);

    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch {}
    const arr: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
    if (arr.length === 0) break;

    for (const t of arr) {
      if (t?.parent) continue; // only top-level tasks
      tasks.push({
        id: str(t?.id),
        name: str(t?.name || t?.id),
        list: { id: str(t?.list?.id) },
        assignees: Array.isArray(t?.assignees) ? t.assignees : [],
        parent: t?.parent ?? null,
      });
    }

    if (arr.length < PAGE_LIMIT) break;
    page += 1;
  }

  return tasks;
}

/** ---------- Local assignee filter ---------- */
function matchesAssignee(task: CUTask, opts: { assigneeNumeric?: number; assigneeRaw?: string }): boolean {
  const { assigneeNumeric, assigneeRaw } = opts;
  const as: CUAssignee[] = Array.isArray(task.assignees) ? task.assignees : [];

  if (Number.isFinite(assigneeNumeric)) {
    return as.some(a => Number(a?.id) === Number(assigneeNumeric));
  }

  const needle = lc(assigneeRaw);
  if (!needle) return true; // show all if no filter provided

  return as.some(a =>
    lc(a?.email) === needle ||
    lc(a?.username) === needle ||
    lc(a?.id) === needle
  );
}

/** ---------- Route ---------- */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  try {
    const authHeader = await getAuthHeader(req, res);

    const sp = req.nextUrl.searchParams;
    const assigneeRaw = str(sp.get("assigneeId"));
    const debug = sp.get("debug") === "1";

    const TEAM_ID  = str(process.env.CLICKUP_TEAM_ID);
    const SPACE_ID = str(process.env.CLICKUP_SPACE_ID);
    if (!SPACE_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
    }

    // Resolve assignee to numeric (optional; we still filter by email/username if needed)
    let assigneeNumeric: number | undefined = undefined;
    if (assigneeRaw) {
      assigneeNumeric = await resolveAssigneeToNumeric(authHeader, TEAM_ID, assigneeRaw);
    }

    // 1) Discover all lists in the space (excluding configured ones)
    const listIds = await fetchSpaceFolderLists(authHeader, SPACE_ID);

    // 2) Fetch tasks for each list (per-list paging)
    const allTasks: CUTask[] = [];
    for (const lid of listIds) {
      if (EXCLUDED_LIST_IDS.has(lid)) continue;
      // eslint-disable-next-line no-await-in-loop
      const tasks = await fetchTasksForList(authHeader, lid);
      allTasks.push(...tasks);
    }

    // 3) Local filtering by assignee
    const filtered = allTasks.filter(t => matchesAssignee(t, { assigneeNumeric, assigneeRaw }));

    // 4) Shape for frontend
    const projects = filtered
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (debug) {
      return NextResponse.json({
        listsCount: listIds.length,
        countAll: allTasks.length,
        countFiltered: projects.length,
        excludedListIds: Array.from(EXCLUDED_LIST_IDS),
        assigneeResolved: assigneeNumeric ?? null,
        sample: projects.slice(0, 5),
        projects,
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
