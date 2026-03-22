import { NextRequest, NextResponse } from "next/server";
import { initDb, getUserProfile, updateUserProfile, getSearchConfig, updateSearchConfig, ensureUserRows } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import type { UserProfile, SearchConfig } from "@/lib/types";

/**
 * GET /api/settings — get profile + search config
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const profile = await getUserProfile(userId);
    const searchConfig = await getSearchConfig(userId);
    return NextResponse.json({ success: true, data: { profile, searchConfig } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/settings — save profile or search config
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
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
