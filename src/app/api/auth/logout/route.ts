import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = new NextResponse(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
  const session = await getIronSession(req, res, sessionOptions);
  await session.destroy();
  return res;
}
