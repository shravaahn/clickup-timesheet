// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";

/**
 * Table shape (from your SQL):
 * timesheet_entries: id (uuid), user_id (text), task_id (text), task_name (text),
 * date (date), estimate_hours (numeric), estimate_locked (bool),
 * tracked_hours (numeric), tracked_note (text), created_at, updated_at
 *
 * We will upsert by (user_id, task_id, date).
 */

// ---------- utils ----------
function bearer(v: string) {
  return v.startsWith("Bearer ") ? v : `Bearer ${v}`;
}

async function getAuthHeader(req: NextRequest, res: NextResponse): Promise<string | null> {
  // prefer per-user OAuth session
  const session: any = await getIronSession(req, res, sessionOptions);
  const sess = session?.access_token || session?.accessToken;
  if (sess) return bearer(String(sess));

  // fallback to env personal token if present
  const envToken = process.env.CLICKUP_API_TOKEN || "";
  if (envToken) return bearer(envToken);

  return null;
}

// Normalize yyyy-mm-dd -> epoch ms (noon UTC to avoid DST weirdness)
function middayUtcMs(yyyy_mm_dd: string): number {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m - 1), d, 12, 0, 0, 0));
  return dt.getTime();
}

function hoursToMs(h: number) {
  return Math.max(0, Math.round(h * 60 * 60 * 1000));
}

// ---------- ClickUp sync ----------
async function syncEstimateToClickUp(authHeader: string, taskId: string, hours: number) {
  // ClickUp: Update Task — set time_estimate in milliseconds
  const body = { time_estimate: hoursToMs(hours) };
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "PUT",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp estimate sync failed ${r.status}: ${t}`);
  }
}

async function syncTrackedToClickUp(authHeader: string, taskId: string, dateYmd: string, hours: number, note: string) {
  // ClickUp: Create Time Entry for a Task
  // API: POST /api/v2/task/{task_id}/time
  // fields: start (epoch ms), duration (ms), description, billable?
  const body = {
    start: middayUtcMs(dateYmd),
    duration: hoursToMs(hours),
    description: note || "Timesheet entry",
    // billable: true, // uncomment if your workspace uses billable flag
    created_with: "Timesheet App",
  };
  const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ClickUp tracked sync failed ${r.status}: ${t}`);
  }
}

// ---------- GET: read week for a user ----------
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId");
  const start = sp.get("start");
  const end = sp.get("end");

  if (!userId || !start || !end) {
    return NextResponse.json({ error: "Missing userId/start/end" }, { status: 400 });
  }

  // Read entries for range
  const { data, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*")
    .eq("user_id", String(userId))
    .gte("date", start)
    .lte("date", end);

  if (error) {
    console.error("Supabase GET error:", error);
    return NextResponse.json({ error: "DB read failed", details: error.message }, { status: 500 });
  }

  // Map to what dashboard expects
  const entries = (data || []).map((row: any) => ({
    user_id: String(row.user_id),
    task_id: String(row.task_id),
    task_name: String(row.task_name || row.task_id),
    date: row.date, // yyyy-mm-dd
    estimate_hours: row.estimate_hours == null ? null : Number(row.estimate_hours),
    estimate_locked: !!row.estimate_locked,
    tracked_hours: row.tracked_hours == null ? null : Number(row.tracked_hours),
    tracked_note: row.tracked_note || null,
  }));

  return NextResponse.json({ entries });
}

// ---------- POST: upsert + optional ClickUp sync ----------
/**
 * Body:
 * {
 *   type: "estimate" | "tracked",
 *   userId: string,
 *   taskId: string,
 *   taskName: string,
 *   date: "YYYY-MM-DD",
 *   hours: number,
 *   note?: string,
 *   syncToClickUp?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const {
      type, userId, taskId, taskName, date, hours, note, syncToClickUp,
    } = body as {
      type: "estimate" | "tracked";
      userId: string;
      taskId: string;
      taskName?: string;
      date: string;
      hours: number;
      note?: string;
      syncToClickUp?: boolean;
    };

    if (!type || !userId || !taskId || !date || !(Number.isFinite(hours) && hours >= 0)) {
      return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
    }

    // Find existing row for (user, task, date)
    const { data: existingRows, error: findErr } = await supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", String(userId))
      .eq("task_id", String(taskId))
      .eq("date", String(date))
      .limit(1);

    if (findErr) {
      console.error("Supabase find error:", findErr);
      return NextResponse.json({ error: "DB read failed", details: findErr.message }, { status: 500 });
    }

    const existing = existingRows?.[0];

    // Compose update payload
    const now = new Date().toISOString();
    let patch: any = {
      user_id: String(userId),
      task_id: String(taskId),
      task_name: String(taskName || taskId),
      date: String(date),
      updated_at: now,
    };

    if (type === "estimate") {
      patch.estimate_hours = Number(hours);
      patch.estimate_locked = true;
    } else if (type === "tracked") {
      patch.tracked_hours = Number(hours);
      patch.tracked_note = note ? String(note) : null;
    }

    // Upsert behavior
    let writeErr: any = null;
    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("timesheet_entries")
        .update(patch)
        .eq("id", existing.id);
      writeErr = updErr;
    } else {
      patch.created_at = now;
      const { error: insErr } = await supabaseAdmin
        .from("timesheet_entries")
        .insert(patch);
      writeErr = insErr;
    }

    if (writeErr) {
      console.error("Supabase write error:", writeErr);
      return NextResponse.json({ error: "DB write failed", details: writeErr.message }, { status: 500 });
    }

    // Optional: sync to ClickUp
    if (syncToClickUp) {
      const authHeader = await getAuthHeader(req, res);
      if (!authHeader) {
        // Don’t fail the whole request; just report sync failure back
        return NextResponse.json({
          ok: true,
          synced: false,
          warning: "Missing ClickUp auth (session/env). Saved to DB only.",
        });
      }
      try {
        if (type === "estimate") {
          await syncEstimateToClickUp(authHeader, String(taskId), Number(hours));
        } else if (type === "tracked") {
          await syncTrackedToClickUp(authHeader, String(taskId), String(date), Number(hours), String(note || ""));
        }
      } catch (e: any) {
        // Again: keep DB as source of truth; surface ClickUp error for visibility
        return NextResponse.json({
          ok: true,
          synced: false,
          warning: e?.message || String(e),
        });
      }
    }

    return NextResponse.json({ ok: true, synced: !!syncToClickUp });
  } catch (err: any) {
    console.error("/api/timesheet POST error:", err);
    return NextResponse.json({ error: "Timesheet save failed", details: err?.message || String(err) }, { status: 500 });
  }
}
