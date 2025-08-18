// src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  // If we've already cached the user in the session, return it.
  if (session.user?.id) {
    return new NextResponse(JSON.stringify({ user: session.user }), {
      headers: res.headers, // forward Set-Cookie if any
    });
  }

  // Otherwise, we need a valid token to fetch from ClickUp.
  const token = session.accessToken;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const meResp = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!meResp.ok) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const meJson = await meResp.json();
    const userRaw = meJson?.user ?? meJson;
    const email = String(userRaw?.email || "").toLowerCase();
    const is_admin = ADMINS.includes(email);

    const user = {
      id: String(userRaw?.id || ""),
      email,
      username: userRaw?.username || userRaw?.email || "",
      is_admin,
    };

    // Cache minimal user info in session
    session.user = user;
    await session.save();

    return new NextResponse(JSON.stringify({ user }), {
      headers: res.headers, // forward Set-Cookie
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
