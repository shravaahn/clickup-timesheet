// src/app/api/leave/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
  getDirectReports,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const manager = await getOrgUserByClickUpId(String(session.user.id));
    if (!manager) {
      return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.requestId || "");
    const action = String(body.action || "").toUpperCase(); // APPROVE / REJECT

    if (!requestId || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { data: request } = await supabaseAdmin
      .from("leave_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const reports = await getDirectReports(manager.id);
    if (!reports.includes(request.user_id)) {
      return NextResponse.json(
        { error: "Not authorized to act on this request" },
        { status: 403 }
      );
    }

    // Update request status
    await supabaseAdmin
      .from("leave_requests")
      .update({
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        decided_by: manager.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // Deduct balance only on approval
    if (action === "APPROVE") {
      const days =
        (new Date(request.end_date).getTime() -
          new Date(request.start_date).getTime()) /
          (1000 * 60 * 60 * 24) +
        1;

      // FIX #2: Convert days to hours (8 hours per day)
      const hours = days * 8;

      await supabaseAdmin
        .from("leave_balances")
        .update({
          used_hours: supabaseAdmin.rpc("increment", {
            x: hours,
          }),
          balance_hours: supabaseAdmin.rpc("increment", {
            x: -hours,
          }),
        })
        .eq("user_id", request.user_id)
        .eq("leave_type_id", request.leave_type_id)
        .eq("year", new Date(request.start_date).getFullYear());

      // Get leave type code for timesheet entries
      const { data: leaveType } = await supabaseAdmin
        .from("leave_types")
        .select("code")
        .eq("id", request.leave_type_id)
        .maybeSingle();

      const leaveCode = leaveType?.code || "LEAVE";

      // Get user's country for holiday checking
      const { data: userData } = await supabaseAdmin
        .from("org_users")
        .select("country")
        .eq("id", request.user_id)
        .maybeSingle();

      const userCountry = userData?.country || null;

      if (!userCountry) {
        return NextResponse.json(
          { error: "Employee country not set. Cannot approve leave." },
          { status: 409 }
        );
      }

      // FIX #1: Get holidays for the year including 'BOTH' country holidays
      const year = new Date(request.start_date).getFullYear();
      const { data: holidays } = await supabaseAdmin
        .from("holidays")
        .select("date")
        .eq("year", year)
        .or(`country.eq.${userCountry || ""},country.eq.BOTH`);

      const holidayDates = new Set((holidays || []).map((h: any) => h.date));

      // Generate timesheet entries for each weekday
      const timesheetEntries = [];
      const startDate = new Date(request.start_date + "T00:00:00Z");
      const endDate = new Date(request.end_date + "T00:00:00Z");

      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 6 = Saturday

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dateStr = d.toISOString().slice(0, 10);

        // Skip holidays
        if (holidayDates.has(dateStr)) continue;

        timesheetEntries.push({
          user_id: request.user_id,
          date: dateStr,
          task_id: "LEAVE",
          task_name: leaveCode,
          tracked_hours: 8,
          tracked_note: "AUTO: LEAVE",
          estimate_locked: true,
        });
      }

      // Upsert timesheet entries
      if (timesheetEntries.length > 0) {
        const { error: timesheetError } = await supabaseAdmin
          .from("timesheet_entries")
          .upsert(timesheetEntries, {
            onConflict: "user_id,task_id,date",
          });

        if (timesheetError) {
          console.error("Failed to create timesheet entries:", timesheetError);
          return NextResponse.json(
            {
              error: "Leave approved but timesheet creation failed",
              details: timesheetError.message,
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("leave approval error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}