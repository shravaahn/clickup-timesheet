// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Fetch ALL lists in a space:
 *  - folderless lists: GET /space/{space_id}/list?archived=false
 *  - folders in space: GET /space/{space_id}/folder?archived=false
 *  - lists inside each folder: GET /folder/{folder_id}/list?archived=false
 *
 * Then page tasks from each list, exclude one list (32299969), and finally
 * filter by assignee in-memory (fallback to all if empty).
 */

const EXCLUDED_LIST_IDS = new Set<string>(["32299969"]);

function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}
function isNumericString(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]+$/.test(v);
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN;
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return bearer(envToken);
}

/* ---------- ClickUp helpers ---------- */

async function fetchFolderlessLists(authHeader: string, spaceId: string) {
  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/list`);
  url.searchParams.set("archived", "false");

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Folderless lists failed ${r.status}: ${text || ""}`);
  const arr = Array.isArray(json?.lists) ? json.lists : [];
  return arr.map((l: any) => ({ id: String(l?.id), name: String(l?.name ?? l?.id ?? "Unnamed") }));
}

async function fetchFoldersInSpace(authHeader: string, spaceId: string) {
  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/folder`);
  url.searchParams.set("archived", "false");

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Folders failed ${r.status}: ${text || ""}`);
  const arr = Array.isArray(json?.folders) ? json.folders : [];
  // normalize to { id, name }
  return arr.map((f: any) => ({ id: String(f?.id), name: String(f?.name ?? f?.id ?? "Unnamed") }));
}

async function fetchListsInFolder(authHeader: string, folderId: string) {
  const url = new URL(`https://api.clickup.com/api/v2/folder/${folderId}/list`);
  url.searchParams.set("archived", "false");

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Folder lists failed ${r.status}: ${text || ""}`);
  const arr = Array.isArray(json?.lists) ? json.lists : [];
  return arr.map((l: any) => ({ id: String(l?.id), name: String(l?.name ?? l?.id ?? "Unnamed") }));
}

async function fetchTasksForList(authHeader: string, listId: string, maxPages = 25) {
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
    if (!r.ok) break; // skip problematic list, continue others

    const items = Array.isArray(json?.tasks) ? json.tasks : [];
    if (!items.length) break;

    for (const t of items) {
      if (t?.parent) continue; // keep only top-level tasks
      all.push(t);
    }
  }
  return all;
}

/* --- resolve assignee (optional) --- */
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
    .filter((m: any) => Number.isFinite(m.id));
}

async function resolveAssigneeNumeric(authHeader: string, teamId: string, incoming: string | null) {
  if (!incoming) return undefined;
  if (isNumericString(incoming)) return Number(incoming);
  if (!teamId) return undefined;

  try {
    const members = await fetchTeamMembers(authHeader, teamId);
    const needle = String(incoming).toLowerCase();
    const match =
      members.find(m => (m.email || "").toLowerCase() === needle) ||
      members.find(m => (m.username || "").toLowerCase() === needle) ||
      members.find(m => String(m.id) === String(incoming));
    return match?.id;
  } catch {
    return undefined;
  }
}

/* ---------- Route ---------- */

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

    const assigneeNumeric = await resolveAssigneeNumeric(authHeader, TEAM_ID, assigneeRaw);

    // 1) collect lists: folderless + lists inside each folder
    const folderless = await fetchFolderlessLists(authHeader, SPACE_ID);

    const folders = await fetchFoldersInSpace(authHeader, SPACE_ID);
    let listsInFolders: { id: string; name: string }[] = [];
    for (const f of folders) {
      try {
        const ls = await fetchListsInFolder(authHeader, f.id);
        listsInFolders.push(...ls);
      } catch {
        // skip this folder if it errors
      }
    }

    const allLists = [...folderless, ...listsInFolders].filter(
      (l) => !EXCLUDED_LIST_IDS.has(String(l.id))
    );

    // 2) fetch tasks for each list
    const allTasks: any[] = [];
    for (const l of allLists) {
      try {
        const ts = await fetchTasksForList(authHeader, l.id);
        allTasks.push(...ts);
      } catch {
        // skip list on error
      }
    }

    // 3) optional in-memory filter by assignee (fallback to all if none match)
    let tasksFiltered = allTasks;
    if (typeof assigneeNumeric === "number") {
      tasksFiltered = allTasks.filter((t) =>
        (Array.isArray(t?.assignees) ? t.assignees : []).some((a: any) => Number(a?.id) === assigneeNumeric)
      );
      if (tasksFiltered.length === 0) {
        tasksFiltered = allTasks; // show something rather than empty screen
      }
    }

    // 4) normalize for UI
    const projects = tasksFiltered
      .map((t: any) => ({ id: String(t?.id), name: String(t?.name ?? t?.id ?? "Untitled") }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (debug) {
      // helpful debug payload
      const uniqAssignees = new Set<string>();
      for (const t of allTasks) {
        for (const a of (Array.isArray(t?.assignees) ? t.assignees : [])) {
          if (a?.id != null) uniqAssignees.add(String(a.id));
        }
      }
      return NextResponse.json({
        folderlessCount: folderless.length,
        foldersCount: folders.length,
        listsInFoldersCount: listsInFolders.length,
        listsUsed: allLists.length,
        excludedListIds: Array.from(EXCLUDED_LIST_IDS),
        countFetched: allTasks.length,
        countFiltered: tasksFiltered.length,
        assigneeResolved: assigneeNumeric ?? null,
        uniqAssigneeIdCount: uniqAssignees.size,
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
