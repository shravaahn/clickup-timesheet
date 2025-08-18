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
  const debugMode = req.nextUrl.searchParams.get("debug") === "1";

  // Fetch teams. We'll read members directly from the /team response.
  const byId: Record<string, MemberOut> = {};
  let teamsFetchInfo: any = undefined;

  try {
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers,
      cache: "no-store",
    });

    if (!teamsResp.ok) {
      const body = await teamsResp.text().catch(() => "");
      teamsFetchInfo = { ok: false, status: teamsResp.status, body };
    } else {
      const teamsJson = await teamsResp.json().catch(() => ({} as any));
      teamsFetchInfo = { ok: true, status: 200, body: debugMode ? teamsJson : undefined };

      const teams = Array.isArray(teamsJson?.teams) ? teamsJson.teams : [];
      for (const t of teams) {
        const membersArr = Array.isArray(t?.members) ? t.members : [];
        for (const m of membersArr) {
          // ClickUp puts the person on m.user
          const u: CUUser = m?.user ?? m ?? {};
          const id = String(u?.id ?? "");
          if (!id) continue;

          const email = String(u?.email ?? "");
          const username = String(u?.username ?? email ?? id);
          const profilePicture = (u?.profilePicture as string) ?? null;

          byId[id] = { id, email, username, profilePicture };
        }
      }
    }
  } catch (e) {
    teamsFetchInfo = { ok: false, status: 0, body: String(e) };
  }

  // Fallback: if nothing yet, at least return current user
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
  }

  const members = Object.values(byId).sort((a, b) =>
    (a.username || a.email).localeCompare(b.username || b.email)
  );

  const payload: any = { members, source: "teams_inline" };
  if (debugMode) payload.debug = { teamsFetch: teamsFetchInfo, count: members.length };

  return new NextResponse(JSON.stringify(payload), {
    headers: res.headers, // forward Set-Cookie if session changed
  });
}
