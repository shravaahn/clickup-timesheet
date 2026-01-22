// src/app/api/iam/users/role/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * TEMPORARY STUB
 *
 * IAM role assignment is under construction.
 * This endpoint is disabled to unblock builds.
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "IAM not enabled yet",
      message: "User role assignment is temporarily disabled",
    },
    { status: 501 }
  );
}
