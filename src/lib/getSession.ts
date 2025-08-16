import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

export async function getSession() {
  const cookieStore = cookies();
  const res = {
    cookies: cookieStore,
  } as any; // iron-session requires a compatible req/res shape
  const req = res;
  return getIronSession<SessionData>(req, res, sessionOptions);
}
