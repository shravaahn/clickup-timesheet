// src/lib/iam.ts
import { supabaseAdmin } from "@/lib/db";

export async function ensureOwnerByEnv(orgUser: { id: string; email?: string }) {
  const OWNER_EMAIL = process.env.OWNER_EMAIL;
  if (!OWNER_EMAIL || !orgUser.email) return;

  if (orgUser.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) return;

  const { data } = await supabaseAdmin
    .from("org_roles")
    .select("role")
    .eq("user_id", orgUser.id)
    .eq("role", "OWNER")
    .maybeSingle();

  if (!data) {
    await supabaseAdmin.from("org_roles").insert({
      user_id: orgUser.id,
      role: "OWNER",
    });
  }
}
