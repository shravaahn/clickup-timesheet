import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!start || !end) {
      return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select("user_id, estimate_hours, tracked_hours")
      .gte("date", start)
      .lte("date", end);

    if (error) throw error;

    const map = new Map<string, { est: number; tracked: number }>();
    for (const r of data || []) {
      const k = r.user_id as string;
      if (!map.has(k)) map.set(k, { est: 0, tracked: 0 });
      map.get(k)!.est += Number(r.estimate_hours || 0);
      map.get(k)!.tracked += Number(r.tracked_hours || 0);
    }

    const rows = Array.from(map.entries()).map(([id, v]) => ({
      id,
      name: id, // UI will map to display name using /api/consultants
      est: Number((v.est || 0).toFixed(2)),
      tracked: Number((v.tracked || 0).toFixed(2)),
    }));

    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json(
      { error: "DB error (summary)", details: err?.message },
      { status: 500 }
    );
  }
}
