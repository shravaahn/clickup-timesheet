// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/* ========= Helpers ========= */

function isNumericId(v: string | null): v is string {
  return !!v && /^[0-9]+$/.test(v);
}

function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  // Prefer user session OAuth token (per-user permissions),
  // otherwise fall back to the env Personal API token.
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN;
  if (!envToken) {
    throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  }
  return bearer(envToken);
}

/** Team members: used to resolve email/username -> numeric ClickUp member id */
type TeamMember = { id: number; username: string; email: string };

async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Get team failed ${r.status}: ${t}`);
  }
  const j = await r.json();
  const members = Array.isArray(j?.members) ? j.members : [];
  return members
    .map((m: any) => ({
      id: Number(m?.user?.id),
      username: String(m?.user?.username ?? ""),
      email: String(m?.user?.email ?? ""),
    }))
    .filter((m: TeamMember) => Number.isFinite(m.id));
}

/** Resolve incoming assignee (could be email/username/internal) to numeric ClickUp member id */
async function resolveAssigneeToNumeric(
  authHeader: string,
  teamId: string,
  incoming: string
): Promise<number | undefined> {
  const incomingStr = String(incoming || "");
  if (isNumericId(incomingStr)) return Number(incomingStr);

  if (!teamId) return undefined; // cannot resolve without team id
  try {
    const members = await fetchTeamMembers(authHeader, teamId);
    const needle = String(incomingStr).toLowerCase();

    // match by email
    let match = members.find((m) => String(m.email).toLowerCase() === needle);
    if (match) return match.id;

    // match by username
    match = members.find((m) => String(m.username).toLowerCase() === needle);
    if (match) return match.id;

    // last resort: exact id-as-string
    match = members.find((m) => String(m.id) === incomingStr);
    if (match) return match.id;
  } catch {
    // swallow resolution errors; we can still fetch without assignee filter
  }
  return undefined;
}

/* ========= Pagers (apply assignee filter only if numeric resolved) ========= */

async function fetchTeamTasksPage(opts: {
  authHeader: string;
  teamId: string;
  spaceId: string;
  assigneeNumeric?: number; // <-- numeric or undefined
  page: number;
}) {
  const { authHeader, teamId, spaceId, assigneeNumeric, page } = opts;

  const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));
  url.searchParams.append("space_ids[]", spaceId);

  if (Number.isFinite(assigneeNumeric)) {
    url.searchParams.append("assignees[]", String(assigneeNumeric));
  }

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep as text */ }

  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

async function fetchSpaceTasksPage(opts: {
  authHeader: string;
  spaceId: string;
  assigneeNumeric?: number;
  page: number;
}) {
  const { authHeader, spaceId, assigneeNumeric, page } = opts;

  const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");
  url.searchParams.set("page", String(page));

  if (Number.isFinite(assigneeNumeric)) {
    url.searchParams.append("assignees[]", String(assigneeNumeric));
  }

  const r = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  return { ok: r.ok, status: r.status, json, text, url: url.toString() };
}

/* ========= Route ========= */

export async function GET(req: NextRequest) {
  const res = new NextResponse();

  try {
    const authHeader = await getAuthHeader(req, res);

    const sp = req.nextUrl.searchParams;
    const assigneeRaw = sp.get("assigneeId") || "";
    const debug = sp.get("debug") === "1";

    const TEAM_ID = String(process.env.CLICKUP_TEAM_ID || "");
    const SPACE_ID = String(process.env.CLICKUP_SPACE_ID || "");

    if (!SPACE_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_SPACE_ID env" }, { status: 500 });
    }

    // Resolve assignee to numeric (only if provided)
    let assigneeNumeric: number | undefined = undefined;
    if (assigneeRaw) {
      assigneeNumeric = await resolveAssigneeToNumeric(authHeader, TEAM_ID, String(assigneeRaw));
    }

    // Page through tasks (team endpoint first; fallback to space endpoint on 404)
    const projectsMap = new Map<string, string>();
    const debugInfo: any = { used: "team", calls: [] as any[], assigneeResolved: assigneeNumeric ?? null };
    let page = 0;
    const maxPages = 15;

    // Try Team Tasks search
    while (page < maxPages) {
      const out = await fetchTeamTasksPage({
        authHeader,
        teamId: TEAM_ID,
        spaceId: SPACE_ID,
        assigneeNumeric,
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

      const items = Array.isArray(out.json?.tasks) ? out.json.tasks : [];
      for (const t of items) {
        if (t?.parent) continue; // exclude subtasks
        const id = String(t.id);
        const name = String(t.name || id);
        projectsMap.set(id, name);
      }

      if (items.length === 0) break;
      page += 1;
    }

    // Fallback to Space if needed
    if ((debugInfo.used === "space_fallback" || projectsMap.size === 0) && SPACE_ID) {
      page = 0;
      while (page < maxPages) {
        const out = await fetchSpaceTasksPage({
          authHeader,
          spaceId: SPACE_ID,
          assigneeNumeric,
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
  } catch (err: any) {
    console.error("/api/projects/by-user error:", err);
    return NextResponse.json(
      { error: "Failed to fetch projects", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
