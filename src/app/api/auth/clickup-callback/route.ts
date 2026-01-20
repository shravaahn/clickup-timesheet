// src/app/api/auth/clickup-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import axios from "axios";

// Optional: ClickUp list used as a "user directory" to drive roles.
// Each task in this list represents a person and carries custom fields:
//  - User Type:  admin | manager | consultant
//  - Email:      user’s email address (must match ClickUp account email)
//  - Location:   e.g. US, India
//
// You configure the list + field labels via environment variables:
//  - CLICKUP_USER_LIST_ID              (required to enable this behaviour)
//  - CLICKUP_USER_ROLE_FIELD_NAME      (defaults: "user type", "User Type")
//  - CLICKUP_USER_EMAIL_FIELD_NAME     (defaults: "email", "Email")
//  - CLICKUP_USER_LOCATION_FIELD_NAME  (defaults: "location", "Location")
//
// If the list or matching task is not found, we fall back to treating the
// user as a consultant (is_admin=false) so they still can log in.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectoryInfo = {
  role: string | null;
  location: string | null;
};

function norm(s: string | null | undefined) {
  return String(s || "").trim().toLowerCase();
}

async function lookupUserDirectoryEntry(
  accessToken: string,
  email: string
): Promise<DirectoryInfo | null> {
  const LIST_ID = process.env.CLICKUP_USER_LIST_ID;
  if (!LIST_ID || !email) return null;

  const roleFieldName =
    process.env.CLICKUP_USER_ROLE_FIELD_NAME || "user type";
  const emailFieldName =
    process.env.CLICKUP_USER_EMAIL_FIELD_NAME || "email";
  const locationFieldName =
    process.env.CLICKUP_USER_LOCATION_FIELD_NAME || "location";

  // We only expect a small "directory" list, so a single page is usually
  // enough. If you ever grow beyond that, we can add simple pagination.
  const url = new URL(
    `https://api.clickup.com/api/v2/list/${encodeURIComponent(LIST_ID)}/task`
  );
  url.searchParams.set("include_closed", "true");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "created");

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text for debugging in logs if needed
  }

  if (!r.ok) {
    console.warn(
      "ClickUp user directory fetch failed:",
      r.status,
      json || text || r.statusText
    );
    return null;
  }

  const tasks: any[] = Array.isArray(json?.tasks) ? json.tasks : [];
  const emailLc = norm(email);
  const emailFieldLc = norm(emailFieldName);
  const roleFieldLc = norm(roleFieldName);
  const locationFieldLc = norm(locationFieldName);

  let matched: any | null = null;

  for (const t of tasks) {
    const nameLc = norm(t?.name);

    // 1) Try to match by a dedicated "Email" custom field.
    let cfEmail: string | null = null;
    let cfRole: string | null = null;
    let cfLocation: string | null = null;

    const cfs: any[] = Array.isArray(t?.custom_fields) ? t.custom_fields : [];
    for (const cf of cfs) {
      const cfNameLc = norm(cf?.name);
      const valueRaw = cf?.value;
      const valueStr = valueRaw == null ? "" : String(valueRaw);

      if (cfNameLc === emailFieldLc) {
        cfEmail = norm(valueStr);
      } else if (cfNameLc === roleFieldLc) {
        cfRole = valueStr;
      } else if (cfNameLc === locationFieldLc) {
        cfLocation = valueStr;
      }
    }

    const emailMatchesCustom = cfEmail && cfEmail === emailLc;
    const emailMatchesName = nameLc === emailLc;

    if (emailMatchesCustom || emailMatchesName) {
      matched = { task: t, cfRole, cfLocation };
      break;
    }
  }

  if (!matched) return null;

  const rawRole = matched.cfRole || "";
  const rawLocation = matched.cfLocation || "";

  return {
    role: rawRole || null,
    location: rawLocation || null,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const res = new NextResponse();

  if (!code) {
    // Hitting the route without ?code should still not 404
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url), {
      headers: res.headers,
    });
  }

  try {
    // Exchange authorization code for access token
    const tokenRes = await axios.post("https://api.clickup.com/api/v2/oauth/token", {
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
      redirect_uri: process.env.CLICKUP_REDIRECT_URI,
    });

    const accessToken = tokenRes.data?.access_token as string | undefined;
    if (!accessToken) throw new Error("No access_token returned from ClickUp");

    // Create session and store token + basic user info
    const session = await getIronSession<SessionData>(
      req,
      res,
      sessionOptions
    );
    session.accessToken = accessToken;

    const meRes = await axios.get("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = meRes.data?.user ?? {};

    const emailLc = String(me.email || "").toLowerCase();

    // 🔎 Look up role + location from dedicated ClickUp "user directory" list.
    const directory = await lookupUserDirectoryEntry(accessToken, emailLc);
    const roleRaw = (directory?.role || "").toLowerCase();
    const location = directory?.location || null;

    const isDirectoryAdmin =
      roleRaw === "admin" || roleRaw === "manager";

    // Optional: keep old ADMIN_EMAILS env as a safety net / override.
    const admins = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isEmailAdmin = admins.includes(emailLc);

    const finalIsAdmin = isDirectoryAdmin || isEmailAdmin;
    const finalRole =
      roleRaw || (finalIsAdmin ? "admin" : "consultant");

    session.user = {
      id: String(me.id || ""),
      email: emailLc,
      username: me.username || me.email || "",
      is_admin: finalIsAdmin,
      role: finalRole,
      location: location || undefined,
    };

    await session.save();

    // Important — forward Set-Cookie from iron-session
    return NextResponse.redirect(new URL("/dashboard", req.url), {
      headers: res.headers,
    });
  } catch (err: any) {
    console.error("OAuth callback error:", err?.response?.data || err?.message || err);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url), {
      headers: res.headers,
    });
  }
}
