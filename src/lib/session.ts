import { SessionOptions } from "iron-session";

export interface SessionData {
  accessToken?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "clickup_timesheet_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};
