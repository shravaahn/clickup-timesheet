// src/lib/session.ts
import type { SessionOptions } from "iron-session";

export type AppUser = {
  id: string;
  email: string;
  username?: string | null;
  profilePicture?: string | null;
  is_admin?: boolean;
};

export type AppSession = {
  access_token?: string; // raw token from ClickUp OAuth
  user?: AppUser;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "clickup_timesheet",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

export function getAuthHeader(session: AppSession): string | undefined {
  if (!session?.access_token) return undefined;
  // ClickUp expects "Bearer <token>"
  return session.access_token.startsWith("Bearer ")
    ? session.access_token
    : `Bearer ${session.access_token}`;
}
