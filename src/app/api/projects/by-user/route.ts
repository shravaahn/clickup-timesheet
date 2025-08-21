// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

type ClickUpTask = {
  id: string | number;
  name?: string;
  assignees?: Array<{ id?: string | number }>;
  parent?: string | number | null; // if set, it's usually a subtask
  status?: { status: string } | string;
};

type ProjectsResponse = { projects: Array<{ id: string; name: string }> };

async function fetchTasksForSpace(
  baseUrl: string,
  authHeader: string,
  spaceId: string,
  page: number
): Promise<{ tasks: ClickUpTask[]; hasMore: boolean }> {
  const url = new URL(`${baseUrl}/space/${spaceId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("page", String(page)); // ClickUp paginates by "page"
  // (Optional) If you use Custom Items inside the space, you can whitelist them via env
  const customIds = (process.env.CLICKUP_CUSTOM_ITEM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const cid of customIds) url.searchParams.append("custom_items[]", cid);

  const resp = await fetch(url.toString(), {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ClickUp tasks error [space=${spaceId}]: ${resp.status} ${body}`);
  }

  const json = await resp.json();
  const tasks: ClickUpTask[] = Array.isArray(json?.tasks) ? json.tasks : [];
  // Heuristic: if we got less than 100 tasks, assume no further pages (ClickUp often pages at 100)
  const hasMore = tasks.length >= 100;
  return { tasks, hasMore };
}

export async function GET(req: NextRequest): Promise<NextResponse<ProjectsResponse | { error: string }>> {
  const res = new NextResponse();
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  const auth = getAuthHeader(session);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assigneeId = (searchParams.get("assigneeId") || "").trim();
  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }

  const spaceIds = (process.env.CLICKUP_SPACE_IDS || process.env.CLICKUP_SPACE_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (spaceIds.length === 0) {
    return NextResponse.json({ error: "No CLICKUP_SPACE_IDS configured" }, { status: 500 });
  }

  const BASE = "https://api.clickup.com/api/v2";

  // Aggregate tasks across spaces
  const unique = new Map<string, string>(); // id -> name
  try {
    for (const spaceId of spaceIds) {
      let page = 0;
      // Defensive: cap at 20 pages per space
      for (let i = 0; i < 20; i++) {
        const { tasks, hasMore } = await fetchTasksForSpace(BASE, auth, spaceId, page);
        for (const t of tasks) {
          // filter: only tasks assigned to assigneeId
          const assigned = (t.assignees || []).some((a) => String(a?.id) === assigneeId);
          if (!assigned) continue;
          // filter out subtasks (parent present)
          if (t.parent) continue;

          const id = String(t.id);
          const name = t.name?.trim() || id;
          if (!unique.has(id)) unique.set(id, name);
        }
        if (!hasMore) break;
        page += 1;
      }
    }

    const projects = Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ projects });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
