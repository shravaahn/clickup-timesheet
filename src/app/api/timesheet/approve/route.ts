// src/app/api/approvals/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getUserRoles,
  getDirectReports,
} from "@/lib/db";

/* ================================
   GET — Fetch pending approvals

   Access control:
   - OWNER   → All submitted weeks
   - MANAGER → Submitted weeks of DIRECT reports only
   - CONSULTANT → Forbidden (403)
================================ */

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgUser = await getOrgUserByClickUpId(String(session.user.id));
    if (!orgUser) {
      return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
    }

    const roles = await getUserRoles(orgUser.id);
    const isOwner = roles.includes("OWNER");
    const isManager = roles.includes("MANAGER");

    if (!isOwner && !isManager) {
      return NextResponse.json(
        { error: "Forbidden: approvals are manager/owner only" },
        { status: 403 }
      );
    }

    /* -------- Base query (SUBMITTED only) -------- */

    let query = supabaseAdmin
      .from("weekly_timesheets")
      .select(`
        id,
        user_id,
        week_start,
        status,
        submitted_at,
        approved_at,
        approved_by,
        rejected_at,
        rejected_by,
        created_at,
        updated_at
      `)
      .eq("status", "SUBMITTED")
      .order("submitted_at", { ascending: true });

    /* -------- MANAGER scope: DIRECT reports only -------- */

    if (isManager && !isOwner) {
      // getDirectReports returns org_user_ids (string[])
      const directReportOrgUserIds: string[] =
        await getDirectReports(orgUser.id);

      if (directReportOrgUserIds.length === 0) {
        return NextResponse.json({ timesheets: [] });
      }

      query = query.in("user_id", directReportOrgUserIds);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "DB query failed", details: error.message },
        { status: 500 }
      );
    }

    /* -------- Attach user metadata -------- */

    const timesheetsWithUsers = await Promise.all(
      (data || []).map(async (ts) => {
        const { data: user } = await supabaseAdmin
          .from("org_users")
          .select("id, clickup_user_id, email, username")
          .eq("id", ts.user_id)
          .maybeSingle();

        return { ...ts, user };
      })
    );

    return NextResponse.json({ timesheets: timesheetsWithUsers });
  } catch (err: any) {
    console.error("approvals GET error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}

/* ================================
   POST — Approve / Reject week

   Access control:
   - OWNER   → Any submitted week
   - MANAGER → DIRECT reports only
   - CONSULTANT → Forbidden

   State transitions:
   - SUBMITTED → APPROVED
   - SUBMITTED → REJECTED
================================ */

export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { timesheetId, action } = body;

    if (!timesheetId || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid timesheetId or action" },
        { status: 400 }
      );
    }

    const orgUser = await getOrgUserByClickUpId(String(session.user.id));
    if (!orgUser) {
      return NextResponse.json({ error: "User not provisioned" }, { status: 403 });
    }

    const roles = await getUserRoles(orgUser.id);
    const isOwner = roles.includes("OWNER");
    const isManager = roles.includes("MANAGER");

    if (!isOwner && !isManager) {
      return NextResponse.json(
        { error: "Forbidden: approval is manager/owner only" },
        { status: 403 }
      );
    }

    /* -------- Fetch timesheet -------- */

    const { data: timesheet } = await supabaseAdmin
      .from("weekly_timesheets")
      .select("*")
      .eq("id", timesheetId)
      .maybeSingle();

    if (!timesheet) {
      return NextResponse.json(
        { error: "Timesheet not found" },
        { status: 404 }
      );
    }

    if (timesheet.status !== "SUBMITTED") {
      return NextResponse.json(
        {
          error: "Invalid state transition",
          reason: `Expected SUBMITTED, got ${timesheet.status}`,
        },
        { status: 409 }
      );
    }

    /* -------- MANAGER scope check -------- */

    if (isManager && !isOwner) {
      const directReportOrgUserIds: string[] =
        await getDirectReports(orgUser.id);

      if (!directReportOrgUserIds.includes(timesheet.user_id)) {
        return NextResponse.json(
          { error: "Forbidden: not your direct report" },
          { status: 403 }
        );
      }
    }

    /* -------- ATOMIC update -------- */

    const now = new Date().toISOString();

    const update =
      action === "approve"
        ? {
            status: "APPROVED",
            approved_at: now,
            approved_by: orgUser.id,
            updated_at: now,
          }
        : {
            status: "REJECTED",
            rejected_at: now,
            rejected_by: orgUser.id,
            updated_at: now,
          };

    const { data: updated, error } = await supabaseAdmin
      .from("weekly_timesheets")
      .update(update)
      .eq("id", timesheetId)
      .eq("status", "SUBMITTED") // ATOMIC GUARD
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Update failed", details: error.message },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: "State changed, refresh and retry" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, timesheet: updated });
  } catch (err: any) {
    console.error("approvals POST error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
