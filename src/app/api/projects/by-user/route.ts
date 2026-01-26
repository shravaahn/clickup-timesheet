// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/* ---------- helpers ---------- */
type TaskLite = {
  id: string;
  name: string;
  list?: { id?: string } | null;
};

const EXCLUDED = new Set(
  String(process.env.CLICKUP_EXCLUDED_LIST_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

/* ---------- route ---------- */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const raw = session?.access_token || session?.accessToken;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const authHeader = String(raw).startsWith("Bearer ")
    ? String(raw)
    : `Bearer ${raw}`;

  const sp = req.nextUrl.searchParams;
  const orgUserId = sp.get("assigneeId") || ""; // org_users.id
  const debug = sp.get("debug") === "1";

  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  const SPACE_ID = process.env.CLICKUP_SPACE_ID || "";

  if (!TEAM_ID || !SPACE_ID) {
    return NextResponse.json(
      { error: "Missing CLICKUP_TEAM_ID or CLICKUP_SPACE_ID env" },
      { status: 500 }
    );
  }

  /* ---------- resolve ClickUp user id ---------- */
  let clickupAssigneeId = "";

  // If numeric → assume ClickUp user id directly
  if (/^\d+$/.test(orgUserId)) {
    clickupAssigneeId = orgUserId;
  } 
  // Else assume UUID → resolve via org_users
  else if (orgUserId) {
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("clickup_user_id")
      .eq("id", orgUserId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to resolve org user", details: error.message },
        { status: 400 }
      );
    }

    if (data?.clickup_user_id) {
      clickupAssigneeId = String(data.clickup_user_id);
    }
  }

  /* ---------- CRITICAL GUARD ---------- */
  // If the org user has NO ClickUp assignment → return empty list
  if (!clickupAssigneeId || !/^\d+$/.test(clickupAssigneeId)) {
    return NextResponse.json({
      projects: [],
      ...(debug
        ? {
            debug: {
              orgUserId,
              clickupAssigneeId,
              reason: "User has no ClickUp assignee or is not assigned to any tasks",
            },
          }
        : {}),
    });
  }

  /* ---------- fetch tasks ---------- */
  const projectsMap = new Map<string, string>();
  const debugInfo: any = {
    orgUserId,
    clickupAssigneeId,
    calls: [],
    excludedListIds: Array.from(EXCLUDED),
  };

  let page = 0;
  const maxPages = 20;

  async function fetchTasks(url: URL) {
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    return { ok: r.ok, status: r.status, json, text, url: url.toString() };
  }

  while (page < maxPages) {
    const url = new URL(`https://api.clickup.com/api/v2/team/${TEAM_ID}/task`);
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("subtasks", "false");
    url.searchParams.set("order_by", "created");
    url.searchParams.set("page", String(page));
    url.searchParams.append("space_ids[]", SPACE_ID);
    url.searchParams.append("assignees[]", clickupAssigneeId);

    const out = await fetchTasks(url);
    debugInfo.calls.push({ url: out.url, status: out.status });

    if (!out.ok) break;

    const items: TaskLite[] = Array.isArray(out.json?.tasks)
      ? out.json.tasks
      : [];

    if (items.length === 0) break;

    for (const t of items) {
      if ((t as any)?.parent) continue;

      const listId = String(t?.list?.id || "");
      if (EXCLUDED.has(listId)) continue;

      projectsMap.set(String(t.id), String(t.name || t.id));
    }

    page++;
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
