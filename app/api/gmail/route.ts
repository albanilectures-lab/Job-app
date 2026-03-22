import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, exchangeCode, isGmailConnected, checkApplicationReplies } from "@/lib/gmail";
import { initDb } from "@/lib/db";

/**
 * GET /api/gmail — check status or get auth URL
 */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const action = req.nextUrl.searchParams.get("action");

    if (action === "authUrl") {
      const url = getAuthUrl();
      return NextResponse.json({ success: true, data: { url } });
    }

    if (action === "replies") {
      const replies = await checkApplicationReplies();
      return NextResponse.json({ success: true, data: replies });
    }

    const connected = isGmailConnected();
    return NextResponse.json({ success: true, data: { connected } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/gmail — exchange OAuth code
 */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ success: false, error: "Authorization code required" }, { status: 400 });
    }

    await exchangeCode(code);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
