// src/lib/session.ts
import type { SessionOptions } from "iron-session";

export const sessionOptions: SessionOptions = {
  // must be >= 32 chars; you already set SESSION_SECRET in .env.local
  password: process.env.SESSION_SECRET!,
  cookieName: "clickup_timesheet",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

export type AppSession = {
  access_token?: string;
  user?: {
    id: string;
    email?: string;
    username?: string;
    profilePicture?: string;
    is_admin?: boolean;
  };
} & Record<string, any>;
