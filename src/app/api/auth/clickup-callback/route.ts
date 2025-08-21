// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

const ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const baseRes = new NextResponse();
  const session = await getIronSession<AppSession>(req, baseRes, sessionOptions);

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  try {
    // Exchange code for token
    const tokenResp = await fetch("https://api.clickup.com/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLICKUP_CLIENT_ID || "",
        client_secret: process.env.CLICKUP_CLIENT_SECRET || "",
        code,
      }),
      cache: "no-store",
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      return NextResponse.redirect(
        new URL(`/login?error=oauth&details=${encodeURIComponent(text)}`, req.url)
      );
    }

    const tokenJson = await tokenResp.json();
    const raw = tokenJson?.access_token as string | undefined;
    if (!raw) {
      return NextResponse.redirect(new URL("/login?error=no_token", req.url));
    }

    // Store as "Bearer <token>"
    session.access_token = raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;

    // Fetch user
    const meResp = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: session.access_token },
      cache: "no-store",
    });
    if (!meResp.ok) {
      const t = await meResp.text();
      return NextResponse.redirect(
        new URL(`/login?error=me_fetch&details=${encodeURIComponent(t)}`, req.url)
      );
    }
    const meJson = await meResp.json();
    const u = meJson?.user || meJson;
    const email = String(u?.email || "").toLowerCase();

    session.user = {
      id: String(u?.id),
      email,
      username: u?.username || null,
      profilePicture: u?.profilePicture || null,
      is_admin: ADMINS.includes(email),
    };

    await session.save();

    // IMPORTANT: propagate Set-Cookie headers to the redirect response
    const redirect = NextResponse.redirect(new URL("/dashboard", req.url));
    baseRes.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") redirect.headers.append(k, v);
    });
    return redirect;
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/login?error=exception&details=${encodeURIComponent(e?.message || String(e))}`, req.url)
    );
  }
}
