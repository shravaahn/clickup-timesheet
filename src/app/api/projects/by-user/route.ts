// src/app/api/admin/create-project/route.ts
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/* ------------ small helpers (inline to avoid missing imports) ------------ */

function bearer(tok: string) {
  return tok.startsWith("Bearer ") ? tok : `Bearer ${tok}`;
}

async function getAuthHeader(req: Request): Promise<string> {
  const res = new NextResponse();
  const session: any = await getIronSession(req as any, res as any, sessionOptions);
  const sessTok = session?.access_token || session?.accessToken;
  if (sessTok) return bearer(String(sessTok));
  const envTok = process.env.CLICKUP_API_TOKEN;
  if (!envTok) throw new Error("No ClickUp token in session and CLICKUP_API_TOKEN is missing");
  return bearer(envTok);
}

type TeamMember = { id: number; username: string; email: string };

async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];
  const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
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

/* --------------------------------- POST --------------------------------- */
/**
 * Create a ClickUp task in a specific List, optionally assigning it.
 *
 * Body:
 * { name: string, code?: string, assigneeId?: string|number|email|username }
 */
export async function POST(req: Request) {
  try {
    const Authorization = await getAuthHeader(req);

    const { name, code, assigneeId } = await req.json().catch(() => ({}));
    if (!name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const LIST_ID = process.env.CLICKUP_LIST_ID || "";
    if (!LIST_ID) {
      return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });
    }

    const TEAM_ID =
      process.env.CLICKUP_TEAM_ID ||
      process.env.TEAM_ID || // (seen in your Vercel screenshots)
      "";

    // Resolve assignee to numeric member id if provided
    let assignees: number[] | undefined;
    if (assigneeId != null && assigneeId !== "") {
      let numeric: number | undefined = isNumericId(String(assigneeId))
        ? Number(assigneeId)
        : undefined;

      if (!numeric && TEAM_ID) {
        try {
          const members = await fetchTeamMembers(Authorization, TEAM_ID);
          const needle = String(assigneeId).toLowerCase();
          let match =
            members.find((m) => String(m.email).toLowerCase() === needle) ||
            members.find((m) => String(m.username).toLowerCase() === needle) ||
            members.find((m) => String(m.id) === String(assigneeId));
          if (match) numeric = match.id;
        } catch (e) {
          console.warn("Assignee resolution failed:", e);
        }
      }

      if (Number.isFinite(numeric)) assignees = [Number(numeric)];
    }

    const body: any = {
      name: String(name),
      // If you tag tasks with a short code, keep it; otherwise omit.
      ...(code ? { tags: [String(code)] } : {}),
      ...(assignees ? { assignees } : {}),
    };

    const r = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task`, {
      method: "POST",
      headers: {
        Authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* noop */
    }

    if (!r.ok) {
      return NextResponse.json(
        { error: "ClickUp create failed", details: json || text },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, task: json });
  } catch (err: any) {
    console.error("/api/admin/create-project POST error:", err);
    return NextResponse.json(
      { error: "Create failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
