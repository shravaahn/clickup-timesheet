// src/app/api/cron/lock-timesheets/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Called weekly (Friday 11 PM CST)
 * Locks timesheets and creates approval records
 */
export async function POST() {
  // 1. Determine current week (Mon–Sun)
  const now = new Date();

  const day = now.getUTCDay(); // 0 = Sun
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  // 2. Fetch all consultants
  const { data: consultants } = await supabaseAdmin
    .from("org_users")
    .select("id")
    .eq("is_active", true);

  if (!consultants?.length) {
    return NextResponse.json({ ok: true });
  }

  for (const user of consultants) {
    // 3. Find reporting manager
    const { data: rm } = await supabaseAdmin
      .from("org_reporting_managers")
      .select("manager_user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!rm?.manager_user_id) continue;

    // 4. Lock timesheets
    await supabaseAdmin
      .from("timesheet_entries")
      .update({ is_locked: true })
      .eq("user_id", user.id)
      .gte("date", weekStart.toISOString())
      .lte("date", weekEnd.toISOString());

    // 5. Create approval record
    await supabaseAdmin
      .from("timesheet_approvals")
      .upsert({
        user_id: user.id,
        manager_user_id: rm.manager_user_id,
        week_start: weekStart.toISOString().slice(0, 10),
        week_end: weekEnd.toISOString().slice(0, 10),
        status: "PENDING",
      }, {
        onConflict: "user_id,week_start",
      });
  }

  return NextResponse.json({ ok: true });
}
