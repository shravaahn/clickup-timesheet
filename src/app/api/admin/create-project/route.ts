// src/app/api/admin/create-project/route.ts
import { NextResponse } from "next/server";
import { cuCreateTask } from "@/lib/clickup";

export async function POST(req: Request) {
  try {
    const { name, assigneeId } = await req.json();

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Missing task name" }, { status: 400 });
    }

    const LIST_ID = process.env.CLICKUP_LIST_ID;
    if (!LIST_ID) {
      return NextResponse.json({ error: "CLICKUP_LIST_ID not configured" }, { status: 500 });
    }

    // ClickUp expects numeric member IDs in `assignees`
    const assignees: number[] | undefined =
      assigneeId != null && assigneeId !== ""
        ? [Number(assigneeId)].filter((n) => Number.isFinite(n))
        : undefined;

    const created = await cuCreateTask(String(LIST_ID), {
      name: String(name).trim(),
      assignees, // <-- critical: ensure assignment on create
    });

    return NextResponse.json({ task: { id: created.id, name: created.name } });
  } catch (err: any) {
    console.error("create-project error:", err);
    return NextResponse.json(
      { error: "Create task failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
