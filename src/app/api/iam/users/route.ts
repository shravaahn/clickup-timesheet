// src/app/api/iam/users/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET /api/iam/users
 *
 * OWNER-only endpoint.
 * Returns all users with their roles, team, and manager information.
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  /* -------------------------------------------
     Resolve viewer org_user
  -------------------------------------------- */
  const { data: viewer, error: viewerErr } = await supabaseAdmin
    .from("org_users")
    .select("id, email")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (viewerErr || !viewer) {
    return NextResponse.json(
      { error: "User not provisioned" },
      { status: 403 }
    );
  }

  /* -------------------------------------------
     Self-healing OWNER bootstrap
  -------------------------------------------- */
  const OWNER_EMAIL = process.env.OWNER_EMAIL;
  
  if (OWNER_EMAIL && viewer.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
    // Check if viewer already has OWNER role
    const { data: existingOwnerRole } = await supabaseAdmin
      .from("org_roles")
      .select("role")
      .eq("user_id", viewer.id)
      .eq("role", "OWNER")
      .maybeSingle();

    // If no OWNER role exists, insert it
    if (!existingOwnerRole) {
      const { error: insertError } = await supabaseAdmin
        .from("org_roles")
        .insert({
          user_id: viewer.id,
          role: "OWNER",
        });

      if (insertError) {
        console.error(`[OWNER Bootstrap] Failed to add OWNER role:`, insertError);
      } else {
        console.log(`[OWNER Bootstrap] Added OWNER role to ${viewer.email}`);
      }
    }
  }

  /* -------------------------------------------
     Check OWNER role explicitly
  -------------------------------------------- */
  const { data: viewerRoles } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", viewer.id);

  const isOwner = (viewerRoles || []).some(r => r.role === "OWNER");

  if (!isOwner) {
    return NextResponse.json(
      { error: "Owner access required" },
      { status: 403 }
    );
  }

  /* -------------------------------------------
     Fetch all users with team and manager info
  -------------------------------------------- */
  // 1. Fetch users
  const { data: users, error } = await supabaseAdmin
    .from("org_users")
    .select(`
      id,
      clickup_user_id,
      email,
      name,
      country,
      is_active,
      created_at,
      team_id
    `)
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch users", details: error.message },
      { status: 500 }
    );
  }

  // 2. Fetch teams + managers
  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select(`
      id,
      name,
      manager_user_id
    `);

  const managerIds = Array.from(
    new Set((teams || []).map(t => t.manager_user_id).filter(Boolean))
  );

  const { data: managers } = managerIds.length
    ? await supabaseAdmin
        .from("org_users")
        .select("id, name, email")
        .in("id", managerIds)
    : { data: [] };

  const teamsById = Object.fromEntries((teams || []).map(t => [t.id, t]));
  const managersById = Object.fromEntries((managers || []).map(m => [m.id, m]));

  /* -------------------------------------------
     Fetch roles for all users
  -------------------------------------------- */
  const userIds = (users || []).map(u => u.id);

  const { data: roleRows } = await supabaseAdmin
    .from("org_roles")
    .select("user_id, role")
    .in("user_id", userIds);

  const rolesByUser: Record<string, string[]> = {};

  for (const r of roleRows || []) {
    if (!rolesByUser[r.user_id]) {
      rolesByUser[r.user_id] = [];
    }
    rolesByUser[r.user_id].push(r.role);
  }

  /* -------------------------------------------
     Final response with team and manager data
  -------------------------------------------- */
  return NextResponse.json({
    users: (users || []).map(u => {
      const team = u.team_id ? teamsById[u.team_id] : null;
      const manager = team?.manager_user_id
        ? managersById[team.manager_user_id]
        : null;

      return {
        id: u.id,
        clickup_user_id: u.clickup_user_id,
        email: u.email,
        name: u.name,
        country: u.country,
        is_active: u.is_active,
        created_at: u.created_at,
        roles: rolesByUser[u.id] || [],
        team_id: u.team_id,
        team_name: team?.name || null,
        manager_id: manager?.id || null,
        manager_name: manager?.name || null,
        manager_email: manager?.email || null,
      };
    }),
  });
}