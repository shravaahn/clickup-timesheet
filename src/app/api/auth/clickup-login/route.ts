// src/app/api/auth/clickup-login/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.CLICKUP_CLIENT_ID!;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI!;
  const url = `https://app.clickup.com/api?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return NextResponse.redirect(url);
}
