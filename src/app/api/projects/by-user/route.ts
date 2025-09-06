// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/* ---------- helpers ---------- */
type TaskLite = { id: string; name: string; list?: { id?: string } | null };

const EXCLUDED = new Set(String(process.env.CLICKUP_EXCLUDED_LIST_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
);

async function fetchTeamTasksPage(opts: {
  authHeader: string;
  teamId: string;
  spaceId: string;
  assigneeId: string; // numeric or empty
  page: number;
}) {
  const { authHeader, teamId, spaceId, assigneeId, page } = opts;
  const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));
  url.searchParams.append("space_ids[]", spaceId);
  if (assigneeId) url.searchParams.append("assignees[]", assigneeId);

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

async function fetchSpaceTasksPage(opts: {
  authHeader: string;
  spaceId: string;
  assigneeId: string;
  page: number;
}) {
  const { authHeader, spaceId, assigneeId, page } = opts;
  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));
  if (assigneeId) url.searchParams.append("assignees[]", assigneeId);

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

/* ---------- route ---------- */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  // auth from session (OAuth) or personal token already stored as Bearer in session
  const session: any = await getIronSession(req, res, sessionOptions);
  const raw = session?.access_token || session?.accessToken;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const authHeader = String(raw).startsWith("Bearer ") ? String(raw) : `Bearer ${raw}`;

  const sp = req.nextUrl.searchParams;
  const assigneeId = sp.get("assigneeId") || "";       // (string) ClickUp member id
  const debug = sp.get("debug") === "1";

  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  const SPACE_ID = process.env.CLICKUP_SPACE_ID || "";
  if (!SPACE_ID) return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });

  const projectsMap = new Map<string, string>();
  const debugInfo: any = { used: "team", calls: [] as any[], excludedListIds: Array.from(EXCLUDED) };

  let page = 0;
  const maxPages = 20;

  // Try team endpoint first
  while (page < maxPages) {
    const out = await fetchTeamTasksPage({
      authHeader,
      teamId: TEAM_ID,
      spaceId: SPACE_ID,
      assigneeId,
      page,
    });
    debugInfo.calls.push({ url: out.url, status: out.status });

    if (!out.ok) {
      if (out.status === 404 || String(out.text || "").includes("Route not found")) {
        debugInfo.used = "space_fallback";
        break;
      }
      return NextResponse.json(
        { error: "ClickUp error", details: out.text || out.json, from: "team", urlTried: out.url },
        { status: 502 }
      );
    }

    const items: TaskLite[] = Array.isArray(out.json?.tasks) ? out.json.tasks : [];
    if (items.length === 0) break;

    for (const t of items) {
      // exclude subtasks (ClickUp gives parent on subtasks)
      // and exclude the undesired LIST id
  const listId = String(t?.list?.id || "");
  if ((t as any)?.parent) continue;
  if (EXCLUDED.has(listId)) continue;

  const id = String(t.id);
  const name = String(t.name || id);
  projectsMap.set(id, name);
    }
    page++;
  }

  // fallback to space endpoint if nothing found
  if ((debugInfo.used === "space_fallback" || projectsMap.size === 0) && SPACE_ID) {
    page = 0;
    while (page < maxPages) {
      const out = await fetchSpaceTasksPage({
        authHeader,
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

      const items: TaskLite[] = Array.isArray(out.json?.tasks) ? out.json.tasks : [];
      if (items.length === 0) break;

      for (const t of items) {
  const listId = String(t?.list?.id || "");
  if ((t as any)?.parent) continue;
  if (EXCLUDED.has(listId)) continue;

  const id = String(t.id);
  const name = String(t.name || id);
  projectsMap.set(id, name);
      }
      page++;
    }
  }

  const projects = Array.from(projectsMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (debug) {
    return NextResponse.json({
      projects,
      count: projects.length,
  excludedListIds: Array.from(EXCLUDED),
      assigneeUsed: assigneeId || null,
      debug: debugInfo,
    });
  }

  return NextResponse.json({ projects });
}
