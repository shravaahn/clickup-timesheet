// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

type CUUser = { id?: string | number };
type CUList = { id?: string | number; name?: string };
type CUTask = {
  id: string | number;
  name?: string;
  parent?: string | null;
  assignees?: CUUser[];
  list?: CUList;
};

function bearer(token?: string | null) {
  if (!token) return "";
  const t = token.trim();
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as any;

  const auth = bearer(session?.access_token || session?.accessToken);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");
  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }

  const SPACE_ID = (process.env.CLICKUP_SPACE_ID || "").trim();
  if (!SPACE_ID) {
    return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
  }

  const includeClosed = searchParams.get("includeClosed") === "1"; // default false
  const debugMode = searchParams.get("debug") === "1";

  const headers = {
    Authorization: auth,
    Accept: "application/json",
  };

  const seen = new Set<string>();
  const projects: { id: string; name: string }[] = [];
  const debug: any = { calls: [] as any[], spaceId: SPACE_ID, assigneeId, includeClosed };

  let page = 0;
  while (true) {
    const url = new URL(`https://api.clickup.com/api/v2/space/${SPACE_ID}/task`);
    // Only top-level tasks
    url.searchParams.set("subtasks", "false");
    // Only tasks assigned to this user
    url.searchParams.append("assignees[]", assigneeId);
    // Include closed?
    url.searchParams.set("include_closed", includeClosed ? "true" : "false");
    // Pagination
    url.searchParams.set("page", String(page));

    const r = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!r.ok) {
      const bodyText = await r.text().catch(() => "");
      return NextResponse.json(
        { error: "ClickUp error", details: bodyText || r.statusText },
        { status: 502 }
      );
    }

    const j = await r.json().catch(() => ({} as any));
    const tasks: CUTask[] = Array.isArray(j?.tasks) ? j.tasks : [];

    debug.calls.push({ page, count: tasks.length });

    if (tasks.length === 0) break;

    for (const t of tasks) {
      // safety double-check: skip subtasks (API should already exclude when subtasks=false)
      if (t.parent) continue;

      const id = String(t.id);
      if (seen.has(id)) continue;
      seen.add(id);

      // “Project” = the task itself (name = task name)
      const name = (t.name || id).trim();
      projects.push({ id, name });
    }

    // ClickUp pages are typically 100; if fewer → end
    if (tasks.length < 100) break;
    page += 1;
  }

  // sort by name for stable UI
  projects.sort((a, b) => a.name.localeCompare(b.name));

  const payload: any = { projects, source: "space_tasks_assignee" };
  if (debugMode) payload.debug = debug;

  return new NextResponse(JSON.stringify(payload), { headers: res.headers });
}
