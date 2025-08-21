// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<AppSession>(req, res, sessionOptions);

  const auth = session.access_token?.startsWith("Bearer ")
    ? session.access_token
    : session.access_token
    ? `Bearer ${session.access_token}`
    : null;

  if (!auth) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  try {
    const teamId = process.env.CLICKUP_TEAM_ID;
    let members: Array<{ id: string; email?: string; username?: string; profilePicture?: string | null }> = [];

    // Primary: /team (has embedded members)
    const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: auth },
      cache: "no-store",
    });
    if (teamsResp.ok) {
      const tj = await teamsResp.json();
      const team = Array.isArray(tj?.teams)
        ? tj.teams.find((t: any) => String(t.id) === String(teamId))
        : null;
      if (team && Array.isArray(team.members)) {
        members = team.members
          .map((m: any) => m?.user)
          .filter(Boolean)
          .map((u: any) => ({
            id: String(u.id),
            email: u.email,
            username: u.username,
            profilePicture: u.profilePicture || null,
          }));
      }
    }

    // Fallback: /team/{id}/member
    if (members.length === 0 && teamId) {
      const mResp = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/member`, {
        headers: { Authorization: auth },
        cache: "no-store",
      });
      if (mResp.ok) {
        const mj = await mResp.json();
        const arr = Array.isArray(mj?.members) ? mj.members : [];
        members = arr
          .map((m: any) => m?.user)
          .filter(Boolean)
          .map((u: any) => ({
            id: String(u.id),
            email: u.email,
            username: u.username,
            profilePicture: u.profilePicture || null,
          }));
      }
    }

    // Ensure current user is present
    if (session.user && !members.find((x) => x.id === session.user!.id)) {
      members.unshift({
        id: session.user.id,
        email: session.user.email,
        username: session.user.username || session.user.email,
        profilePicture: session.user.profilePicture || null,
      });
    }

    // Sort by name
    members.sort((a, b) => (a.username || a.email || "").localeCompare(b.username || b.email || ""));

    return NextResponse.json({ members }, { headers: res.headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: "ClickUp error", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
