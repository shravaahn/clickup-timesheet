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

  // 1) Fetch teams/workspaces this user/app can access
  try {
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers,
      cache: "no-store",
    });

    if (!teamsResp.ok) {
      const txt = await teamsResp.text().catch(() => "");
      console.warn("consultants: /team failed", teamsResp.status, txt);
    } else {
      const teamsJson = await teamsResp.json().catch(() => ({} as any));
      const teamIds: string[] = Array.isArray(teamsJson?.teams)
        ? teamsJson.teams.map((t: any) => String(t?.id)).filter(Boolean)
        : [];

      // 2) For each team, try to list members (skip unauthorized teams)
      for (const teamId of teamIds) {
        try {
          const mResp = await fetch(
            `https://api.clickup.com/api/v2/team/${teamId}/member`,
            { headers, cache: "no-store" }
          );

          if (!mResp.ok) {
            const body = await mResp.text().catch(() => "");
            // Common case in prod: {"ECODE":"OAUTH_027","err":"Team not authorized"}
            console.warn("consultants: members fail", teamId, mResp.status, body);
            continue; // skip teams the app isn't authorized for
          }

          const mJson = await mResp.json().catch(() => ({} as any));
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
          console.warn("consultants: team member fetch error", teamId, e);
        }
      }
    }
  } catch (e) {
    console.warn("consultants: /team fetch error", e);
  }

  // 3) Fallback — if nothing came back, at least return the current user
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

  return new NextResponse(JSON.stringify({ members, source: "teams_api" }), {
    headers: res.headers, // forward Set-Cookie if session touched
  });
}
