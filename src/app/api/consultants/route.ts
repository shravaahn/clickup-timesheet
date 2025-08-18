// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Optional allow-list of domains (e.g. "l5.ai,targetorate.com")
const ALLOWED_DOMAINS = (process.env.CONSULTANT_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

type MemberOut = {
  id: string;
  username?: string;
  email?: string | null;
  profilePicture?: string | null;
};

function inAllowedDomain(email?: string | null) {
  if (!email || ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}

export async function GET(req: NextRequest) {
  if (!TEAM_ID) {
    return NextResponse.json({ error: "CLICKUP_TEAM_ID not set" }, { status: 500 });
  }

  // --- Auth & admin check ---
  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions as any);
  const token =
    (session as any)?.access_token ||
    (session as any)?.token ||
    (session as any)?.clickup_token;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!meResp.ok) {
    return NextResponse.json({ error: "Failed to fetch current user" }, { status: 500 });
  }
  const meJson = await meResp.json();
  const meEmail = String(meJson?.user?.email || "").toLowerCase();
  const isAdmin = !!meEmail && ADMIN_EMAILS.includes(meEmail);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden (admin only)" }, { status: 403 });
  }

  const headers = { Authorization: token, "Content-Type": "application/json" };

  // --- Primary: Workspace (Team) members from /team ---
  try {
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers,
      cache: "no-store",
    });
    if (!teamsResp.ok) {
      const txt = await teamsResp.text();
      return NextResponse.json({ error: "ClickUp /team failed", details: txt }, { status: teamsResp.status });
    }

    const teamsJson = await teamsResp.json();
    const teams: any[] = teamsJson?.teams || [];
    const team = teams.find((t) => String(t?.id) === String(TEAM_ID));

    if (!team) {
      return NextResponse.json({ error: `Workspace (team) ${TEAM_ID} not found in /team` }, { status: 404 });
    }

    // team.members can be an array of { user: {...} } or sometimes user-like shapes
    const rawMembers: any[] = team.members || [];
    const members: MemberOut[] = rawMembers
      .map((m) => {
        const u = m?.user ?? m;
        const id = String(u?.id || "");
        const email = (u?.email ?? null) as string | null;
        const username =
          u?.username ||
          (email ? email.split("@")[0] : "") ||
          "User";
        const profilePicture = u?.profilePicture ?? null;
        return { id, username, email, profilePicture };
      })
      .filter((m) => m.id) // must have id
      .filter((m) => inAllowedDomain(m.email));

    // De-dupe + sort
    const uniq = Array.from(new Map(members.map((m) => [m.id, m])).values()).sort((a, b) =>
      (a.username || a.email || "").localeCompare(b.username || b.email || "")
    );

    if (uniq.length > 0) {
      return NextResponse.json({ members: uniq, source: "authorized_workspaces" });
    }
  } catch (e: any) {
    // fall through to task-based fallback below
  }

  // --- Fallback: enumerate assignees from team tasks (open), just in case ---
  try {
    const uniq = new Map<string, MemberOut>();
    for (let page = 0; page < 50; page++) {
      const qs = new URLSearchParams({
        include_closed: "false",
        subtasks: "true",
        page: String(page),
        limit: "100",
      });
      const api = `https://api.clickup.com/api/v2/team/${TEAM_ID}/task?${qs.toString()}`;
      const r = await fetch(api, { headers, cache: "no-store" });
      if (!r.ok) break;
      const j = await r.json();
      const tasks: any[] = j?.tasks || [];
      if (!Array.isArray(tasks) || tasks.length === 0) break;

      for (const t of tasks) {
        for (const a of t?.assignees || []) {
          const id = String(a?.id || "");
          if (!id) continue;
          const rec: MemberOut = {
            id,
            username: a?.username || (a?.email ? a.email.split("@")[0] : "") || "User",
            email: a?.email ?? null,
            profilePicture: a?.profilePicture ?? null,
          };
          if (!uniq.has(id) && inAllowedDomain(rec.email)) {
            uniq.set(id, rec);
          }
        }
      }
      if (tasks.length < 100) break;
    }
    return NextResponse.json({ members: Array.from(uniq.values()), source: "team_assignees" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
