// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { makeAuthHeader } from "@/lib/clickupAuth";

/** ---------- Config ---------- */
const EXCLUDED_LIST_IDS = new Set<string>(["32299969"]);
const PAGE_LIMIT = 100;
const MAX_PAGES  = 40;

/** ---------- Safe string helpers ---------- */
const str = (v: unknown): string => String(v ?? "");
const lc  = (v: unknown): string => str(v).toLowerCase();

/** ---------- Types ---------- */
type CUAssignee = { id?: number | string; email?: string; username?: string };
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
  const sess = session?.access_token || session?.accessToken;
  if (sess) return makeAuthHeader(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return makeAuthHeader(envToken);
}

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
    return as.some(a => Number(a?.id as any) === Number(assigneeNumeric));
  }
  const needle = lc(assigneeRaw);
  if (!needle) return true;

  return as.some(a =>
    lc(a?.email) === needle ||
    lc(a?.username) === needle ||
    lc(a?.id) === needle
  );
}

/** ---------- Fetchers ---------- */
/** Team search, optional server-side assignee filter */
async function fetchTeamTasksPaged(
  authHeader: string,
  teamId: string,
  spaceId: string,
  opts?: { assigneeNumeric?: number }
): Promise<CUTask[]> {
  const tasks: CUTask[] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
    url.searchParams.append("space_ids[]", spaceId);
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("subtasks", "false");
    url.searchParams.set("order_by", "created");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_LIMIT));

    if (opts?.assigneeNumeric != null && Number.isFinite(opts.assigneeNumeric)) {
      // Try server-side assignee filtering to reduce payloads
      url.searchParams.append("assignees[]", String(opts.assigneeNumeric));
    }

    const r = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`Team task search failed ${r.status}: ${text}`);

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

/** ---------- Route ---------- */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  try {
    const authHeader = await getAuthHeader(req, res);

    const sp = req.nextUrl.searchParams;
    const { raw: assigneeRaw, numericStr } = normalizeAssigneeRaw(str(sp.get("assigneeId")));
    const debug = sp.get("debug") === "1" || sp.get("debug") === "2";

    const TEAM_ID  = str(process.env.CLICKUP_TEAM_ID);
    const SPACE_ID = str(process.env.CLICKUP_SPACE_ID);
    if (!TEAM_ID)  return NextResponse.json({ error: "Missing CLICKUP_TEAM_ID env"  }, { status: 500 });
    if (!SPACE_ID) return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });

    const assigneeNumeric = numericStr ? Number(numericStr) : undefined;

    // 1) Try server-side filtered search first (fast path)
    let fetched = await fetchTeamTasksPaged(authHeader, TEAM_ID, SPACE_ID, { assigneeNumeric });

    // 2) If nothing came back (tenant sometimes ignores/blocks assignee filter), fetch unfiltered and local-filter
    if (fetched.length === 0) {
      fetched = await fetchTeamTasksPaged(authHeader, TEAM_ID, SPACE_ID, undefined);
    }

    // 3) Exclude lists and apply local assignee filtering (if provided)
    const filtered = fetched
      .filter(notExcludedList)
      .filter(t => matchesAssignee(t, { assigneeNumeric, assigneeRaw }));

    // 4) Shape for frontend
    const projects = filtered
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (debug) {
      // Deep debug: show what assignees exist across fetched results to diagnose mismatches
      if (sp.get("debug") === "2") {
        const uniqIds = new Set<string>();
        const uniqEmails = new Set<string>();
        const uniqUsernames = new Set<string>();
        let withAssignees = 0;

        for (const t of fetched) {
          const as: CUAssignee[] = Array.isArray(t.assignees) ? t.assignees : [];
          if (as.length) withAssignees++;
          for (const a of as) {
            if (a?.id != null) uniqIds.add(str(a.id));
            if (a?.email) uniqEmails.add(lc(a.email));
            if (a?.username) uniqUsernames.add(lc(a.username));
          }
        }

        return NextResponse.json({
          countFetched: fetched.length,
          countFiltered: projects.length,
          excludedListIds: Array.from(EXCLUDED_LIST_IDS),
          assigneeResolved: assigneeNumeric ?? null,
          withAssignees,
          uniqAssigneeIdCount: uniqIds.size,
          uniqAssigneeIds: Array.from(uniqIds).slice(0, 50),
          uniqEmailsCount: uniqEmails.size,
          uniqEmails: Array.from(uniqEmails).slice(0, 50),
          uniqUsernamesCount: uniqUsernames.size,
          uniqUsernames: Array.from(uniqUsernames).slice(0, 50),
          sample: projects.slice(0, 5),
          projects,
        });
      }

      return NextResponse.json({
        countAll: fetched.length,
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
