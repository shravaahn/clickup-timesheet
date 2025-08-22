// src/app/api/admin/create-project/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Creates a top-level task in a specific ClickUp List and assigns it to a user.
 * Env required:
 *  - CLICKUP_LIST_ID: the target List where we create tasks
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  const rawToken = session?.access_token || session?.accessToken;
  if (!rawToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const Authorization = String(rawToken).startsWith("Bearer ")
    ? String(rawToken)
    : `Bearer ${rawToken}`;

  const { name, assigneeId } = await req.json().catch(() => ({}));
  if (!name || !assigneeId) {
    return NextResponse.json(
      { error: "Missing 'name' or 'assigneeId'." },
      { status: 400 },
    );
  }

  const LIST_ID = process.env.CLICKUP_LIST_ID;
  if (!LIST_ID) {
    return NextResponse.json(
      { error: "Server misconfiguration: CLICKUP_LIST_ID not set" },
      { status: 500 },
    );
  }

  try {
    const apiUrl = `https://api.clickup.com/api/v2/list/${LIST_ID}/task`;
    const body = {
      name,
      assignees: [String(assigneeId)],
      // optional defaults you might want:
      status: undefined, // or "to do"
      priority: null,
      time_estimate: null,
      // make sure we create a top-level task
      parent: null,
    };

    const r = await fetch(apiUrl, {
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
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { error: "ClickUp create failed", details: json || text },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, task: json });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Create task error", details: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
