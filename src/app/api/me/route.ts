import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.accessToken) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  return NextResponse.json({
    loggedIn: true,
    accessToken: session.accessToken,
  });
}
