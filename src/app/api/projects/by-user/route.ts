// src/app/api/admin/create-task/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

type CreateTaskBody = {
  name: string;
  assigneeId?: string;     // ClickUp user id (number-like string is fine)
  listId?: string;         // Optional override
  description?: string;    // Optional
};

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as unknown as AppSession;

  const auth = getAuthHeader(session);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as CreateTaskBody | null;
  if (!body || !body.name?.trim()) {
    return NextResponse.json({ error: 'Missing required field "name"' }, { status: 400 });
  }

  const listId =
    body.listId ||
    process.env.CLICKUP_DEFAULT_LIST_ID ||
    process.env.CLICKUP_ACTIVE_LIST_ID ||
    process.env.CLICKUP_ACTIVE_LIST_IDS?.split(",")[0]?.trim();

  if (!listId) {
    return NextResponse.json(
      {
        error:
          "No List ID configured. Set CLICKUP_DEFAULT_LIST_ID (or CLICKUP_ACTIVE_LIST_ID / CLICKUP_ACTIVE_LIST_IDS) in your environment.",
      },
      { status: 500 }
    );
  }

  const payload: Record<string, unknown> = {
    name: body.name.trim(),
  };
  if (body.description) payload.description = body.description;

  // ClickUp expects an array of IDs under `assignees`
  if (body.assigneeId) {
    const n = Number(body.assigneeId);
    payload.assignees = [Number.isFinite(n) ? n : body.assigneeId];
  }

  try {
    const cu = await fetch(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const text = await cu.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!cu.ok) {
      return NextResponse.json(
        {
          error: "ClickUp error",
          status: cu.status,
          body: data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      taskId: data?.id || data?.task?.id || null,
      task: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Network error" },
      { status: 500 }
    );
  }
}
