import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import axios from "axios";
import { sessionOptions, SessionData } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const tokenRes = await axios.post("https://api.clickup.com/api/v2/oauth/token", {
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
    });

    const tokenData = tokenRes.data;

    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    session.accessToken = tokenData.access_token;
    await session.save();

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.response?.data || err.message },
      { status: 500 }
    );
  }
}
