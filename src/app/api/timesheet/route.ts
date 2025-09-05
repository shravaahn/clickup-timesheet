// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Expects POST JSON like:
 * {
 *   type: "estimate" | "tracked",
 *   userId: string,
 *   taskId: string,
 *   taskName?: string,
 *   date: "YYYY-MM-DD",
 *   hours: number,
 *   note?: string,         // for tracked
 *   syncToClickUp?: boolean
 * }
 *
 * You likely already persist to your DB here (omitted).
 * Below we only show ClickUp sync for clarity.
 */

function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}
async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string> {
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));

  const envToken = process.env.CLICKUP_API_TOKEN;
  if (!envToken) throw new Error("Missing session access_token and CLICKUP_API_TOKEN");
  return bearer(envToken);
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const authHeader = await getAuthHeader(req, res);

    const body = await req.json().catch(() => ({}));
    const { type, taskId, hours, note, syncToClickUp } = body || {};
    if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    if (!type || (type !== "estimate" && type !== "tracked")) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
    }

    // ---- Your internal persistence would go here (DB writes) ----

    // ---- ClickUp sync (optional) ----
    if (syncToClickUp) {
      if (type === "estimate") {
        // PUT /task/{task_id} with { time_estimate: ms }
        const ms = Math.round(hoursNum * 60 * 60 * 1000);
        const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
          method: "PUT",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ time_estimate: ms }),
          cache: "no-store",
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          return NextResponse.json({ error: "ClickUp estimate sync failed", details: text }, { status: 502 });
        }
      } else if (type === "tracked") {
        // POST /task/{task_id}/time with a new time entry
        // documentation: duration in ms, start is epoch ms; description is note
        const ms = Math.round(hoursNum * 60 * 60 * 1000);
        const now = Date.now();

        const payload: any = {
          start: now,
          duration: ms,
          description: note ? String(note) : undefined,
          billable: true, // change if you don’t want it billable by default
        };

        const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          return NextResponse.json({ error: "ClickUp time entry sync failed", details: text }, { status: 502 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("/api/timesheet POST error:", err);
    return NextResponse.json({ error: "Timesheet save failed", details: err?.message || String(err) }, { status: 500 });
  }
}
