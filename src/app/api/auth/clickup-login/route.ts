// src/app/api/auth/clickup-login/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";           // ensure Node runtime
export const dynamic = "force-dynamic";    // no static optimization

export async function GET(req: Request) {
  const base = "https://app.clickup.com/api";
  const clientId = process.env.CLICKUP_CLIENT_ID!;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI!;
  const url = new URL(base);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(url.toString());
}
