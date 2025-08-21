// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

<<<<<<< HEAD
/**
 * GET /api/projects/by-user?assigneeId=XXXX
 * Returns tasks-as-projects from one or more Spaces, assigned to the assignee, excluding subtasks.
 *
 * ENV:
 *   CLICKUP_SPACE_IDS = comma-separated space ids (e.g. "32299969,33333333")
 */
=======
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

>>>>>>> parent of f868102 (Update route.ts)
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as any;

<<<<<<< HEAD
  const token: string | undefined =
    session?.access_token || session?.accessToken || process.env.CLICKUP_PERSONAL_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const tokenHeader = token.startsWith("pk_") ? token : `Bearer ${token}`;
=======
  const auth = bearer(session?.access_token || session?.accessToken);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
>>>>>>> parent of f868102 (Update route.ts)

  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");
  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }

<<<<<<< HEAD
  const spacesEnv = process.env.CLICKUP_SPACE_IDS || process.env.CLICKUP_SPACE_ID || "";
  const spaceIds = spacesEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (spaceIds.length === 0) {
    return NextResponse.json(
      { error: "No CLICKUP_SPACE_IDS (or CLICKUP_SPACE_ID) configured" },
      { status: 500 }
    );
  }

  try {
    const unique = new Map<string, { id: string; name: string }>();

    for (const spaceId of spaceIds) {
      let page = 0;
      const limit = 100;

      while (true) {
        const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
        url.searchParams.set("include_closed", "true");
        url.searchParams.set("archived", "false");
        url.searchParams.set("subtasks", "false"); // exclude subtasks
        url.searchParams.append("assignees[]", String(assigneeId));
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(limit));

        const r = await fetch(url.toString(), {
          headers: {
            Authorization: tokenHeader,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!r.ok) {
          const body = await r.text().catch(() => "");
          console.warn("ClickUp tasks fetch failed", spaceId, r.status, body);
          break;
        }

        const j = await r.json();
        const tasks: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
        for (const t of tasks) {
          if (!t?.id || !t?.name) continue;
          if (!unique.has(String(t.id))) {
            unique.set(String(t.id), { id: String(t.id), name: String(t.name) });
          }
        }
        if (tasks.length < limit) break;
        page += 1;
      }
    }

    const projects = Array.from(unique.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ projects, source: "spaces_tasks" });
  } catch (e: any) {
    console.error("by-user error", e);
    return NextResponse.json(
      { error: "ClickUp error", details: e?.message || String(e) },
      { status: 500 }
    );
  }
=======
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
>>>>>>> parent of f868102 (Update route.ts)
}
