// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { makeAuthHeader } from "@/lib/clickupAuth";

/** ---------- Config ---------- */
const EXCLUDED_LIST_IDS = new Set<string>(["32299969"]);
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

/** ---------- Safe string helpers (kill the never error) ---------- */
const str = (v: unknown): string => String(v ?? "");
const lc  = (v: unknown): string => str(v).toLowerCase();

/** ---------- Types ---------- */
type TeamMember = { id: number; username: string; email: string };
type CUAssignee = { id?: number; email?: string; username?: string };
type ClickUpTask = {
  id: string;
  name: string;
  list?: { id?: string };
  assignees?: CUAssignee[];
  parent?: string | null;
};

/** ---------- Helpers ---------- */
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

/** Resolve email/username/string -> numeric member id (safe) */
async function resolveAssigneeToNumeric(
  authHeader: string,
  teamId: string,
  incoming: string
): Promise<number | undefined> {
  const incomingStr: string = str(incoming);
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
    // ignore; continue without resolved id
  }
  return undefined;
}

/** Page through all tasks in a Space */
async function fetchAllSpaceTasks(authHeader: string, spaceId: string): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
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
    if (!r.ok) throw new Error(`Space tasks failed ${r.status}: ${text}`);

    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch {}
    const arr: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
    if (arr.length === 0) break;

    for (const t of arr) {
      if (t?.parent) continue; // top-level only
      const assignees: CUAssignee[] = Array.isArray(t?.assignees) ? t.assignees : [];
      tasks.push({
        id: str(t.id),
        name: str(t.name || t.id),
        list: { id: str(t?.list?.id) },
        assignees,
        parent: t?.parent ?? null,
      });
    }

    if (arr.length < PAGE_LIMIT) break;
    page += 1;
  }

  return tasks;
}

/** Local filter by consultant (assignee) */
function matchesAssignee(
  task: ClickUpTask,
  opts: { assigneeNumeric?: number; assigneeRaw?: string }
): boolean {
  const { assigneeNumeric, assigneeRaw } = opts;
  const as: CUAssignee[] = Array.isArray(task.assignees) ? task.assignees : [];

  if (Number.isFinite(assigneeNumeric)) {
    return as.some(a => Number(a?.id) === Number(assigneeNumeric));
  }

  const needle = lc(assigneeRaw);
  if (!needle) return true; // no assignee filter provided

  return as.some(a =>
    lc(a?.email) === needle ||
    lc(a?.username) === needle ||
    lc(a?.id) === needle
  );
}

function notExcludedList(task: ClickUpTask): boolean {
  const lid = str(task?.list?.id);
  return !EXCLUDED_LIST_IDS.has(lid);
}

/** ---------- Route ---------- */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  try {
    const authHeader = await getAuthHeader(req, res);

    const sp = req.nextUrl.searchParams;
    const assigneeRaw: string = str(sp.get("assigneeId"));
    const debug = sp.get("debug") === "1";

    const TEAM_ID = str(process.env.CLICKUP_TEAM_ID);
    const SPACE_ID = str(process.env.CLICKUP_SPACE_ID);
    if (!SPACE_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
    }

    let assigneeNumeric: number | undefined = undefined;
    if (assigneeRaw) {
      assigneeNumeric = await resolveAssigneeToNumeric(authHeader, TEAM_ID, assigneeRaw);
    }

    // 1) Fetch all space tasks
    const allSpaceTasks = await fetchAllSpaceTasks(authHeader, SPACE_ID);

    // 2) Local filtering (assignee + exclude lists)
    const filtered = allSpaceTasks
      .filter(notExcludedList)
      .filter(t => matchesAssignee(t, { assigneeNumeric, assigneeRaw }));

    // 3) Shape
    const projects = filtered
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (debug) {
      return NextResponse.json({
        countAll: allSpaceTasks.length,
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
