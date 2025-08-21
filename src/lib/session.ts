// src/lib/session.ts
import type { SessionOptions } from "iron-session";

/** What we persist in iron-session */
export type AppSession = {
  // ClickUp OAuth token (either key supported for backward compat)
  access_token?: string;   // preferred
  accessToken?: string;    // legacy

  user?: {
    id: string;
    email: string;
    username?: string;
    profilePicture?: string | null;
    is_admin?: boolean;
  };
};

/** Backwards-compat alias. Some files import `SessionData`. */
export type SessionData = AppSession;

export const sessionOptions: SessionOptions = {
  cookieName: "clickup_timesheet",
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

/** Builds a proper Authorization header from the session token */
export function getAuthHeader(session: AppSession | SessionData): string | null {
  const tok = session.access_token ?? (session as AppSession).accessToken;
  if (!tok) return null;
  return tok.startsWith("Bearer ") ? tok : `Bearer ${tok}`;
}
