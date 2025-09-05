//src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { makeAuthHeader } from "@/lib/clickupAuth";

/* Resolve email/username/internal -> numeric ClickUp member id */
type TeamMember = { id: number; username: string; email: string };

async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`Get team failed ${r.status}: ${t}`);
  }
  const j = await r.json();
  const members = Array.isArray(j?.members) ? j.members : [];
  return members
    .map((m: any) => ({
      id: Number(m?.user?.id),
      username: String(m?.user?.username ?? ""),
      email: String(m?.user?.email ?? ""),
    }))
    .filter((m: TeamMember) => Number.isFinite(m.id));
}

function isNumericId(v: string | null): v is string {
  return !!v && /^[0-9]+$/.test(v);
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return makeAuthHeader(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (!envToken) throw new Error("Not authenticated and CLICKUP_API_TOKEN missing");
  return makeAuthHeader(envToken);
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();

  try {
    const Authorization = await getAuthHeader(req, res);

    const { name, code, assigneeId } = await req.json().catch(() => ({}));
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const LIST_ID = process.env.CLICKUP_LIST_ID;
    if (!LIST_ID) {
      return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });
    }

    const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";

    // Resolve assignee to numeric if provided
    let assignees: number[] | undefined = undefined;
    if (assigneeId != null && assigneeId !== "") {
      let numeric: number | undefined = isNumericId(String(assigneeId)) ? Number(assigneeId) : undefined;
      if (!numeric && TEAM_ID) {
        try {
          const members = await fetchTeamMembers(Authorization, TEAM_ID);
          const needle = String(assigneeId).toLowerCase();
          let match = members.find((m) => String(m.email).toLowerCase() === needle);
          if (!match) match = members.find((m) => String(m.username).toLowerCase() === needle);
          if (!match) match = members.find((m) => String(m.id) === String(assigneeId));
          if (match) numeric = match.id;
        } catch (e) {
          console.warn("Assignee resolution failed:", e);
        }
      }
      if (Number.isFinite(numeric)) assignees = [Number(numeric)];
    }

    const body: any = { name: String(name), tags: code ? [String(code)] : [] };
    if (assignees) body.assignees = assignees;

    const r = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
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
