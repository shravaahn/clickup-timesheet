// src/app/api/leave/balances/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import {
  supabaseAdmin,
  getOrgUserByClickUpId,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session: any = await getIronSession(req, res, sessionOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgUser = await getOrgUserByClickUpId(String(session.user.id));
    if (!orgUser) {
      return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
    }

    if (!orgUser.country) {
      return NextResponse.json(
        { error: "Country not set. Contact admin." },
        { status: 409 }
      );
    }

    const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();

    const { data, error } = await supabaseAdmin
      .from("leave_balances")
      .select(`
        id,
        leave_type_id,
        year,
        accrued_hours,
        used_hours,
        balance_hours
      `)
      .eq("user_id", orgUser.id)
      .eq("year", year);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch balances", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      year,
      balances: (data || []).map(b => ({
        leave_type_id: b.leave_type_id,
        accrued_hours: b.accrued_hours,
        used_hours: b.used_hours,
        balance_hours: b.balance_hours,
      })),
    });
  } catch (err: any) {
    console.error("leave balances error:", err);
    return NextResponse.json(
      { error: "Failed", details: String(err) },
      { status: 500 }
    );
  }
}
