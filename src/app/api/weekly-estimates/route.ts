// src/app/api/weekly-estimates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET: ?userId=...&weeks=YYYY-MM-DD,YYYY-MM-DD
 * POST: { userId, weekStart, hours }
 */

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId") || "";
    const weeksRaw = sp.get("weeks") || "";
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const weeks = weeksRaw ? weeksRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (weeks.length === 0) {
      // default: return current week only
    }

    let q = supabaseAdmin.from("weekly_estimates").select("*").eq("user_id", userId);
    if (weeks.length > 0) q = q.in("week_start", weeks); // note: week_start is date
    const { data, error } = await q.order("week_start", { ascending: true });

    if (error) {
      console.error("weekly-estimates GET error:", error);
      return NextResponse.json({ error: "DB query failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data || [] });
  } catch (err: any) {
    console.error("weekly-estimates GET error:", err);
    return NextResponse.json({ error: "Failed to fetch estimates", details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "");
    const weekStart = String(body.weekStart || "");
    const hours = Number(body.hours ?? NaN);
    if (!userId || !weekStart || !Number.isFinite(hours)) {
      return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    // Prefer session user (consultant). If session exists, ensure the user matches the provided userId or user is admin.
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessUser = session?.user;
    const isAdmin = !!sessUser?.is_admin;
    const sessUserId = String(sessUser?.id || "");

    // If session present and not admin, require they can only create for themselves
    if (sessUser && !isAdmin && sessUserId !== userId) {
      return NextResponse.json({ error: "Cannot create estimate for another user" }, { status: 403 });
    }

    // Check if existing row exists
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("weekly_estimates")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .limit(1)
      .maybeSingle();

    if (exErr) {
      console.error("weekly-estimates select error:", exErr);
      return NextResponse.json({ error: "DB error", details: exErr.message }, { status: 500 });
    }

    if (existing) {
      if (existing.locked) {
        return NextResponse.json({ error: "Estimate already locked" }, { status: 409 });
      }
      // update existing row, set locked true
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("weekly_estimates")
        .update({ hours, locked: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .maybeSingle();

      if (updErr) {
        console.error("weekly-estimates update error:", updErr);
        return NextResponse.json({ error: "DB update failed", details: updErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, estimate: updated });
    }

    // Insert new (locked by default)
    const payload = {
      user_id: userId,
      week_start: weekStart,
      hours,
      locked: true,
      created_at: new Date().toISOString(),
      created_by: sessUserId || null,
    };

    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.error("weekly-estimates insert error:", error);
      return NextResponse.json({ error: "DB insert failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, estimate: data });
  } catch (err: any) {
    console.error("weekly-estimates POST error:", err);
    return NextResponse.json({ error: "Failed to save estimate", details: String(err) }, { status: 500 });
  }
}
