// src/app/api/auth/clickup-login/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Starts the OAuth flow by redirecting to ClickUp
// Docs: https://clickup.com/api (authorize URL expects response_type=code)
export async function GET() {
  const clientId = process.env.CLICKUP_CLIENT_ID!;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI!;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing CLICKUP_CLIENT_ID or CLICKUP_REDIRECT_URI" },
      { status: 500 }
    );
  }

  const auth = new URL("https://app.clickup.com/api");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code"); // <-- required

  return NextResponse.redirect(auth.toString());
}
