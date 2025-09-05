// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { makeAuthHeader } from "@/lib/clickupAuth";

/** ---------- Config ---------- */
const EXCLUDED_LIST_IDS = new Set<string>(["32299969"]);
const PAGE_LIMIT = 100; // API may not honor; still set it
const MAX_PAGES  = 40;  // safety cap

/** ---------- Safe string helpers ---------- */
const str = (v: unknown): string => String(v ?? "");
const lc  = (v: unknown): string => str(v).toLowerCase();

/** ---------- Types ---------- */
type CUAssignee = { id?: number; email?: string; username?: string };
type CUTask = {
  id: string;
  name: string;
  list?: { id?: string };
  assignees?: CUAssignee[];
  parent?: string | null;
};

/** ---------- Utils ---------- */
function digitsOnly(v: string): string {
  const m = String(v || "").match(/[0-9]+/g);
  return m ? m.join("") : "";
}

function normalizeAssigneeRaw(v: string | null): { raw: string; numericStr?: string } {
  const raw = str(v).trim();
  const numericStr = digitsOnly(raw);
  return { raw, numericStr: numericStr || undefined };
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken; // OAuth case
  if (sess) return makeAuthHeader(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return makeAuthHeader(envToken); // handles pk_ vs Bearer
}

/** ---------- Page through Team Search (scoped to Space) ---------- */
async function fetchAllTeamTasks(
  authHeader: string,
  teamId: string,
  spaceId: string
): Promise<CUTask[]> {
  const tasks: CUTask[] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
    // Scope & filters
    url.searchParams.append("space_ids[]", spaceId);
    url.searchParams.set("include_closed", "false"); // open tasks only
    url.searchParams.set("subtasks", "false");       // ignore subtasks
    url.searchParams.set("order_by", "created");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_LIMIT)); // may not be honored

    const r = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) {
      throw new Error(`Team task search failed ${r.status}: ${text}`);
    }

    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch {}

    const arr: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
    if (arr.length === 0) break;

    for (const t of arr) {
      if (t?.parent) continue; // top-level tasks only
      tasks.push({
        id: str(t?.id),
        name: str(t?.name || t?.id),
        list: { id: str(t?.list?.id) },
        assignees: Array.isArray(t?.assignees) ? t.assignees : [],
        parent: t?.parent ?? null,
      });
    }

    // If less than PAGE_LIMIT came back, we're likely done
    if (arr.length < PAGE_LIMIT) break;
    page += 1;
  }

  return tasks;
}

/** ---------- Local filters ---------- */
function notExcludedList(task: CUTask): boolean {
  const lid = str(task?.list?.id);
  return !EXCLUDED_LIST_IDS.has(lid);
}

function matchesAssignee(
  task: CUTask,
  opts: { assigneeNumeric?: number; assigneeRaw?: string }
): boolean {
  const { assigneeNumeric, assigneeRaw } = opts;
  const as: CUAssignee[] = Array.isArray(task.assignees) ? task.assignees : [];

  if (Number.isFinite(assigneeNumeric)) {
    return as.some(a => Number(a?.id) === Number(assigneeNumeric));
  }

  const needle = lc(assigneeRaw);
  if (!needle) return true; // if no assignee provided, include all

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
    const { raw: assigneeRaw, numericStr } = normalizeAssigneeRaw(str(sp.get("assigneeId")));
    const debug = sp.get("debug") === "1";

    const TEAM_ID  = str(process.env.CLICKUP_TEAM_ID);
    const SPACE_ID = str(process.env.CLICKUP_SPACE_ID);

    if (!TEAM_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_TEAM_ID env" }, { status: 500 });
    }
    if (!SPACE_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
    }

    // 1) Pull ALL tasks for the Space via TEAM search (no assignee filter server-side)
    const all = await fetchAllTeamTasks(authHeader, TEAM_ID, SPACE_ID);

    // 2) Exclude lists & filter by assignee locally
    const assigneeNumeric = numericStr ? Number(numericStr) : undefined;
    const filtered = all
      .filter(notExcludedList)
      .filter(t => matchesAssignee(t, { assigneeNumeric, assigneeRaw }));

    // 3) Shape
    const projects = filtered
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (debug) {
      return NextResponse.json({
        countAll: all.length,
        countFiltered: projects.length,
        excludedListIds: Array.from(EXCLUDED_LIST_IDS),
        assigneeResolved: Number.isFinite(assigneeNumeric) ? assigneeNumeric : null,
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
