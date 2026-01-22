// src/app/api/auth/clickup-callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import axios from "axios";
import { sessionOptions, type SessionData } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   AUTO-SYNC ALL WORKSPACE USERS
========================================================= */
async function syncWorkspaceUsers(accessToken: string) {
  const TEAM_ID = process.env.CLICKUP_TEAM_ID;
  if (!TEAM_ID) throw new Error("Missing CLICKUP_TEAM_ID");

  const ownerEmail = (process.env.OWNER_EMAIL || "").toLowerCase();

  const res = await fetch(`https://api.clickup.com/api/v2/team/${TEAM_ID}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch team users: ${text}`);
  }

  const json = await res.json();
  const members: any[] = json?.team?.members || [];

  for (const m of members) {
    const u = m?.user;
    if (!u?.id || !u?.email) continue;

    const clickupUserId = String(u.id);
    const email = String(u.email).toLowerCase();
    const name = u.username || email;

    /* -------------------------------
       Ensure org_users row
    -------------------------------- */
    const { data: orgUser } = await supabaseAdmin
      .from("org_users")
      .upsert(
        {
          clickup_user_id: clickupUserId,
          email,
          name,
          is_active: true,
        },
        { onConflict: "clickup_user_id" }
      )
      .select("id")
      .maybeSingle();

    if (!orgUser?.id) continue;

    /* -------------------------------
       Ensure roles (NON-DESTRUCTIVE)
    -------------------------------- */
    const { data: roles } = await supabaseAdmin
      .from("org_roles")
      .select("role")
      .eq("user_id", orgUser.id);

    const hasRoles = (roles || []).length > 0;

    if (!hasRoles) {
      const role =
        ownerEmail && email === ownerEmail ? "OWNER" : "CONSULTANT";

      await supabaseAdmin.from("org_roles").insert({
        user_id: orgUser.id,
        role,
      });
    }
  }
}

/* =========================================================
   OAUTH CALLBACK
========================================================= */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const res = new NextResponse();

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", req.url),
      { headers: res.headers }
    );
  }

  try {
    /* -------------------------------------------
       Exchange OAuth code
    -------------------------------------------- */
    const tokenRes = await axios.post(
      "https://api.clickup.com/api/v2/oauth/token",
      {
        client_id: process.env.CLICKUP_CLIENT_ID,
        client_secret: process.env.CLICKUP_CLIENT_SECRET,
        code,
        redirect_uri: process.env.CLICKUP_REDIRECT_URI,
      }
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) throw new Error("No access token");

    /* -------------------------------------------
       Fetch current user
    -------------------------------------------- */
    const meRes = await axios.get(
      "https://api.clickup.com/api/v2/user",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const me = meRes.data?.user;
    if (!me?.id || !me?.email) {
      throw new Error("Invalid ClickUp user payload");
    }

    /* -------------------------------------------
       AUTO-SYNC WORKSPACE USERS
    -------------------------------------------- */
    await syncWorkspaceUsers(accessToken);

    /* -------------------------------------------
       Create session
    -------------------------------------------- */
    const session = await getIronSession<SessionData>(
      req,
      res,
      sessionOptions
    );

    session.accessToken = accessToken;
    session.user = {
      id: String(me.id),
      email: String(me.email).toLowerCase(),
      username: me.username || me.email,
      is_admin: false, // derived dynamically from roles
    };

    await session.save();

    return NextResponse.redirect(
      new URL("/dashboard", req.url),
      { headers: res.headers }
    );
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url),
      { headers: res.headers }
    );
  }
}
