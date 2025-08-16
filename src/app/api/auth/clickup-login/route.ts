/*import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI;

  // ClickUp OAuth consent screen URL
  const authUrl = `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${redirectUri}`;

  return NextResponse.redirect(authUrl);
}
*/

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI; // e.g. "http://localhost:3000/api/auth/clickup-callback"
  
  const scope = [
    "task:read",
    "user:read",
    "time_tracking:read"
  ].join(",");

  const clickupAuthUrl = `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

  return NextResponse.redirect(clickupAuthUrl);
}
