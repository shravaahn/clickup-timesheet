// src/app/api/admin/create-project/route.ts
// import { NextResponse } from "next/server";
// import { cuCreateTask, getAuthHeader } from "@/lib/clickup";
//
// /** Minimal ClickUp team member type */
// type TeamMember = { id: number; username: string; email: string };
//
// const isNum = (v: string | null) => !!v && /^[0-9]+$/.test(v);
//
// async function fetchTeamMembers(authHeader: string, teamId: string): Promise<TeamMember[]> {
//   if (!teamId) return [];
//   const r = await fetch(`https://api.clickup.com/api/v2/team/${teamId}`, {
//     headers: { Authorization: authHeader, Accept: "application/json" },
//     cache: "no-store",
//   });
//   if (!r.ok) {
//     const t = await r.text().catch(() => "");
//     throw new Error(`Get team failed ${r.status}: ${t}`);
//   }
//   const j = await r.json().catch(() => ({}));
//   const members: any[] = Array.isArray(j?.members) ? j.members : [];
//   return members
//     .map((m: any) => ({
//       id: Number(m?.user?.id),
//       username: String(m?.user?.username ?? ""),
//       email: String(m?.user?.email ?? ""),
//     }))
//     .filter((m: TeamMember) => Number.isFinite(m.id));
// }
//
// export async function POST(req: Request) {
//   try {
//     const Authorization = await getAuthHeader(req);
//     const LIST_ID = process.env.CLICKUP_LIST_ID || "";
//     const TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
//
//     if (!LIST_ID) {
//       return NextResponse.json({ error: "CLICKUP_LIST_ID not set" }, { status: 500 });
//     }
//
//     const { name, code, assigneeId } = await req.json().catch(() => ({} as { name?: string; code?: string; assigneeId?: string }));
//     if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
//
//     // Resolve assignee -> numeric
//     let assignees: number[] | undefined = undefined;
//     if (assigneeId != null && assigneeId !== "") {
//       let numeric: number | undefined = isNum(String(assigneeId)) ? Number(assigneeId) : undefined;
//       if (!numeric && TEAM_ID) {
//         try {
//           const members = await fetchTeamMembers(Authorization, TEAM_ID);
//           const needle = String(assigneeId).toLowerCase();
//           let match = members.find((m) => String(m.email).toLowerCase() === needle);
//           if (!match) match = members.find((m) => String(m.username).toLowerCase() === needle);
//           if (!match) match = members.find((m) => String(m.id) === String(assigneeId));
//           if (match) numeric = match.id;
//         } catch (e) {
//           console.warn("Assignee resolution failed:", e);
//         }
//       }
//       if (Number.isFinite(numeric)) assignees = [Number(numeric)];
//     }
//
//     const body = {
//       name: String(name),
//       tags: code ? [String(code)] : [],
//       assignees,
//     };
//
//     const task = await cuCreateTask(Authorization, LIST_ID, body);
//     return NextResponse.json({ ok: true, task });
//   } catch (err: any) {
//     console.error("/api/admin/create-project POST error:", err);
//     return NextResponse.json(
//       { error: "Create failed", details: err?.message || String(err) },
//       { status: 500 }
//     );
//   }
// }
