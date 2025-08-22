// src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.access_token && !session?.accessToken) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Shape expected by your dashboard
  return NextResponse.json({
    user: session.user ?? null,
  });
}
