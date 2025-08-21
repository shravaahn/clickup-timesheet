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

  // If we've already cached the user in session, return it
  if (session.user?.id) {
    return NextResponse.json({ user: session.user });
  }

  // Otherwise we need an access token to fetch user info
  const accessToken = session.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch user from ClickUp
  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: accessToken },
    cache: "no-store",
  });

  if (!meResp.ok) {
    const txt = await meResp.text().catch(() => "");
    return NextResponse.json(
      { error: "ClickUp /user failed", details: txt || meResp.statusText },
      { status: 401 }
    );
  }

  const meJson = await meResp.json();
  const u = meJson?.user || meJson;
  const email = String(u?.email || "").toLowerCase();

  session.user = {
    id: String(u?.id),
    email,
    username: u?.username ?? null,
    profilePicture: u?.profilePicture ?? null,
    is_admin: ADMINS.includes(email),
  };

  await session.save();

  return NextResponse.json({ user: session.user });
}
