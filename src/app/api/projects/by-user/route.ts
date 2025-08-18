// src/app/api/projects/by-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
const DEFAULT_SPACE_ID = process.env.CLICKUP_SPACE_ID || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

type CUListInfo = {
  id: string;
  name: string;
  spaceId?: string | null;
  spaceName?: string | null;
  folderId?: string | null;
  folderName?: string | null;
};

async function getCurrentUser(token: string) {
  const r = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  const u = j?.user || j;
  return {
    id: String(u?.id || ""),
    email: (u?.email || "").toLowerCase(),
    username: u?.username || "",
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let assigneeId = url.searchParams.get("assigneeId") || "";
    const spaceId = url.searchParams.get("spaceId") || DEFAULT_SPACE_ID;

    if (!TEAM_ID) {
      return NextResponse.json({ error: "Missing CLICKUP_TEAM_ID in env" }, { status: 500 });
    }

    // auth
    const res = new NextResponse();
    const session = await getIronSession(req, res, sessionOptions as any);
    const token =
      (session as any)?.access_token ||
      (session as any)?.token ||
      (session as any)?.clickup_token;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const me = await getCurrentUser(token);
    if (!me?.id) return NextResponse.json({ error: "Unable to fetch current user" }, { status: 500 });
    const isAdmin = !!me.email && ADMIN_EMAILS.includes(me.email);

    // --- Security: consultants can ONLY query themselves
    if (!isAdmin) assigneeId = me.id;
    if (!assigneeId) return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });

    const headers = { Authorization: token, "Content-Type": "application/json" };

    async function listsUnderSpace(sId: string) {
      const allow = new Map<string, true>();
      try {
        const sLists = await fetch(`https://api.clickup.com/api/v2/space/${sId}/list?archived=false`, { headers, cache: "no-store" });
        if (sLists.ok) {
          const j = await sLists.json();
          for (const lst of j?.lists || []) if (lst?.id) allow.set(String(lst.id), true);
        }
      } catch {}
      try {
        const folders = await fetch(`https://api.clickup.com/api/v2/space/${sId}/folder`, { headers, cache: "no-store" });
        if (folders.ok) {
          const fj = await folders.json();
          for (const f of fj?.folders || []) {
            const fid = String(f?.id || "");
            if (!fid) continue;
            const fLists = await fetch(`https://api.clickup.com/api/v2/folder/${fid}/list`, { headers, cache: "no-store" });
            if (fLists.ok) {
              const flj = await fLists.json();
              for (const lst of flj?.lists || []) if (lst?.id) allow.set(String(lst.id), true);
            }
          }
        }
      } catch {}
      return allow;
    }

    // 1) All tasks for this user in Workspace (paginated)
    const listIdSet = new Set<string>();
    let page = 0;
    for (let i = 0; i < 50; i++) {
      const qs = new URLSearchParams({
        include_closed: "false",
        subtasks: "true",
        page: String(page),
        limit: "100",
      });
      qs.append("assignees[]", assigneeId);

      const api = `https://api.clickup.com/api/v2/team/${TEAM_ID}/task?${qs.toString()}`;
      const r = await fetch(api, { headers, cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text();
        return NextResponse.json({ error: "ClickUp team tasks failed", details: txt, page }, { status: r.status });
      }

      const j = await r.json();
      const tasks: any[] = j?.tasks || [];
      if (!Array.isArray(tasks) || tasks.length === 0) break;

      for (const t of tasks) {
        const lid = String(t?.list?.id || t?.list_id || t?.listId || "");
        if (lid) listIdSet.add(lid);
      }

      if (tasks.length < 100) break;
      page++;
    }

    // 2) Optional limit by Space
    let allowMap: Map<string, true> | null = null;
    if (spaceId) allowMap = await listsUnderSpace(spaceId);
    const candidateListIds = Array.from(listIdSet).filter((id) => !allowMap || allowMap.has(id));

    if (candidateListIds.length === 0) {
      return NextResponse.json({
        assigneeId,
        spaceId: spaceId || null,
        count: 0,
        projects: [],
        hint: spaceId ? "No tasks for this user in this Space." : "No tasks for this user.",
      });
    }

    // 3) Fetch List details
    const results: CUListInfo[] = [];
    for (const lid of candidateListIds) {
      try {
        const li = await fetch(`https://api.clickup.com/api/v2/list/${lid}`, { headers, cache: "no-store" });
        if (!li.ok) continue;
        const lj = await li.json();
        results.push({
          id: String(lj?.id || lid),
          name: String(lj?.name || lj?.id || lid),
          spaceId: lj?.space?.id ? String(lj.space.id) : null,
          spaceName: lj?.space?.name || null,
          folderId: lj?.folder?.id ? String(lj.folder.id) : null,
          folderName: lj?.folder?.name || null,
        });
      } catch {}
    }

    const uniq = Array.from(new Map(results.map((r) => [r.id, r])).values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );

    return NextResponse.json({ assigneeId, spaceId: spaceId || null, count: uniq.length, projects: uniq });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
