// src/app/api/weekly-estimates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
} from "@/lib/db";

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function startOfWeekUTC(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7;   // Monday start
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function allowedWeekStarts() {
  const now = new Date();
  const thisWeek = startOfWeekUTC(now);

  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWeek = startOfWeekUTC(next);

  return [thisWeek, nextWeek];
}

/* -------------------------------------------------------
   State Machine Enforcement
-------------------------------------------------------- */

/**
 * Check if user can edit weekly estimates for a given week.
 * Same rules as timesheet entries.
 */
async function checkWeekEditPermission(
  userId: string,
  weekStart: string
): Promise<{ allowed: boolean; status: string | null; reason?: string }> {
  const { data: weeklyTimesheet } = await supabaseAdmin
    .from("weekly_timesheets")
    .select("status")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (!weeklyTimesheet) {
    // No weekly timesheet exists yet - assume OPEN
    return { allowed: true, status: null };
  }

  const status = weeklyTimesheet.status;

  switch (status) {
    case "OPEN":
    case "REJECTED":
      return { allowed: true, status };
    
    case "SUBMITTED":
      return {
        allowed: false,
        status,
        reason: "Week is submitted and awaiting approval. Cannot edit until approved or rejected.",
      };
    
    case "APPROVED":
      return {
        allowed: false,
        status,
        reason: "Week is approved and locked. No further edits allowed.",
      };
    
    default:
      return {
        allowed: false,
        status,
        reason: `Unknown status: ${status}`,
      };
  }
}

/* =======================================================
   GET — Fetch weekly estimates
======================================================= */
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgUser = await getOrgUserByClickUpId(String(sessionUser.id));
    if (!orgUser) {
      return NextResponse.json({ rows: [] });
    }

    const roles = await getUserRoles(orgUser.id);
    const isAdmin = roles.includes("OWNER") || roles.includes("ADMIN");

    const sp = req.nextUrl.searchParams;
    const targetUserId = sp.get("userId");

    // Consultants can only read their own estimates
    if (targetUserId && !isAdmin && targetUserId !== orgUser.clickup_user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const queryUserId = targetUserId || orgUser.clickup_user_id;

    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .select("*")
      .eq("user_id", queryUserId)
      .order("week_start", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "DB query failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: data || [] });
  } catch (err: any) {
    console.error("weekly-estimates GET error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}

/* =======================================================
   POST — Submit weekly estimate
======================================================= */
export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const weekStart = String(body.weekStart || "");
    const hours = Number(body.hours ?? NaN);

    if (!weekStart || !Number.isFinite(hours)) {
      return NextResponse.json(
        { error: "Missing or invalid parameters" },
        { status: 400 }
      );
    }

    const orgUser = await getOrgUserByClickUpId(String(sessionUser.id));
    if (!orgUser) {
      return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
    }

    const roles = await getUserRoles(orgUser.id);
    const isAdmin = roles.includes("OWNER") || roles.includes("ADMIN");

    const targetUserId = body.userId
      ? String(body.userId)
      : orgUser.clickup_user_id;

    // Consultants cannot submit for others
    if (!isAdmin && targetUserId !== orgUser.clickup_user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /* -------- STATE MACHINE ENFORCEMENT -------- */
    
    const permission = await checkWeekEditPermission(targetUserId, weekStart);
    
    if (!permission.allowed) {
      return NextResponse.json(
        {
          error: "Cannot edit weekly estimate",
          reason: permission.reason,
          status: permission.status,
        },
        { status: 403 }
      );
    }

    /* -------- VALIDATION -------- */

    // Only allow current week or next week
    const allowedWeeks = allowedWeekStarts();
    if (!allowedWeeks.includes(weekStart)) {
      return NextResponse.json(
        { error: "Estimates allowed only for current or next week" },
        { status: 409 }
      );
    }

    /* -------- UPSERT ESTIMATE -------- */

    // Check existing
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("weekly_estimates")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (exErr) {
      return NextResponse.json(
        { error: "DB error", details: exErr.message },
        { status: 500 }
      );
    }

    if (existing) {
      if (existing.locked) {
        return NextResponse.json(
          { error: "Estimate already locked" },
          { status: 409 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from("weekly_estimates")
        .update({
          hours,
          locked: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Update failed", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, estimate: data });
    }

    // Insert new (locked immediately)
    const { data, error } = await supabaseAdmin
      .from("weekly_estimates")
      .insert({
        user_id: targetUserId,
        week_start: weekStart,
        hours,
        locked: true,
        created_at: new Date().toISOString(),
        created_by: orgUser.id,
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Insert failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, estimate: data });
  } catch (err: any) {
    console.error("weekly-estimates POST error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}