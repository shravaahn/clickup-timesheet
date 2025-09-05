// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}
type TeamMember = { id: number; username: string; email: string };

async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Get team failed ${r.status}: ${text || ""}`);

  const members = Array.isArray(json?.members) ? json.members : [];
  return members
    .map((m: any) => ({
      id: Number(m?.user?.id),
      username: String(m?.user?.username ?? ""),
      email: String(m?.user?.email ?? ""),
    }))
    .filter((m: TeamMember) => Number.isFinite(m.id));
}

async function getAuthHeader(req: NextRequest, res: NextResponse) {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));
  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Not authenticated and CLICKUP_API_TOKEN missing");
  return bearer(envToken);
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const Authorization = await getAuthHeader(req, res);

    const bodyIn = await req.json().catch(() => ({}));
    const name = String(bodyIn?.name || "");
    const assigneeIdRaw = bodyIn?.assigneeId != null ? String(bodyIn.assigneeId) : "";
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const LIST_ID = process.env.CLICKUP_LIST_ID;
    if (!LIST_ID) return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });

    // Resolve assignee to numeric
    let assignees: number[] | undefined = undefined;
    if (assigneeIdRaw) {
      let numeric: number | undefined = /^[0-9]+$/.test(assigneeIdRaw) ? Number(assigneeIdRaw) : undefined;
      if (!numeric && process.env.CLICKUP_TEAM_ID) {
        try {
          const members = await fetchTeamMembers(Authorization, process.env.CLICKUP_TEAM_ID);
          const needle = assigneeIdRaw.toLowerCase();
          let match =
            members.find(m => (m.email || "").toLowerCase() === needle) ||
            members.find(m => (m.username || "").toLowerCase() === needle) ||
            members.find(m => String(m.id) === assigneeIdRaw);
          if (match) numeric = match.id;
        } catch (e) { /* ignore; leave unassigned if not found */ }
      }
      if (Number.isFinite(numeric)) assignees = [Number(numeric)];
    }

    const payload: any = { name };
    if (assignees) payload.assignees = assignees;

    const r = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      return NextResponse.json({ error: "ClickUp create failed", details: json || text }, { status: 502 });
    }

    return NextResponse.json({ ok: true, task: json });
  } catch (err: any) {
    console.error("/api/projects POST error:", err);
    return NextResponse.json({ error: "Create failed", details: err?.message || String(err) }, { status: 500 });
  }
}
