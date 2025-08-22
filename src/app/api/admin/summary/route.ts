// src/app/api/admin/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Returns rows like: [{ name, est, tracked }]
 * For now, we group by user_id and synthesize a name as user_id (you can join to a users table if you have one).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const start = sp.get("start");
    const end = sp.get("end");
    if (!start || !end) {
      return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
    }

    // Pull the week’s entries and aggregate in memory (portable & simple).
    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select("user_id, estimate_hours, tracked_hours")
      .gte("date", start)
      .lte("date", end);

    if (error) throw error;

    const map = new Map<string, { name: string; est: number; tracked: number }>();
    (data || []).forEach((r) => {
      const id = String(r.user_id);
      if (!map.has(id)) map.set(id, { name: id, est: 0, tracked: 0 });
      const row = map.get(id)!;
      row.est += r.estimate_hours ?? 0;
      row.tracked += r.tracked_hours ?? 0;
    });

    return NextResponse.json({ rows: Array.from(map.values()) });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Summary failed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
