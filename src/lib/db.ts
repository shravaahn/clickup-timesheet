// src/lib/db.ts

import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Supabase admin client
========================================================= */
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
}

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

/* =========================================================
   ORG USERS
========================================================= */
export async function getOrgUserByClickUpId(clickupUserId: string) {
  const { data } = await supabaseAdmin
    .from("org_users")
    .select("*")
    .eq("clickup_user_id", clickupUserId)
    .maybeSingle();

  return data ?? null;
}

export async function ensureOrgUser(params: {
  clickupUserId: string;
  email: string;
  name: string;
}) {
  const existing = await getOrgUserByClickUpId(params.clickupUserId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("org_users")
    .insert({
      clickup_user_id: params.clickupUserId,
      email: params.email,
      name: params.name,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* =========================================================
   ROLES
========================================================= */
export async function getUserRoles(orgUserId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", orgUserId);

  return (data || []).map(r => r.role);
}

/* =========================================================
   REPORTING / MANAGERS
========================================================= */
export async function getDirectReports(managerOrgUserId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_reporting")
    .select("user_id")
    .eq("manager_id", managerOrgUserId);

  return (data || []).map(r => r.user_id);
}

export async function getManagerForUser(orgUserId: string) {
  const { data } = await supabaseAdmin
    .from("org_reporting")
    .select("manager_id")
    .eq("user_id", orgUserId)
    .maybeSingle();

  return data?.manager_id ?? null;
}

export async function getTeamForUser(orgUserId: string) {
  const { data } = await supabaseAdmin
    .from("org_teams_users")
    .select("team_id")
    .eq("user_id", orgUserId)
    .maybeSingle();

  return data?.team_id ?? null;
}

/* =========================================================
   WEEKLY TIMESHEETS (LOCK / APPROVAL)
========================================================= */
export async function ensureWeeklyTimesheetRow(
  orgUserId: string,
  weekStart: string
) {
  const { data: existing } = await supabaseAdmin
    .from("weekly_timesheets")
    .select("*")
    .eq("user_id", orgUserId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("weekly_timesheets")
    .insert({
      user_id: orgUserId,
      week_start: weekStart,
      status: "OPEN",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWeeklyTimesheetStatus(
  orgUserId: string,
  weekStart: string
): Promise<"OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED"> {
  const { data } = await supabaseAdmin
    .from("weekly_timesheets")
    .select("status")
    .eq("user_id", orgUserId)
    .eq("week_start", weekStart)
    .maybeSingle();

  return (data?.status as any) ?? "OPEN";
}
