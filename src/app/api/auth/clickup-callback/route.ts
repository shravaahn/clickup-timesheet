// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<AppSession>(req, res, sessionOptions);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?err=missing_code", req.url));
  }

  // Exchange code for token
  const tokenResp = await fetch("https://api.clickup.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
      redirect_uri: process.env.CLICKUP_REDIRECT_URI,
    }),
  });

  if (!tokenResp.ok) {
    const t = await tokenResp.text();
    return NextResponse.redirect(
      new URL(`/login?err=token_${tokenResp.status}`, req.url)
    );
  }

  const tokenJson = await tokenResp.json();
  // ClickUp returns { access_token: "..." }
  const accessToken: string = tokenJson?.access_token || tokenJson?.token || "";

  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?err=no_token", req.url));
  }

  session.access_token = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  // Fetch user to cache in session (and determine admin)
  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: session.access_token },
    cache: "no-store",
  });

  if (meResp.ok) {
    const meJson = await meResp.json();
    const u = meJson?.user || meJson;
    const email = (u?.email || "").toLowerCase();

    session.user = {
      id: String(u?.id),
      email,
      username: u?.username ?? null,
      profilePicture: u?.profilePicture ?? null,
      is_admin: ADMINS.includes(email),
    };
  }

  await session.save();
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
