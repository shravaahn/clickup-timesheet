// src/app/api/me/route.ts
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

  // If we already cached user, return it
  if (session?.user?.id) {
    return NextResponse.json({ user: session.user }, { headers: res.headers });
  }

  // Need token to fetch user
  const auth = session?.access_token;
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch user from ClickUp and cache
  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: auth },
    cache: "no-store",
  });
  if (!meResp.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const meJson = await meResp.json();
  const u = meJson?.user || meJson;
  const email = String(u?.email || "").toLowerCase();

  session.user = {
    id: String(u?.id),
    email,
    username: u?.username || null,
    profilePicture: u?.profilePicture || null,
    is_admin: ADMINS.includes(email),
  };
  await session.save();

  return NextResponse.json({ user: session.user }, { headers: res.headers });
}
