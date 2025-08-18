// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

type CUUser = {
  id?: string | number;
  email?: string;
  username?: string;
  profilePicture?: string | null;
};

type MemberOut = {
  id: string;
  email: string;
  username: string;
  profilePicture: string | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const token = session.accessToken;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${token}` };
  const byId: Record<string, MemberOut> = {};
  const debugMode = req.nextUrl.searchParams.get("debug") === "1";
  const debug: {
    teamsFetch?: { ok: boolean; status: number; body?: any };
    teamMemberCalls?: Array<{ teamId: string; ok: boolean; status: number; bodyText?: string }>;
    fallbackUsed?: boolean;
  } = { teamMemberCalls: [] };

  // 1) Get all teams/workspaces the token can see
  let teamIds: string[] = [];
  try {
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers,
      cache: "no-store",
    });

    if (!teamsResp.ok) {
      const body = await teamsResp.text().catch(() => "");
      debug.teamsFetch = { ok: false, status: teamsResp.status, body };
    } else {
      const teamsJson = await teamsResp.json().catch(() => ({} as any));
      debug.teamsFetch = { ok: true, status: 200, body: debugMode ? teamsJson : undefined };
      teamIds = Array.isArray(teamsJson?.teams)
        ? teamsJson.teams.map((t: any) => String(t?.id)).filter(Boolean)
        : [];
    }
  } catch (e) {
    debug.teamsFetch = { ok: false, status: 0, body: String(e) };
  }

  // 2) For each team, fetch members; skip unauthorized teams
  for (const teamId of teamIds) {
    try {
      const mResp = await fetch(
        `https://api.clickup.com/api/v2/team/${teamId}/member`,
        { headers, cache: "no-store" }
      );

      if (!mResp.ok) {
        const bodyText = await mResp.text().catch(() => "");
        debug.teamMemberCalls?.push({ teamId, ok: false, status: mResp.status, bodyText });
        continue; // “Team not authorized” etc.
      }

      const mJson = await mResp.json().catch(() => ({} as any));
      debug.teamMemberCalls?.push({ teamId, ok: true, status: 200 });

      const list: any[] = Array.isArray(mJson?.members) ? mJson.members : [];
      for (const m of list) {
        const u: CUUser = m?.user ?? m ?? {};
        const id = String(u?.id ?? "");
        if (!id) continue;
        const email = String(u?.email ?? "");
        const username = String(u?.username ?? email ?? id);
        const profilePicture = (u?.profilePicture as string) ?? null;

        byId[id] = { id, email, username, profilePicture };
      }
    } catch (e) {
      debug.teamMemberCalls?.push({ teamId, ok: false, status: 0, bodyText: String(e) });
    }
  }

  // 3) Fallback — if still nothing, at least return current user
  if (Object.keys(byId).length === 0) {
    try {
      const meResp = await fetch("https://api.clickup.com/api/v2/user", {
        headers,
        cache: "no-store",
      });
      if (meResp.ok) {
        const meJson = await meResp.json().catch(() => ({} as any));
        const u: CUUser = meJson?.user ?? meJson ?? {};
        const id = String(u?.id ?? "");
        if (id) {
          byId[id] = {
            id,
            email: String(u?.email ?? ""),
            username: String(u?.username ?? u?.email ?? id),
            profilePicture: (u?.profilePicture as string) ?? null,
          };
        }
      }
    } catch {
      // ignore
    }
    debug.fallbackUsed = true;
  }

  const members = Object.values(byId).sort((a, b) =>
    (a.username || a.email).localeCompare(b.username || b.email)
  );

  return new NextResponse(
    JSON.stringify({
      members,
      source: "teams_api",
      ...(debugMode ? { debug } : {}),
    }),
    { headers: res.headers }
  );
}
