// src/app/api/admin/create-project/route.ts
import { NextResponse } from "next/server";
import { cuCreateTask, getAuthHeader } from "@/lib/clickup";

/** simple numeric check */
const isNum = (v: string | null) => !!v && /^[0-9]+$/.test(v);

export async function POST(req: Request) {
  try {
    const { name, assigneeId } = await req.json().catch(() => ({}));
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const listId = process.env.CLICKUP_LIST_ID || "";
    if (!listId) return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });

    const authHeader = await getAuthHeader();

    let assignees: number[] | undefined = undefined;
    if (isNum(assigneeId)) assignees = [Number(assigneeId)];

    const task = await cuCreateTask({
      authHeader,
      listId,
      name: String(name),
      assignees,
    });

    return NextResponse.json({ ok: true, task });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Create task failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
