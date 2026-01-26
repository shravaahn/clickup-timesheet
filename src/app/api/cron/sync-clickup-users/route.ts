// src/app/api/cron/sync-clickup-users/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLICKUP_API = "https://api.clickup.com/api/v2";

export async function GET() {
  try {
    const teamId = process.env.CLICKUP_TEAM_ID;
    const token = process.env.CLICKUP_SYNC_TOKEN;
    const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();

    if (!teamId || !token) {
      return NextResponse.json(
        { error: "Missing CLICKUP_TEAM_ID or CLICKUP_SYNC_TOKEN" },
        { status: 500 }
      );
    }

    /* -------------------------------------------
       1) Fetch users from ClickUp workspace
    -------------------------------------------- */
    const res = await fetch(`${CLICKUP_API}/team/${teamId}`, {
      headers: {
        Authorization: token,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to fetch ClickUp team users");
    }

    const json = await res.json();
    const members = json?.team?.members || [];

    const clickupUsers = members.map((m: any) => ({
      clickup_user_id: String(m.user.id),
      email: m.user.email?.toLowerCase() || null,
      name: m.user.username || m.user.email || "Unknown",
      is_active: true,
    }));

    /* -------------------------------------------
       2) Upsert users into org_users
    -------------------------------------------- */
    for (const user of clickupUsers) {
      await supabaseAdmin
        .from("org_users")
        .upsert(
          {
            clickup_user_id: user.clickup_user_id,
            email: user.email,
            name: user.name,
            is_active: true,
          },
          { onConflict: "clickup_user_id" }
        );
    }

    /* -------------------------------------------
       3) Deactivate users missing from ClickUp
    -------------------------------------------- */
    const activeIds = clickupUsers.map(
  (u: { clickup_user_id: string }) => u.clickup_user_id
);


    await supabaseAdmin
      .from("org_users")
      .update({ is_active: false })
      .not("clickup_user_id", "in", `(${activeIds.join(",")})`);

    /* -------------------------------------------
       4) Ensure OWNER role via ENV
    -------------------------------------------- */
    if (ownerEmail) {
      const { data: owner } = await supabaseAdmin
        .from("org_users")
        .select("id")
        .eq("email", ownerEmail)
        .single();

      if (owner) {
        await supabaseAdmin
          .from("org_roles")
          .upsert(
            { user_id: owner.id, role: "OWNER" },
            { onConflict: "user_id,role" }
          );
      }
    }

    return NextResponse.json({
      ok: true,
      synced_users: clickupUsers.length,
    });
  } catch (err: any) {
    console.error("ClickUp sync failed:", err);
    return NextResponse.json(
      { error: "Sync failed", details: err.message },
      { status: 500 }
    );
  }
}
