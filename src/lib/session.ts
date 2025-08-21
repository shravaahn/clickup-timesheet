// src/lib/session.ts
import type { SessionOptions } from "iron-session";

/** What we cache about the logged-in user */
export type AppUser = {
  id: string;
  email: string;
  username?: string | null;
  profilePicture?: string | null;
  is_admin?: boolean;
};

/** Data we store in the session */
export type AppSession = {
  access_token?: string; // we store full "Bearer xxx" here
  user?: AppUser;
};

/** Iron-session config */
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "dev_secret_change_me",
  cookieName: "clickup_timesheet",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

/** Normalize to "Bearer <token>" and return header string or null */
export function getAuthHeader(
  s: { access_token?: string } | null | undefined
): string | null {
  const t = s?.access_token;
  if (!t) return null;
  return t.startsWith("Bearer ") ? t : `Bearer ${t}`;
}
