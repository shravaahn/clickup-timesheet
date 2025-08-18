// src/app/api/debug/find-list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * GET /api/debug/find-list?name=Active%20Projects
 * - If ?name is provided: returns lists whose name contains that text (case-insensitive).
 * - If ?name is omitted: returns ALL lists the token can see (quick inventory).
 * Requires: valid ClickUp OAuth token in session.
 */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions as any);
  const token =
    (session as any)?.access_token ||
    (session as any)?.token ||
    (session as any)?.clickup_token;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const nameQ = (url.searchParams.get("name") || "").trim().toLowerCase();

  // 1) Get authorized teams (workspaces)
  const teamsResp = await fetch("https://api.clickup.com/api/v2/team", {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!teamsResp.ok) {
    const txt = await teamsResp.text();
    return NextResponse.json({ error: "ClickUp /team failed", details: txt }, { status: teamsResp.status });
  }
  const teamsJson = await teamsResp.json();
  const teams = teamsJson?.teams || [];

  // 2) For each team, list spaces -> folders -> lists, and also lists directly under space
  const out: any[] = [];
  for (const team of teams) {
    const teamId = String(team?.id);
    const teamName = String(team?.name || "");

    // spaces
    const spacesResp = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!spacesResp.ok) continue;
    const spacesJson = await spacesResp.json();
    const spaces = spacesJson?.spaces || [];

    for (const space of spaces) {
      const spaceId = String(space?.id);
      const spaceName = String(space?.name || "");

      // lists directly under space
      try {
        const sListsResp = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list?archived=false`, {
          headers: { Authorization: token },
          cache: "no-store",
        });
        if (sListsResp.ok) {
          const sListsJson = await sListsResp.json();
          const sLists = sListsJson?.lists || [];
          for (const lst of sLists) {
            const rec = {
              teamId, teamName,
              spaceId, spaceName,
              folderId: null as string | null,
              folderName: null as string | null,
              listId: String(lst?.id),
              listName: String(lst?.name || ""),
            };
            if (!nameQ || rec.listName.toLowerCase().includes(nameQ)) out.push(rec);
          }
        }
      } catch {}

      // folders -> lists
      try {
        const foldersResp = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
          headers: { Authorization: token },
          cache: "no-store",
        });
        if (foldersResp.ok) {
          const foldersJson = await foldersResp.json();
          const folders = foldersJson?.folders || [];
          for (const folder of folders) {
            const folderId = String(folder?.id);
            const folderName = String(folder?.name || "");
            // lists in folder
            const fListsResp = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
              headers: { Authorization: token },
              cache: "no-store",
            });
            if (!fListsResp.ok) continue;
            const fListsJson = await fListsResp.json();
            const fLists = fListsJson?.lists || [];
            for (const lst of fLists) {
              const rec = {
                teamId, teamName,
                spaceId, spaceName,
                folderId, folderName,
                listId: String(lst?.id),
                listName: String(lst?.name || ""),
              };
              if (!nameQ || rec.listName.toLowerCase().includes(nameQ)) out.push(rec);
            }
          }
        }
      } catch {}
    }
  }

  // Sort for nicer display
  out.sort((a, b) => a.listName.localeCompare(b.listName));

  return NextResponse.json({
    query: nameQ || "(all)",
    count: out.length,
    lists: out,
  });
}
