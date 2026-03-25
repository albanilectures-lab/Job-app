import { NextRequest, NextResponse } from "next/server";
import { initDb, getUserProfile, updateUserProfile, getSearchConfig, updateSearchConfig, getCopilotConfig, updateCopilotConfig, getRecentCopilotRuns, getApplicationLogs, ensureUserRows } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import type { UserProfile, SearchConfig, CopilotConfig } from "@/lib/types";

/**
 * GET /api/settings — get profile + search config + copilot config + recent activity
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);

    const what = req.nextUrl.searchParams.get("what");

    // Lightweight copilot status check
    if (what === "copilot") {
      const [copilotConfig, recentRuns] = await Promise.all([
        getCopilotConfig(userId),
        getRecentCopilotRuns(userId, 5),
      ]);
      return NextResponse.json({ success: true, data: { copilotConfig, recentRuns } });
    }

    // Activity feed
    if (what === "activity") {
      const logs = await getApplicationLogs(userId, 20);
      return NextResponse.json({ success: true, data: { logs } });
    }

    const [profile, searchConfig, copilotConfig] = await Promise.all([
      getUserProfile(userId),
      getSearchConfig(userId),
      getCopilotConfig(userId),
    ]);
    return NextResponse.json({ success: true, data: { profile, searchConfig, copilotConfig } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/settings — save profile, search config, or toggle copilot
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "saveProfile": {
        const profile = body.profile as UserProfile;
        await updateUserProfile(profile, userId);
        return NextResponse.json({ success: true });
      }
      case "saveConfig": {
        const config = body.config as SearchConfig;
        await updateSearchConfig(config, userId);
        return NextResponse.json({ success: true });
      }
      case "toggleCopilot": {
        const existing = await getCopilotConfig(userId);
        await updateCopilotConfig({ ...existing, enabled: !existing.enabled }, userId);
        return NextResponse.json({ success: true, data: { enabled: !existing.enabled } });
      }
      case "saveCopilotConfig": {
        const config = body.copilotConfig as CopilotConfig;
        const existing = await getCopilotConfig(userId);
        await updateCopilotConfig({ ...existing, ...config }, userId);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
