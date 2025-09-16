// src/app/api/weekly-estimates/unlock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessUser = session?.user;
    if (!sessUser || !sessUser.is_admin) {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    const body = await req.json().catch(()=>({}));
    const userId = String(body.userId || "");
    const weekStart = String(body.weekStart || "");
    if (!userId || !weekStart) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .update({ locked: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .select()
      .maybeSingle();

    if (error) {
      console.error("unlock error:", error);
      return NextResponse.json({ error: "Unlock failed", details: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, estimate: data });
  } catch (err: any) {
    console.error("weekly-estimates/unlock error:", err);
    return NextResponse.json({ error: "Unlock failed", details: String(err) }, { status: 500 });
  }
}
