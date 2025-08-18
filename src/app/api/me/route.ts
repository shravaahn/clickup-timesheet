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
  const session = (await getIronSession(req, res, sessionOptions)) as unknown as AppSession;

  if (session?.user?.id) {
    return NextResponse.json({ user: session.user });
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const meResp = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: accessToken },
    cache: "no-store",
  });
  if (!meResp.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const meJson = await meResp.json();
  const user = meJson?.user || meJson;
  const email = (user?.email || "").toLowerCase();
  const is_admin = ADMINS.includes(email);

  session.user = {
    id: String(user?.id),
    email,
    username: user?.username,
    profilePicture: user?.profilePicture,
    is_admin,
  };
  await session.save();

  return NextResponse.json({ user: session.user });
}
