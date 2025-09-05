// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

// Helper: fetch one page from ClickUp Team "Tasks" search
async function fetchTeamTasksPage(opts: {
  baseAuth: string;
  teamId: string;
  spaceId: string;
  assigneeId: string;
  page: number;
}) {
  const { baseAuth, teamId, spaceId, assigneeId, page } = opts;

  const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
  // Filters:
  url.searchParams.set("include_closed", "false"); // only open tasks
  url.searchParams.set("subtasks", "false");       // exclude subtasks
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));

  // Arrays must be []-suffixed for ClickUp:
  url.searchParams.append("space_ids[]", spaceId);
  url.searchParams.append("assignees[]", assigneeId);

  const r = await fetch(url.toString(), {
    headers: { Authorization: baseAuth, Accept: "application/json" },
    // never cache auth queries
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep as text */ }

  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

// Fallback: some workspaces prefer the space endpoint
async function fetchSpaceTasksPage(opts: {
  baseAuth: string;
  spaceId: string;
  assigneeId: string;
  page: number;
}) {
  const { baseAuth, spaceId, assigneeId, page } = opts;
  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));
  url.searchParams.append("assignees[]", assigneeId);

  const r = await fetch(url.toString(), {
    headers: { Authorization: baseAuth, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

export async function GET(req: NextRequest) {
  const res = new NextResponse();

  // Session & token
  const session: any = await getIronSession(req, res, sessionOptions);
  const auth = session?.access_token || session?.accessToken;
  if (!auth) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  // NOTE: in our app we store the full "Bearer XXX" string as access_token.
  const authHeader = String(auth).startsWith("Bearer") ? String(auth) : `Bearer ${auth}`;

  // Inputs
  const sp = req.nextUrl.searchParams;
  const assigneeId = sp.get("assigneeId") || "";
  const debug = sp.get("debug") === "1";

  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  const SPACE_ID = process.env.CLICKUP_SPACE_ID || "";

  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }
  if (!SPACE_ID) {
    return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
  }

  // Page through tasks (team endpoint first; fallback to space endpoint on 404)
  const projectsMap = new Map<string, string>();
  const debugInfo: any = { used: "team", calls: [] as any[] };
  let page = 0;
  let maxPages = 15; // safety cap

  // Try Team Tasks search
  while (page < maxPages) {
    const out = await fetchTeamTasksPage({
      baseAuth: authHeader,
      teamId: TEAM_ID,
      spaceId: SPACE_ID,
      assigneeId,
      page,
    });
    debugInfo.calls.push({ url: out.url, status: out.status });

    if (!out.ok) {
      // If ClickUp says "Route not found" or similar, switch to fallback
      if (out.status === 404 || String(out.text || "").includes("Route not found")) {
        debugInfo.used = "space_fallback";
        break;
      }
      // Another error—return it so we can see what's wrong
      return NextResponse.json(
        { error: "ClickUp error", details: out.text || out.json, from: "team", urlTried: out.url },
        { status: 502 }
      );
    }

    const items = Array.isArray(out.json?.tasks) ? out.json.tasks : [];
    for (const t of items) {
      // Just in case, ensure no subtasks: ClickUp returns parent=null for top-level tasks
      if (t?.parent) continue;
      const id = String(t.id);
      const name = String(t.name || id);
      projectsMap.set(id, name);
    }

    if (items.length === 0) break; // no more pages
    page += 1;
  }

  // If we didn't get anything and switched to fallback:
  if (debugInfo.used === "space_fallback" && projectsMap.size === 0) {
    page = 0;
    while (page < maxPages) {
      const out = await fetchSpaceTasksPage({
        baseAuth: authHeader,
        spaceId: SPACE_ID,
        assigneeId,
        page,
      });
      debugInfo.calls.push({ url: out.url, status: out.status });

      if (!out.ok) {
        return NextResponse.json(
          { error: "ClickUp error", details: out.text || out.json, from: "space", urlTried: out.url },
          { status: 502 }
        );
      }
      const items = Array.isArray(out.json?.tasks) ? out.json.tasks : [];
      for (const t of items) {
        if (t?.parent) continue;
        const id = String(t.id);
        const name = String(t.name || id);
        projectsMap.set(id, name);
      }
      if (items.length === 0) break;
      page += 1;
    }
  }

  const projects = Array.from(projectsMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (debug) {
    return NextResponse.json({
      projects,
      count: projects.length,
      debug: debugInfo,
    });
  }

  return NextResponse.json({ projects });
}
