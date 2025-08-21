// src/lib/getSession.ts
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { sessionOptions, type AppSession } from "@/lib/session";

/**
 * Server-side session getter for the App Router.
 * Works both locally and on Vercel.
 */
export async function getSession(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies(); // <-- await fixes the type error
  const session = await getIronSession<AppSession>(cookieStore, sessionOptions);
  return session;
}
