// src/app/api/admin/create-project/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

type Body = { name?: string; assigneeId?: string; description?: string | null };

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  const auth = getAuthHeader(session);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Only admins
  if (!session.user?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const listId = (process.env.CLICKUP_PROJECT_HOME_LIST_ID || "").trim();
  if (!listId) {
    return NextResponse.json(
      { error: "Missing CLICKUP_PROJECT_HOME_LIST_ID env" },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const assigneeId = (body.assigneeId || "").trim();
  const description = (body.description || "")?.trim();

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (!assigneeId) return NextResponse.json({ error: "Missing assigneeId" }, { status: 400 });

  try {
    const url = `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`;
    const cuResp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description: description || undefined,
        assignees: [Number(assigneeId)], // ClickUp expects number IDs here
        // other fields if you want:
        // status: "Open",
        // due_date: null,
        // priority: 3,
      }),
    });

    if (!cuResp.ok) {
      const t = await cuResp.text();
      return NextResponse.json(
        { error: `ClickUp create task failed (${cuResp.status})`, details: t },
        { status: 500 }
      );
    }

    const created = await cuResp.json();
    return NextResponse.json({
      id: String(created?.id || created?.task?.id || ""),
      name: String(created?.name || name),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
