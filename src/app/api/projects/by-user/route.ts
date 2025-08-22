// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * GET /api/projects/by-user?assigneeId=XXXX
 * Returns tasks-as-projects from one or more Spaces, assigned to the assignee, excluding subtasks.
 *
 * ENV:
 *   CLICKUP_SPACE_IDS  = comma-separated space ids (e.g. "32299969,33333333")
 *   CLICKUP_SPACE_ID   = (optional fallback) single space id
 *   CLICKUP_CUSTOM_ITEM_IDS = (optional) comma separated custom item type ids to include
 *   CLICKUP_PERSONAL_TOKEN  = (optional) pk_xxx personal token for local testing
 */
type CUTask = {
  id: string | number;
  name?: string;
  parent?: string | null;
  list?: { id?: string | number; name?: string };
  assignees?: Array<{ id?: string | number }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as any;

  // Try OAuth token first, then personal token (pk_...)
  const rawToken: string | undefined =
    session?.access_token ||
    session?.accessToken ||
    process.env.CLICKUP_PERSONAL_TOKEN;

  if (!rawToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Normalize Authorization header
  const tokenHeader = rawToken.startsWith("Bearer ")
    ? rawToken
    : rawToken.startsWith("pk_")
    ? rawToken // ClickUp accepts pk_ token without "Bearer "
    : `Bearer ${rawToken}`;

  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");
  const debugMode = searchParams.get("debug") === "1";

  if (!assigneeId) {
    return NextResponse.json(
      { error: "Missing assigneeId" },
      { status: 400 }
    );
  }

  // Spaces to scan (comma-separated)
  const spacesEnv =
    process.env.CLICKUP_SPACE_IDS || process.env.CLICKUP_SPACE_ID || "";
  const spaceIds = spacesEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (spaceIds.length === 0) {
    return NextResponse.json(
      { error: "Missing CLICKUP_SPACE_IDS / CLICKUP_SPACE_ID env" },
      { status: 500 }
    );
  }

  // Optional: only include certain custom item types
  const customItemIds = (process.env.CLICKUP_CUSTOM_ITEM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allTasks: CUTask[] = [];
  const debug: any = { pages: [] };

  // Fetch tasks directly from each SPACE (across all folders/lists), excluding subtasks
  for (const sid of spaceIds) {
    let page = 0;
    while (true) {
      const url = new URL(`https://api.clickup.com/api/v2/space/${sid}/task`);
      url.searchParams.set("include_closed", "false");
      url.searchParams.set("subtasks", "false");
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", "100");
      // filter by assignee on the server side
      url.searchParams.append("assignees[]", assigneeId);
      if (customItemIds.length) {
        // ClickUp allows repeating custom_items params
        for (const id of customItemIds) url.searchParams.append("custom_items", id);
      }

      const r = await fetch(url.toString(), {
        headers: { Authorization: tokenHeader, "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!r.ok) {
        const bodyText = await r.text().catch(() => "");
        return NextResponse.json(
          {
            error: "Failed to fetch tasks",
            status: r.status,
            spaceId: sid,
            body: bodyText,
          },
          { status: 500 }
        );
      }

      const data = (await r.json()) as { tasks?: CUTask[]; last_page?: boolean };
      const batch = (data.tasks || []).filter((t) => !t.parent); // safety: ensure no subtasks

      allTasks.push(...batch);

      if (debugMode) {
        debug.pages.push({
          spaceId: sid,
          page,
          count: batch.length,
          last_page: data.last_page ?? null,
        });
      }

      // Stop when fewer than page_size returned, or last_page hints done
      if (!data.tasks || data.tasks.length < 100 || data.last_page === true) break;
      page += 1;
      if (page > 30) break; // hard stop to avoid infinite loop
    }
  }

  // De-duplicate by task id (in case a task appears more than once)
  const byId = new Map<string, CUTask>();
  for (const t of allTasks) {
    byId.set(String(t.id), t);
  }

  // Return a simple "projects" array (tasks == projects)
  const projects = Array.from(byId.values()).map((t) => ({
    id: String(t.id),
    name: t.name || "(Untitled)",
    listId: t.list?.id ? String(t.list.id) : undefined,
    listName: t.list?.name,
  }));

  const payload: any = {
    projects,
    count: projects.length,
    source: "space_tasks_api",
  };
  if (debugMode) payload.debug = debug;

  // Use res.headers so iron-session can set cookies if needed
  return new NextResponse(JSON.stringify(payload), {
    headers: { ...(res.headers as any), "Content-Type": "application/json" },
  });
}
