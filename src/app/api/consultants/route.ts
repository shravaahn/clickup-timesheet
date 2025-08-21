// src/app/api/consultants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

type MemberOut = {
  id: string;
  email?: string | null;
  username?: string | null;
  profilePicture?: string | null;
};

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  const auth = getAuthHeader(session);

  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Use /team which returns all teams AND their members (works reliably)
    const r = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!r.ok) {
      const body = await r.text();
      return NextResponse.json(
        { error: "ClickUp error", details: body || r.statusText },
        { status: 500 }
      );
    }

    const data = await r.json();
    const teams: any[] = Array.isArray(data?.teams) ? data.teams : [];

    // Flatten unique members across all teams
    const mp = new Map<string, MemberOut>();
    for (const t of teams) {
      const members = Array.isArray(t?.members) ? t.members : [];
      for (const m of members) {
        const u = m?.user ?? m; // some shapes are { user: {...} }
        const id = u?.id != null ? String(u.id) : undefined;
        if (!id) continue;
        if (!mp.has(id)) {
          mp.set(id, {
            id,
            email: u?.email ?? null,
            username: u?.username ?? null,
            profilePicture: u?.profilePicture ?? null,
          });
        }
      }
    }

    // Fallback: if teams API gave nothing, at least include the current user
    if (mp.size === 0 && session.user?.id) {
      mp.set(session.user.id, {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username ?? null,
        profilePicture: session.user.profilePicture ?? null,
      });
    }

    const members: MemberOut[] = Array.from(mp.values()).sort((a, b) =>
      (a.username || a.email || "").localeCompare(b.username || b.email || "")
    );

    return NextResponse.json({ members, source: "teams_api" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
