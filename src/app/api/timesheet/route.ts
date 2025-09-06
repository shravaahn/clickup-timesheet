// src/app/api/timesheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  getAuthHeader,
  cuCreateManualTimeEntry,
  cuUpdateTimeEstimate,
} from "@/lib/clickup";

/* ---------- utils ---------- */

const HOUR = 60 * 60 * 1000;

function toMiddayMs(dateYmd: string) {
  // Use local 12:00 so ClickUp doesn't reject 0/NaN
  const [y, m, d] = dateYmd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  return dt.getTime();
}

function asNumber(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function isYmd(v: any) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Try to resolve a ClickUp member id from our app user id by looking at session info if present.
 *  If you pass numeric already, we use it directly. Otherwise we try team lookup (email/username).
 */
async function resolveAssigneeNumeric({
  req,
  res,
  fallbackUserId,
}: {
  req: NextRequest;
  res: NextResponse;
  fallbackUserId: string;
}): Promise<number | undefined> {
  const numericMaybe = Number(fallbackUserId);
  if (Number.isFinite(numericMaybe)) return numericMaybe;

  // Try team members only if we have TEAM_ID
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
  if (!TEAM_ID) return undefined;

  try {
    const authHeader = await getAuthHeader(req, res);
    const r = await fetch(`https://api.clickup.com/api/v2/team/${TEAM_ID}`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    const members = Array.isArray(j?.members) ? j.members : [];
    // figure out who `fallbackUserId` is in your app's /api/me:
    const session: any = await getIronSession(req, res, sessionOptions);
    const email = String(session?.user?.email || "");
    const username = String(session?.user?.username || "");
    const needle = (email || username || fallbackUserId).toLowerCase();

    const hit =
      members.find((m: any) => String(m?.user?.email || "").toLowerCase() === needle) ||
      members.find((m: any) => String(m?.user?.username || "").toLowerCase() === needle) ||
      members.find((m: any) => String(m?.user?.id || "") === fallbackUserId);

    if (hit?.user?.id) return Number(hit.user.id);
  } catch {
    // ignore — we can still create time without assignee (ClickUp will attribute to creator)
  }
  return undefined;
}

/* ---------- GET ---------- */
/** Return all entries for a user between start/end (inclusive) */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  try {
    const sp = req.nextUrl.searchParams;
    const userId = String(sp.get("userId") || "");
    const start = String(sp.get("start") || "");
    const end = String(sp.get("end") || "");

    if (!userId || !isYmd(start) || !isYmd(end)) {
      return NextResponse.json(
        { error: "Missing or invalid userId/start/end" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("timesheet_entries")
      .select(
        "id,user_id,task_id,task_name,date,estimate_hours,estimate_locked,tracked_hours,tracked_note,created_at,updated_at"
      )
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "DB read failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ entries: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Fetch failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/* ---------- POST ---------- */
/** Body:
 *  {
 *    type: "estimate" | "tracked",
 *    userId, taskId, taskName, date(YYYY-MM-DD),
 *    hours: number,
 *    note?: string,
 *    syncToClickUp?: boolean
 *  }
 */
export async function POST(req: NextRequest) {
  const res = new NextResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || "");
    const userId = String(body?.userId || "");
    const taskId = String(body?.taskId || "");
    const taskName = String(body?.taskName || taskId);
    const date = String(body?.date || "");
    const hours = asNumber(body?.hours);
    const note = body?.note ? String(body.note) : null;
    const syncToClickUp = !!body?.syncToClickUp;

    if (!userId || !taskId || !isYmd(date) || !hours || hours <= 0) {
      return NextResponse.json(
        { error: "Missing/invalid fields (userId, taskId, date, hours>0 required)" },
        { status: 400 }
      );
    }
    if (type !== "estimate" && type !== "tracked") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Upsert row for (user_id, task_id, date)
    // If you have a UNIQUE(user_id,task_id,date) constraint this will be atomic.
    // If not, we manually find+update/insert.
    const { data: existingRows, error: selErr } = await supabaseAdmin
      .from("timesheet_entries")
      .select("id,estimate_hours,estimate_locked,tracked_hours,tracked_note")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .eq("date", date)
      .limit(1);

    if (selErr) {
      return NextResponse.json(
        { error: "DB read failed", details: selErr.message },
        { status: 500 }
      );
    }

    const patch: any =
      type === "estimate"
        ? { estimate_hours: hours, estimate_locked: true }
        : { tracked_hours: hours, tracked_note: note }
        ;

    let rowId: string | null = null;

    if (existingRows && existingRows.length > 0) {
      rowId = String(existingRows[0].id);
      const { error: updErr } = await supabaseAdmin
        .from("timesheet_entries")
        .update({ ...patch, task_name: taskName })
        .eq("id", rowId);
      if (updErr) {
        return NextResponse.json(
          { error: "DB update failed", details: updErr.message },
          { status: 500 }
        );
      }
    } else {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("timesheet_entries")
        .insert([
          {
            user_id: userId,
            task_id: taskId,
            task_name: taskName,
            date,
            ...patch,
          },
        ])
        .select("id")
        .limit(1);

      if (insErr) {
        return NextResponse.json(
          { error: "DB insert failed", details: insErr.message },
          { status: 500 }
        );
      }
      rowId = ins?.[0]?.id ? String(ins[0].id) : null;
    }

    /* ---------- ClickUp sync ---------- */
    if (syncToClickUp) {
      const authHeader = await getAuthHeader(req, res);

      if (type === "estimate") {
        // Sum ALL estimate_hours for this (user, task) to compute task-level estimate
        const { data: allRows, error: sumErr } = await supabaseAdmin
          .from("timesheet_entries")
          .select("estimate_hours")
          .eq("user_id", userId)
          .eq("task_id", taskId);

        if (sumErr) {
          return NextResponse.json(
            { error: "Failed", details: `Estimate total read failed — ${sumErr.message}` },
            { status: 500 }
          );
        }
        const totalHours = (allRows || []).reduce(
          (acc, r: any) => acc + (Number(r.estimate_hours) || 0),
          0
        );
        const totalMs = Math.max(0, Math.floor(totalHours * HOUR));

        try {
          await cuUpdateTimeEstimate(authHeader, taskId, totalMs);
        } catch (e: any) {
          return NextResponse.json(
            { error: "Failed", details: `Estimate update failed — ${e?.message || e}` },
            { status: 400 }
          );
        }
      }

      if (type === "tracked") {
        // Create a manual time entry on the task
        const startMs = toMiddayMs(date);
        const timeMs = Math.max(1, Math.floor(hours * HOUR));

        // Try to resolve ClickUp assignee (so the entry shows under the right user)
        const assignee = await resolveAssigneeNumeric({ req, res, fallbackUserId: userId }).catch(
          () => undefined
        );

        try {
          await cuCreateManualTimeEntry({
            authHeader,
            taskId,
            startMs,
            timeMs,
            description: note || undefined,
            assignee,
          });
        } catch (e: any) {
          return NextResponse.json(
            { error: "Failed", details: `ClickUp tracked sync failed — ${e?.message || e}` },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, id: rowId });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
