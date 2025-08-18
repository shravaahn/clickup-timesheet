// src/app/api/members/[teamId]/route.ts
import { NextResponse } from "next/server";

/**
 * Legacy endpoint. We now use /api/consultants instead.
 * Kept to satisfy Next build; returns 410 Gone.
 */
export async function GET(_req: Request) {
  return NextResponse.json(
    { error: "Deprecated: use /api/consultants" },
    { status: 410 }
  );
}
