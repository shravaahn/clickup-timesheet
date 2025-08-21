// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

/** Admins are decided by email */
const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  // ✅ IMPORTANT: type the generic so we get IronSession<AppSession> (has .save())
  const session = await getIronSession<AppSession>(req, res, sessionOptions);

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
    }
    if (!code) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Missing OAuth code")}`, req.url));
    }

    const client_id = process.env.CLICKUP_CLIENT_ID!;
    const client_secret = process.env.CLICKUP_CLIENT_SECRET!;

    // Exchange code for token
    const tokenResp = await fetch("https://api.clickup.com/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id, client_secret, code }),
      cache: "no-store",
    });

    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(`Token exchange failed (${tokenResp.status}) ${t}`)}`, req.url)
      );
    }

    const tokenJson = await tokenResp.json();
    const access_token: string | undefined =
      tokenJson?.access_token || tokenJson?.token || tokenJson?.accessToken;

    if (!access_token) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("Token response missing access_token")}`, req.url)
      );
    }

    // Persist token and fetch current user
    session.access_token = access_token;
    await session.save();

    const meResp = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: getAuthHeader(session)! },
      cache: "no-store",
    });

    if (!meResp.ok) {
      const t = await meResp.text();
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(`Failed to load user (${meResp.status}) ${t}`)}`, req.url)
      );
    }

    const meJson = await meResp.json();
    const user = meJson?.user || meJson;
    const email = String(user?.email || "").toLowerCase();

    session.user = {
      id: String(user?.id),
      email,
      username: user?.username,
      profilePicture: user?.profilePicture ?? null,
      is_admin: ADMINS.includes(email),
    };
    await session.save();

    // Done — go to dashboard
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(e?.message || "Unknown error")}`, req.url)
    );
  }
}
