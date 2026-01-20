// src/lib/session.ts
import type { SessionOptions } from "iron-session";

export type SessionData = {
  // OAuth bearer token for ClickUp
  accessToken?: string | null;

  // Convenience: who’s logged in + role
  user?: {
    id: string;
    email: string;
    username?: string;
    is_admin?: boolean;
    /**
     * Normalized semantic role coming from the ClickUp "user directory" list.
     * Right now we expect values like: "admin" | "manager" | "consultant".
     */
    role?: string;
    /**
     * Optional location pulled from the same ClickUp list, e.g. "US", "India".
     */
    location?: string;
  } | null;

  // Optional: selected team/workspace id
  teamId?: string | null;
};

export const sessionOptions: SessionOptions = {
  cookieName: "timesheet_session",
  password: process.env.SESSION_SECRET ?? "",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

// Small helper if you need it elsewhere
export function hasToken(s: SessionData): s is SessionData & { accessToken: string } {
  return typeof s.accessToken === "string" && s.accessToken.length > 0;
}
