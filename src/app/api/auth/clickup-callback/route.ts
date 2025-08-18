// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/events/login?error=oauth", req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/events/login?error=code", req.url));
  }

  const client_id = process.env.CLICKUP_CLIENT_ID!;
  const client_secret = process.env.CLICKUP_CLIENT_SECRET!;

  // Exchange code -> access_token
  const tokenResp = await fetch("https://api.clickup.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret, code }),
    cache: "no-store",
  });

  if (!tokenResp.ok) {
    const txt = await tokenResp.text();
    return NextResponse.redirect(
      new URL(`/events/login?error=token&details=${encodeURIComponent(txt)}`, req.url)
    );
  }

  const tokenJson = await tokenResp.json();
  const access_token: string | undefined = tokenJson?.access_token;
  if (!access_token) {
    return NextResponse.redirect(new URL("/events/login?error=no_token", req.url));
  }

  // Fetch current ClickUp user
  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: access_token },
    cache: "no-store",
  });
  if (!meResp.ok) {
    return NextResponse.redirect(new URL("/events/login?error=me", req.url));
  }
  const meJson = await meResp.json();
  const user = meJson?.user || meJson;
  const email = (user?.email || "").toLowerCase();
  const is_admin = ADMINS.includes(email);

  // Create response and attach iron-session
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  const session = (await getIronSession(req, res, sessionOptions)) as unknown as AppSession;

  session.access_token = access_token;
  session.user = {
    id: String(user?.id),
    email,
    username: user?.username,
    profilePicture: user?.profilePicture,
    is_admin,
  };

  await session.save();
  return res;
}
