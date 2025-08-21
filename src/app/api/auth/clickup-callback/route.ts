// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession, getAuthHeader } from "@/lib/session";

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // helper to redirect AND keep Set-Cookie from iron-session
  async function redirectWithSession(
    to: string,
    mutator?: (s: Awaited<ReturnType<typeof getIronSession<AppSession>>>) => Promise<void> | void
  ) {
    const response = NextResponse.redirect(new URL(to, req.url));
    const session = await getIronSession<AppSession>(req, response, sessionOptions);
    if (mutator) await mutator(session);
    await session.save();
    return response;
  }

  if (error) {
    return redirectWithSession(`/login?error=${encodeURIComponent(error)}`, async (s) => {
      // optional: clear any stale data
      s.access_token = undefined;
      s.user = undefined;
    });
  }

  if (!code) {
    return redirectWithSession(`/login?error=${encodeURIComponent("Missing OAuth code")}`);
  }

  try {
    const client_id = process.env.CLICKUP_CLIENT_ID!;
    const client_secret = process.env.CLICKUP_CLIENT_SECRET!;
    // ClickUp does not require redirect_uri in the token POST; if you set it in your app,
    // you can include it here as well:
    // const redirect_uri = process.env.CLICKUP_REDIRECT_URI!;

    // Exchange code for token
    const tokenResp = await fetch("https://api.clickup.com/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
        // redirect_uri, // uncomment if your ClickUp app enforces it
      }),
      cache: "no-store",
    });

    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      return redirectWithSession(
        `/login?error=${encodeURIComponent(`Token exchange failed (${tokenResp.status}) ${t}`)}`
      );
    }

    const tokenJson = await tokenResp.json();
    const access_token: string | undefined =
      tokenJson?.access_token || tokenJson?.token || tokenJson?.accessToken;

    if (!access_token) {
      return redirectWithSession(
        `/login?error=${encodeURIComponent("Token response missing access_token")}`
      );
    }

    // Create the redirect response first, attach session to it, save, and return it
    return redirectWithSession("/dashboard", async (session) => {
      // Save token
      session.access_token = access_token;

      // Fetch current user to stamp is_admin
      const meResp = await fetch("https://api.clickup.com/api/v2/user", {
        headers: { Authorization: getAuthHeader(session)! },
        cache: "no-store",
      });
      if (meResp.ok) {
        const meJson = await meResp.json();
        const user = meJson?.user || meJson;
        const email = String(user?.email || "").toLowerCase();

        session.user = {
          id: String(user?.id),
          email,
          username: user?.username,
          profilePicture: user?.profilePicture ?? null,
          is_admin: ADMINS.includes(email),
        };
      } else {
        // If this fails, keep token so /api/me can populate later
        session.user = undefined;
      }
    });
  } catch (e: any) {
    return redirectWithSession(`/login?error=${encodeURIComponent(e?.message || "Unknown error")}`);
  }
}
