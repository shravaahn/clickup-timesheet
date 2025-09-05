import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

function digitsOnly(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const rawToken = session?.access_token || session?.accessToken;
  if (!rawToken) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const Authorization = String(rawToken).startsWith("Bearer ")
    ? String(rawToken)
    : `Bearer ${rawToken}`;

  const { name, code, assigneeId } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const LIST_ID = process.env.CLICKUP_LIST_ID;
  if (!LIST_ID) {
    return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });
  }

  // Build body; include assignee if a numeric id was provided
  const body: any = { name: String(name), tags: code ? [String(code)] : [] };
  const numericAssignee = digitsOnly(String(assigneeId ?? ""));
  if (numericAssignee) {
    body.assignees = [Number(numericAssignee)];
  }

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
}
