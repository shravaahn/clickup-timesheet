// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

type ProjectOut = { id: string; name: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const token = session.accessToken;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const assigneeId = req.nextUrl.searchParams.get("assigneeId");
  if (!assigneeId) {
    return NextResponse.json({ error: "assigneeId required" }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${token}` };
  const debugMode = req.nextUrl.searchParams.get("debug") === "1";
  const debug: any = { teams: [] as string[], calls: [] as any[] };

  // 1) Get all teams/workspaces visible to this token
  const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
    headers,
    cache: "no-store",
  });
  if (!teamsResp.ok) {
    const body = await teamsResp.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to fetch teams", details: body },
      { status: 500 }
    );
  }
  const teamsJson = await teamsResp.json().catch(() => ({} as any));
  const teamIds: string[] = Array.isArray(teamsJson?.teams)
    ? teamsJson.teams.map((t: any) => String(t?.id)).filter(Boolean)
    : [];
  debug.teams = teamIds;

  // 2) For each team, search tasks assigned to the user; group by list (project)
  const projectsMap = new Map<string, ProjectOut>();

  for (const teamId of teamIds) {
    let page = 0;
    // page in chunks (ClickUp uses ~100/page). Cap at 10 pages to be safe.
    for (let round = 0; round < 10; round++) {
      const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
      url.searchParams.set("assignees[]", assigneeId);
      url.searchParams.set("include_closed", "false");
      url.searchParams.set("subtasks", "true");
      url.searchParams.set("page", String(page));

      const r = await fetch(url.toString(), { headers, cache: "no-store" });
      if (!r.ok) {
        const bodyText = await r.text().catch(() => "");
        debug.calls.push({ teamId, page, ok: false, status: r.status, bodyText });
        break; // skip this team if route not authorized/available
      }

      const j = await r.json().catch(() => ({} as any));
      const tasks: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
      debug.calls.push({ teamId, page, ok: true, status: 200, count: tasks.length });

      for (const t of tasks) {
        // ClickUp task usually carries list info under t.list
        const listId = String(t?.list?.id ?? t?.list_id ?? "");
        if (!listId) continue;
        const listName = String(t?.list?.name ?? "") || listId;

        // Last write wins, but they should be consistent
        projectsMap.set(listId, { id: listId, name: listName });
      }

      if (tasks.length < 100) break; // likely no more pages
      page += 1;
    }
  }

  // 3) If some list names are missing, fetch them individually
  const missing = Array.from(projectsMap.values()).filter((p) => !p.name || p.name === p.id);
  for (const p of missing) {
    try {
      const lr = await fetch(`https://api.clickup.com/api/v2/list/${p.id}`, {
        headers,
        cache: "no-store",
      });
      if (lr.ok) {
        const lj = await lr.json().catch(() => ({} as any));
        const nm = lj?.list?.name ?? lj?.name;
        if (nm) projectsMap.set(p.id, { id: p.id, name: String(nm) });
      }
    } catch {
      /* ignore */
    }
  }

  const projects = Array.from(projectsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const payload: any = { projects, source: "team_tasks" };
  if (debugMode) payload.debug = debug;

  return new NextResponse(JSON.stringify(payload), {
    headers: res.headers, // forward Set-Cookie
  });
}
