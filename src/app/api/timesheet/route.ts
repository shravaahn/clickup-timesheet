import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

// GET /api/timesheet?userId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!userId || !start || !end) {
      return NextResponse.json({ error: "Missing userId/start/end" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      entries: (data || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        task_id: r.task_id,
        task_name: r.task_name,
        date: r.date,
        estimate_hours: r.estimate_hours,
        estimate_locked: r.estimate_locked,
        tracked_hours: r.tracked_hours,
        tracked_note: r.tracked_note,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "DB error (fetch)", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

type Base = { userId: string; taskId: string; taskName?: string; date: string; hours: number };
type EstimateBody = Base & { type: "estimate" };
type TrackedBody = Base & { type: "tracked"; note: string };

// POST /api/timesheet { type, userId, taskId, taskName?, date, hours, note? }
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EstimateBody | TrackedBody;
    const { type, userId, taskId, taskName, date, hours } = body as any;

    if (!type || !userId || !taskId || !date || typeof hours !== "number" || !Number.isFinite(hours)) {
      return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
    }

    if (type === "estimate") {
      const { error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          {
            user_id: userId,
            task_id: taskId,
            task_name: taskName ?? null,
            date,
            estimate_hours: hours,
            estimate_locked: true,
          },
          { onConflict: "user_id,task_id,date", ignoreDuplicates: false }
        )
        .select("id"); // don't .single(); updates that change nothing may return 0 rows

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "tracked") {
      const note = (body as TrackedBody).note ?? "";
      const { error } = await supabaseAdmin
        .from("timesheet_entries")
        .upsert(
          {
            user_id: userId,
            task_id: taskId,
            task_name: taskName ?? null,
            date,
            tracked_hours: hours,
            tracked_note: note,
          },
          { onConflict: "user_id,task_id,date", ignoreDuplicates: false }
        )
        .select("id");

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "DB error (insert/upsert)", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
