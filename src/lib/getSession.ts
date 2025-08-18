// src/lib/getSession.ts
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

/**
 * Use this in Server Components / route handlers that only
 * have access to next/headers cookies().
 */
export async function getSession() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  return session;
}

// Re-export the type for convenience (optional)
export type { SessionData };
