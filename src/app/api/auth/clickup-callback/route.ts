// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import axios from "axios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const res = new NextResponse();

  if (!code) {
    // Hitting the route without ?code should still not 404
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url), {
      headers: res.headers,
    });
  }

  try {
    // Exchange authorization code for access token
    const tokenRes = await axios.post("https://api.clickup.com/api/v2/oauth/token", {
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
      redirect_uri: process.env.CLICKUP_REDIRECT_URI,
    });

    const accessToken = tokenRes.data?.access_token as string | undefined;
    if (!accessToken) throw new Error("No access_token returned from ClickUp");

    // Create session and store token + basic user info
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    session.accessToken = accessToken;

    const meRes = await axios.get("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = meRes.data?.user ?? {};
    const admins = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    session.user = {
      id: String(me.id || ""),
      email: String(me.email || "").toLowerCase(),
      username: me.username || me.email || "",
      is_admin: admins.includes(String(me.email || "").toLowerCase()),
    };

    await session.save();

    // Important — forward Set-Cookie from iron-session
    return NextResponse.redirect(new URL("/dashboard", req.url), {
      headers: res.headers,
    });
  } catch (err: any) {
    console.error("OAuth callback error:", err?.response?.data || err?.message || err);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url), {
      headers: res.headers,
    });
  }
}
