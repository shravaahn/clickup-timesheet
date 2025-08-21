// src/app/api/projects/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/** Simple admin check from env list (fallback if session.user.is_admin isn't set) */
function isAdminEmail(email?: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}

type CreateBody = {
  name: string;
  assigneeId?: string;      // ClickUp user id (numeric string)
  description?: string;
};

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions);

  // Pull what we need from the session (support both access_token styles)
  const s: any = session as any;
  const accessToken: string | undefined =
    s?.access_token || s?.accessToken || s?.token;
  const me = s?.user;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(me?.is_admin || isAdminEmail(me?.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Choose a list to create tasks in.
  // Priority: CLICKUP_CREATE_TASK_LIST_ID → CLICKUP_ACTIVE_LIST_ID → CLICKUP_SPACE_ID (last one only if you mapped it to a list id)
  const listId =
    process.env.CLICKUP_CREATE_TASK_LIST_ID ||
    process.env.CLICKUP_ACTIVE_LIST_ID ||
    process.env.CLICKUP_SPACE_ID;

  if (!listId) {
    return NextResponse.json(
      {
        error:
          "Missing CLICKUP_CREATE_TASK_LIST_ID (or CLICKUP_ACTIVE_LIST_ID). Set an actual **List** ID to create tasks in.",
      },
      { status: 500 }
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Build ClickUp payload
  const payload: Record<string, unknown> = { name };
  if (body?.description) payload.description = body.description;

  if (body?.assigneeId) {
    const idNum = Number(body.assigneeId);
    if (!Number.isNaN(idNum)) {
      // ClickUp expects an array of numeric ids
      payload.assignees = [idNum];
    }
  }

  try {
    const cuRes = await fetch(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(
        listId
      )}/task`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // ClickUp expects the raw token, not "Bearer ..."
          Authorization: String(accessToken),
        },
        body: JSON.stringify(payload),
      }
    );

    const text = await cuRes.text();
    if (!cuRes.ok) {
      return NextResponse.json(
        {
          error: "Create task failed",
          status: cuRes.status,
          details: text,
        },
        { status: 500 }
      );
    }

    // ClickUp returns the created task object
    const data = JSON.parse(text);
    const task = {
      id: String(data?.id ?? data?.task?.id ?? ""),
      name: String(data?.name ?? data?.task?.name ?? name),
      url: data?.url ?? data?.task?.url ?? null,
    };

    return NextResponse.json({ ok: true, task });
  } catch (err) {
    return NextResponse.json(
      { error: "Create task failed", details: (err as Error).message },
      { status: 500 }
    );
  }
}
