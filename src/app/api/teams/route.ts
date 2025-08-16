

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import axios from "axios";

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.accessToken) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  try {
    const teamsRes = await axios.get("https://api.clickup.com/api/v2/team", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    return NextResponse.json(teamsRes.data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.response?.data || error.message },
      { status: 500 }
    );
  }
}



/*console.log("Calling ClickUp:", `https://api.clickup.com/api/v2/team/${params.teamId}/member`);

const membersRes = await axios.get(
  `https://api.clickup.com/api/v2/team/${params.teamId}/member`,
  {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  }
);
*/