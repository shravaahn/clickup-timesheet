// src/lib/getSession.ts
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

/**
 * Server-side session getter for App Router (no req/res).
 * Works with Next 15 where cookies() is async.
 */
export async function getSession() {
  const cookieStore = await cookies(); // <-- await is required on Next 15
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  return session;
}

// optional re-export
export type { SessionData };
