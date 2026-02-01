import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { supabaseAdmin } from "@/lib/db";
import { ensureOwnerByEnv } from "@/lib/iam";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session: any = await getIronSession(req, res, sessionOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { userId, country } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (country && !["US", "INDIA"].includes(country)) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  // Resolve viewer
  const { data: viewer } = await supabaseAdmin
    .from("org_users")
    .select("id, email")
    .eq("clickup_user_id", String(session.user.id))
    .maybeSingle();

  if (!viewer) {
    return NextResponse.json({ error: "Not provisioned" }, { status: 403 });
  }

  await ensureOwnerByEnv(viewer);

  // OWNER check
  const { data: roles } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", viewer.id);

  const isOwner = (roles || []).some(r => r.role === "OWNER");
  if (!isOwner) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  await supabaseAdmin
    .from("org_users")
    .update({ country })
    .eq("id", userId)
    .throwOnError();

  return NextResponse.json({ ok: true });
}
