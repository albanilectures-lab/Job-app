import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";
import { initDb } from "@/lib/db";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/gmail/callback — Google OAuth2 redirect handler
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/settings?gmail=error", req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/settings?gmail=nocode", req.url));
    }

    await exchangeCode(code, userId);
    return NextResponse.redirect(new URL("/settings?gmail=connected", req.url));
  } catch (err) {
    console.error("Gmail callback error:", err);
    return NextResponse.redirect(new URL("/settings?gmail=error", req.url));
  }
}
