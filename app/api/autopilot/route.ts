import { NextRequest, NextResponse } from "next/server";
import { initDb, ensureUserRows, getAutopilotUsers } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { runAutopilotForUser } from "@/lib/autopilot";

/**
 * POST /api/autopilot — trigger autopilot for the current user
 * Body: { action: "run" }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const body = await req.json();

    if (body.action === "run") {
      const result = await runAutopilotForUser(userId);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/autopilot — health check / status for scheduled triggers
 * Also supports ?scheduled=true for the Netlify scheduled function to call
 */
export async function GET(req: NextRequest) {
  try {
    const scheduled = req.nextUrl.searchParams.get("scheduled");
    if (scheduled === "true") {
      // Scheduled run: process all enabled users
      await initDb();
      const users = await getAutopilotUsers();
      const results = [];
      for (const userId of users) {
        try {
          const result = await runAutopilotForUser(userId);
          results.push({ userId, ...result });
        } catch (err) {
          results.push({ userId, error: String(err) });
        }
      }
      return NextResponse.json({ success: true, data: { usersProcessed: users.length, results } });
    }

    return NextResponse.json({ success: true, data: { status: "ready" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
