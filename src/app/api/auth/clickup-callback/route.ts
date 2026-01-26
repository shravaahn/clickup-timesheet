// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import axios from "axios";
import { sessionOptions, type SessionData } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

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
       3) Ensure org_user exists
    -------------------------------------------- */
    const { data: existingUser } = await supabaseAdmin
      .from("org_users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    let orgUserId: string;

    if (existingUser) {
      orgUserId = existingUser.id;
    } else {
      const { data: createdUser, error } = await supabaseAdmin
        .from("org_users")
        .insert({
          clickup_user_id: clickupUserId,
          email,
          name,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !createdUser) {
        throw new Error("Failed to create org_user");
      }

      orgUserId = createdUser.id;
    }

    /* -------------------------------------------
       4) OWNER BOOTSTRAP (ENV-BASED)
    -------------------------------------------- */
    const ownerEmail = String(process.env.OWNER_EMAIL || "").toLowerCase();

    if (ownerEmail && email === ownerEmail) {
      const { data: ownerRole } = await supabaseAdmin
        .from("org_roles")
        .select("id")
        .eq("user_id", orgUserId)
        .eq("role", "OWNER")
        .maybeSingle();

      if (!ownerRole) {
        await supabaseAdmin.from("org_roles").insert({
          user_id: orgUserId,
          role: "OWNER",
        });
      }
    }

    /* -------------------------------------------
       5) Ensure CONSULTANT role exists (default)
    -------------------------------------------- */
    const { data: consultantRole } = await supabaseAdmin
      .from("org_roles")
      .select("id")
      .eq("user_id", orgUserId)
      .eq("role", "CONSULTANT")
      .maybeSingle();

    if (!consultantRole) {
      await supabaseAdmin.from("org_roles").insert({
        user_id: orgUserId,
        role: "CONSULTANT",
      });
    }

    /* -------------------------------------------
       6) Create session
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
      is_admin: false, // UI derives permissions from IAM APIs
    };

    await session.save();

    /* -------------------------------------------
       7) Redirect
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
