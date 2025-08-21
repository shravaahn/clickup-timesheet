// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

type ClickUpTask = {
  id: string | number;
  name?: string;
  parent?: string | null;
  list?: { id?: string | number };
  assignees?: Array<{ id?: string | number }>;
};

function normalizeAuth(token: string | undefined | null) {
  if (!token) return "";
  const t = token.trim();
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as any;

  const auth = normalizeAuth(session?.access_token || session?.accessToken);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Query inputs
  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");
  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }

  const TEAM_ID = process.env.CLICKUP_TEAM_ID;
  if (!TEAM_ID) {
    return NextResponse.json({ error: "Missing CLICKUP_TEAM_ID env" }, { status: 500 });
  }

  // Optional filters from env
  const SPACE_IDS = (process.env.CLICKUP_SPACE_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const CUSTOM_ITEM_IDS = (process.env.CLICKUP_CUSTOM_ITEM_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // Build query params
  // Note: for array params ClickUp expects [] syntax like assignees[] / space_ids[] / custom_items[].
  const baseParams = new URLSearchParams();
  baseParams.set("include_closed", "false");
  baseParams.set("subtasks", "false"); // default excludes subtasks anyway, but this is explicit. :contentReference[oaicite:2]{index=2}
  baseParams.append("assignees[]", assigneeId);

  SPACE_IDS.forEach(id => baseParams.append("space_ids[]", id));
  CUSTOM_ITEM_IDS.forEach(id => baseParams.append("custom_items[]", id)); // e.g., 1002/1003 :contentReference[oaicite:3]{index=3}

  // Paginate (100 tasks per page)
  const projects: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  let page = 0;
  while (true) {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(page));

    const url = `https://api.clickup.com/api/v2/team/${TEAM_ID}/task?${params.toString()}`;
    const r = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json(
        { error: "ClickUp error", details: txt || r.statusText },
        { status: 502 }
      );
    }

    const json = await r.json();
    const batch: ClickUpTask[] = Array.isArray(json?.tasks) ? json.tasks : [];

    // Stop if no data
    if (batch.length === 0) break;

    // Collect only top-level tasks (not subtasks) — API should already exclude, but double-check
    for (const t of batch) {
      if (t?.parent) continue;
      const id = String(t.id);
      if (seen.has(id)) continue;
      seen.add(id);
      projects.push({ id, name: t?.name || id });
    }

    // If returned less than 100, we're done
    if (batch.length < 100) break;
    page += 1;
  }

  // Sorted by name for nicer UI
  projects.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ projects, source: "team_tasks" });
}
