// src/app/api/debug/view-info/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/** GET /api/debug/view-info?viewId=k6hww-110431
 *  If viewId is omitted, uses CLICKUP_ACTIVE_VIEW_ID from env.
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions as any);
  const token =
    (session as any)?.access_token ||
    (session as any)?.token ||
    (session as any)?.clickup_token;

  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const viewId = new URL(req.url).searchParams.get("viewId") || process.env.CLICKUP_ACTIVE_VIEW_ID || "";
  if (!viewId) return NextResponse.json({ error: "No viewId provided and CLICKUP_ACTIVE_VIEW_ID not set" }, { status: 400 });

  const r = await fetch(`https://api.clickup.com/api/v2/view/${viewId}`, {
    headers: { Authorization: token, "Content-Type": "application/json" },
    cache: "no-store",
  });

  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch {}

  return NextResponse.json({
    ok: r.ok,
    status: r.status,
    viewId,
    body: json ?? txt,
  }, { status: r.status });
}
