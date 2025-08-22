// src/app/api/admin/unlock-estimates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { userId, start, end } = await req.json();
    if (!userId || !start || !end) {
      return NextResponse.json(
        { error: "Missing userId/start/end" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("timesheet_entries")
      .update({ estimate_locked: false })
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unlock failed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
