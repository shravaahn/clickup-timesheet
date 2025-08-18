// src/app/api/tasks/[teamId]/route.ts
import { NextResponse } from "next/server";

/**
 * Deprecated endpoint. The app now uses:
 * - /api/projects/by-user (lists per assignee)
 * - /api/consultants
 * - /api/timesheet
 */
export async function GET(_req: Request) {
  return NextResponse.json(
    { error: "Deprecated: use /api/projects/by-user" },
    { status: 410 }
  );
}
