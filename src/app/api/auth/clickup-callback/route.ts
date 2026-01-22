// src/app/api/auth/clickup-callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import axios from "axios";
import { sessionOptions, type SessionData } from "@/lib/session";
import {
  supabaseAdmin,
  ensureOrgUser,
  getUserRoles,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
       1) Exchange OAuth code for access token
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
    if (!accessToken) {
      throw new Error("No access_token returned from ClickUp");
    }

    /* -------------------------------------------
       2) Fetch ClickUp user
    -------------------------------------------- */
    const meRes = await axios.get(
      "https://api.clickup.com/api/v2/user",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const me = meRes.data?.user;
    if (!me?.id || !me?.email) {
      throw new Error("Invalid ClickUp user payload");
    }

    const clickupUserId = String(me.id);
    const email = String(me.email).toLowerCase();
    const name = me.username || email;

    /* -------------------------------------------
       3) Ensure org user exists
    -------------------------------------------- */
    const orgUser = await ensureOrgUser({
      clickupUserId,
      email,
      name,
    });

    /* -------------------------------------------
       4) OWNER bootstrap (ENV-based)
    -------------------------------------------- */
    const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
    const roles = await getUserRoles(orgUser.id);

    if (ownerEmail && email === ownerEmail) {
      if (!roles.includes("OWNER")) {
        await supabaseAdmin.from("org_roles").insert({
          user_id: orgUser.id,
          role: "OWNER",
        });
      }
    } else {
      // Default role: CONSULTANT
      if (roles.length === 0) {
        await supabaseAdmin.from("org_roles").insert({
          user_id: orgUser.id,
          role: "CONSULTANT",
        });
      }
    }

    /* -------------------------------------------
       5) Create session
    -------------------------------------------- */
    const session = await getIronSession<SessionData>(
      req,
      res,
      sessionOptions
    );

    session.accessToken = accessToken;
    session.user = {
      id: clickupUserId,
      email,
      username: name,
      is_admin: false, // resolved dynamically via IAM
    };

    await session.save();

    /* -------------------------------------------
       6) Redirect to dashboard
    -------------------------------------------- */
    return NextResponse.redirect(
      new URL("/dashboard", req.url),
      { headers: res.headers }
    );
  } catch (err: any) {
    console.error(
      "OAuth callback error:",
      err?.response?.data || err?.message || err
    );

    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url),
      { headers: res.headers }
    );
  }
}
