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
    // 1. Exchange token
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

    // 2. Fetch ClickUp user
    const meRes = await axios.get(
      "https://api.clickup.com/api/v2/user",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const me = meRes.data?.user;
    if (!me?.id || !me?.email) {
      throw new Error("Invalid ClickUp user");
    }

    const clickupUserId = String(me.id);
    const email = String(me.email).toLowerCase();
    const name = me.username || email;

    // 3. Ensure org_users
    const { data: user } = await supabaseAdmin
      .from("org_users")
      .upsert(
        { clickup_user_id: clickupUserId, email, name },
        { onConflict: "clickup_user_id" }
      )
      .select()
      .single();

    // 4. OWNER bootstrap via ENV
    const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
    const role =
      ownerEmail && email === ownerEmail ? "OWNER" : "CONSULTANT";

    // 5. Ensure role
    await supabaseAdmin
      .from("org_roles")
      .upsert(
        { user_id: user.id, role },
        { onConflict: "user_id,role" }
      );

    // 6. Session
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
      is_admin: role === "OWNER",
    };

    await session.save();

    return NextResponse.redirect(
      new URL("/dashboard", req.url),
      { headers: res.headers }
    );
  } catch (err: any) {
    console.error("OAuth error:", err);
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url),
      { headers: res.headers }
    );
  }
}
