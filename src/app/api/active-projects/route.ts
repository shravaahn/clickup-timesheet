// src/app/api/active-projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * STRICT VIEW-ONLY + PARENT ROLLUP
 *
 * GET /api/active-projects?assigneeId=<clickup_user_id>[&viewId=<override>]
 *
 * - Reads ONLY from ClickUp View Tasks API (exactly what the View shows).
 * - Paginates until the API returns an empty page (no missed pages).
 * - If a subtask is assigned to the user, returns the TOP-LEVEL parent (the “project”).
 * - Deduplicates parents so you get one row per project.
 *
 * Env:
 *   CLICKUP_ACTIVE_VIEW_ID=k6hww-110431
 */

const ENV_VIEW_ID = process.env.CLICKUP_ACTIVE_VIEW_ID || "";

type VTask = {
  id: string;
  name: string;
  parent?: string | null;
  assignees?: Array<{ id?: string | number }>;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const assigneeId = url.searchParams.get("assigneeId") || undefined;
  const viewId = url.searchParams.get("viewId") || ENV_VIEW_ID;

  if (!viewId) {
    return NextResponse.json(
      { error: "Missing viewId. Set CLICKUP_ACTIVE_VIEW_ID in .env.local or pass ?viewId=" },
      { status: 400 }
    );
  }

  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions as any);
  const token =
    (session as any)?.access_token ||
    (session as any)?.token ||
    (session as any)?.clickup_token;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headers = { Authorization: token, "Content-Type": "application/json" };

  // sanity check: view exists (clear errors if not)
  const viewInfoResp = await fetch(`https://api.clickup.com/api/v2/view/${viewId}`, {
    headers,
    cache: "no-store",
  });
  if (!viewInfoResp.ok) {
    const txt = await viewInfoResp.text();
    return NextResponse.json(
      { error: "ClickUp view not accessible", details: txt, viewId },
      { status: viewInfoResp.status }
    );
  }
  const viewInfo = await viewInfoResp.json().catch(() => null);

  // fetch ALL tasks from the view (page 0..N until empty)
  async function fetchAllViewTasks(vId: string) {
    const all: VTask[] = [];
    for (let page = 0; page < 100; page++) {
      const api = `https://api.clickup.com/api/v2/view/${vId}/task?page=${page}`;
      const r = await fetch(api, { headers, cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`view.tasks failed on page ${page} (${r.status}): ${txt}`);
      }
      const j = await r.json();
      const arr: any[] = Array.isArray(j?.tasks)
        ? j.tasks
        : (Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []));
      if (!Array.isArray(arr) || arr.length === 0) break;

      for (const t of arr) {
        all.push({
          id: String(t?.id || ""),
          name: String(t?.name || t?.id || ""),
          parent: t?.parent ?? null,
          assignees: Array.isArray(t?.assignees) ? t.assignees : [],
        });
      }
    }
    // de-dupe by id in case view returns overlaps across pages
    const map = new Map<string, VTask>();
    for (const t of all) if (t.id) map.set(t.id, t);
    return Array.from(map.values());
  }

  // climb to the top-most ancestor present in the view’s task set
  function climbToRoot(id: string, byId: Map<string, VTask>) {
    let cur = byId.get(id);
    let guard = 0;
    while (cur?.parent && byId.has(String(cur.parent)) && guard < 50) {
      cur = byId.get(String(cur.parent));
      guard++;
    }
    return cur || byId.get(id);
  }

  try {
    const tasks = await fetchAllViewTasks(viewId);
    const byId = new Map<string, VTask>(tasks.map(t => [t.id, t]));

    // if no assignee filter, just return all TOP-LEVEL tasks (no parent present)
    if (!assigneeId) {
      const roots = tasks
        .filter(t => !t.parent || !byId.has(String(t.parent)))
        .map(t => ({ id: t.id, name: t.name }));
      return NextResponse.json({
        source: "view-strict+parents",
        view: { id: viewId, name: viewInfo?.name ?? null },
        assigneeId: null,
        count: roots.length,
        tasks: roots,
      });
    }

    // 1) find every task or subtask assigned to this user
    const assigned = tasks.filter(t =>
      (t.assignees || []).some(a => String(a?.id) === String(assigneeId))
    );

    // 2) for each, climb to the top-most ancestor that exists in the view set
    const projectIds = new Set<string>();
    for (const t of assigned) {
      const root = climbToRoot(t.id, byId);
      if (root?.id) projectIds.add(root.id);
    }

    // 3) build final unique list of parent “project” rows
    const result = Array.from(projectIds).map(id => {
      const x = byId.get(id)!;
      return { id: x.id, name: x.name };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      source: "view-strict+parents",
      view: { id: viewId, name: viewInfo?.name ?? null },
      assigneeId,
      count: result.length,
      tasks: result,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error while fetching/rolling up view tasks", viewId },
      { status: 500 }
    );
  }
}
