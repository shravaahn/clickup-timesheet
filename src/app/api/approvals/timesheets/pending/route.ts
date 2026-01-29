/*src/app/api/approvals/timesheets/pending/route.ts*/
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET /api/approvals/timesheets/pending
 *
 * MANAGER-only
 * Returns all PENDING weekly timesheet approvals
 * scoped to the manager via reporting_manager_id
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  /* -------------------------------------------
     Resolve manager org_user
  -------------------------------------------- */
  const { data: manager } = await supabaseAdmin
    .from("org_users")
    .select("id, name, email")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!manager) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  /* -------------------------------------------
     Fetch pending timesheet approvals
  -------------------------------------------- */
  const { data, error } = await supabaseAdmin
    .from("timesheet_approvals")
    .select(`
      id,
      user_id,
      week_start,
      status,
      created_at,
      org_user:org_users!timesheet_approvals_user_id_fkey (
        id,
        name,
        email
      ),
      weekly_status:weekly_timesheet_status!timesheet_approvals_user_id_week_start_fkey (
        status
      )
    `)
    .eq("manager_user_id", manager.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch approvals", details: error.message },
      { status: 500 }
    );
  }

  /* -------------------------------------------
     Normalize response
  -------------------------------------------- */
  const approvals = (data || []).map(row => {
    const user = Array.isArray(row.org_user)
      ? row.org_user[0]
      : row.org_user;

    const weekly = Array.isArray(row.weekly_status)
      ? row.weekly_status[0]
      : row.weekly_status;

    return {
      approval_id: row.id,
      user_id: row.user_id,
      user_name: user?.name,
      user_email: user?.email,
      week_start: row.week_start,
      weekly_status: weekly?.status || null,
      submitted_at: row.created_at,
    };
  });

  return NextResponse.json({ approvals });
}
