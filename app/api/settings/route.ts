import { NextRequest, NextResponse } from "next/server";
import { initDb, getUserProfile, updateUserProfile, getSearchConfig, updateSearchConfig } from "@/lib/db";
import type { UserProfile, SearchConfig } from "@/lib/types";

/**
 * GET /api/settings — get profile + search config
 */
export async function GET() {
  try {
    await initDb();
    const profile = getUserProfile();
    const searchConfig = getSearchConfig();
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
    await initDb();
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "saveProfile": {
        const profile = body.profile as UserProfile;
        updateUserProfile(profile);
        return NextResponse.json({ success: true });
      }
      case "saveConfig": {
        const config = body.config as SearchConfig;
        updateSearchConfig(config);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
