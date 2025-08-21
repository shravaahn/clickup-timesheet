// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * GET /api/projects/by-user?assigneeId=XXXX
 * Returns tasks-as-projects from one or more Spaces, assigned to the assignee, excluding subtasks.
 *
 * ENV required:
 *   CLICKUP_SPACE_IDS = comma-separated space ids (e.g. "111,222")
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as any;

  const token: string | undefined =
    session?.access_token || session?.accessToken || process.env.CLICKUP_PERSONAL_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const authHeader = token; // ClickUp expects raw token value (OAuth access_token or pk_...)
  const { searchParams } = new URL(req.url);
  const assigneeId = searchParams.get("assigneeId");
  if (!assigneeId) {
    return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });
  }

  const spacesEnv = process.env.CLICKUP_SPACE_IDS || process.env.CLICKUP_SPACE_ID || "";
  const spaceIds = spacesEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (spaceIds.length === 0) {
    return NextResponse.json(
      { error: "No CLICKUP_SPACE_IDS or CLICKUP_SPACE_ID configured in env" },
      { status: 500 }
    );
  }

  try {
    const unique = new Map<string, { id: string; name: string }>();

    // Pull tasks per space, include_closed so admins can still see in table if needed
    for (const spaceId of spaceIds) {
      let page = 0;
      const limit = 100;

      while (true) {
        const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/task`);
        url.searchParams.set("include_closed", "true");
        url.searchParams.set("subtasks", "false"); // exclude subtasks
        url.searchParams.append("assignees[]", String(assigneeId));
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(limit));

        const r = await fetch(url.toString(), {
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!r.ok) {
          const body = await r.text().catch(() => "");
          // If one space fails, continue with others but record error
          console.warn("ClickUp tasks fetch failed", spaceId, r.status, body);
          break;
        }

        const j = await r.json();
        const tasks: any[] = Array.isArray(j?.tasks) ? j.tasks : [];
        for (const t of tasks) {
          // t.id, t.name
          if (!t?.id || !t?.name) continue;
          if (!unique.has(String(t.id))) {
            unique.set(String(t.id), { id: String(t.id), name: String(t.name) });
          }
        }

        // If fewer than limit returned, we're done
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
}
