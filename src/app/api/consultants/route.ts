// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData, getAuthHeader } from "@/lib/session";

type CU_TeamUser = {
  id: number | string;
  username?: string | null;
  email?: string | null;
  profilePicture?: string | null;
  role_key?: string | null; // "member" | "admin" | "owner" | "guest" | "readonly_guest" | ...
};

type CU_Team = {
  id: number | string;
  name?: string;
  members?: { user: CU_TeamUser }[];
};

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as unknown as SessionData;

  const auth = getAuthHeader(session);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // 1) Pull all teams visible to the user
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!teamsResp.ok) {
      const t = await teamsResp.text();
      return NextResponse.json(
        { error: "Failed to fetch teams", status: teamsResp.status, details: t },
        { status: 502 }
      );
    }

    const teamsJson = (await teamsResp.json()) as { teams?: CU_Team[] };
    const teams = teamsJson.teams || [];

    // 2) Gather members from the team payload (ClickUp includes them inline)
    const membersMap = new Map<string, CU_TeamUser>();

    for (const team of teams) {
      for (const m of team.members || []) {
        const u = m.user;
        if (!u) continue;
        const id = String(u.id);
        // Filter out "guest" roles; include admins, owners, members, limited_member, etc.
        const role = (u as any).role_key || (u as any).role?.role_key || null;
        if (role === "guest" || role === "readonly_guest") continue;

        if (!membersMap.has(id)) {
          membersMap.set(id, {
            id,
            username: u.username ?? null,
            email: u.email ?? null,
            profilePicture: u.profilePicture ?? null,
            role_key: role ?? null,
          });
        }
      }
    }

    let members = Array.from(membersMap.values())
      .map((u) => ({
        id: String(u.id),
        username: u.username || u.email || String(u.id),
        email: u.email || null,
        profilePicture: u.profilePicture || null,
      }))
      .sort((a, b) => (a.username || "").localeCompare(b.username || ""));

    // Always include current user at top (especially if teams list was limited)
    const me = session.user;
    if (me?.id && !members.find((x) => x.id === me.id)) {
      members = [
        {
          id: me.id,
          username: me.username || me.email,
          email: me.email,
          profilePicture: me.profilePicture || null,
        },
        ...members,
      ];
    } else if (me?.id) {
      // Move me to top
      members = [
        members.find((x) => x.id === me.id)!,
        ...members.filter((x) => x.id !== me.id),
      ];
    }

    return NextResponse.json({ members, source: "teams_api" });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
