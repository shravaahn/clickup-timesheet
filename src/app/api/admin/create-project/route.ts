// src/app/api/admin/create-project/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

type AppSession = {
  access_token?: string;
  user?: { email?: string };
};

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = (await getIronSession(req, res, sessionOptions)) as unknown as AppSession;

  const token = session?.access_token;
  const email = (session?.user?.email || "").toLowerCase();

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!ADMINS.includes(email)) {
    return NextResponse.json({ error: "Forbidden (admin only)" }, { status: 403 });
  }

  const body = (await req.json()) as { name?: string; assigneeId?: string; listId?: string };
  const name = (body.name || "").trim();
  const assigneeId = (body.assigneeId || "").trim();
  const listId = (body.listId || process.env.CLICKUP_CREATE_LIST_ID || "").toString();

  if (!name || !assigneeId) {
    return NextResponse.json({ error: "name and assigneeId are required" }, { status: 400 });
  }
  if (!listId) {
    return NextResponse.json(
      { error: "Set CLICKUP_CREATE_LIST_ID in environment or pass listId" },
      { status: 400 }
    );
  }

  // Create task (project) in ClickUp
  const cuResp = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({
      name,
      assignees: [Number(assigneeId)], // assign to consultant
      notify_all: false,
    }),
    cache: "no-store",
  });

  const data = await cuResp.json().catch(() => ({}));
  if (!cuResp.ok) {
    return NextResponse.json(
      { error: "ClickUp create failed", details: typeof data === "object" ? JSON.stringify(data) : String(data) },
      { status: 500 }
    );
  }

  return NextResponse.json({ task: data });
}
