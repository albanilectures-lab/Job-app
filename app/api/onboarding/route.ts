import { NextRequest, NextResponse } from "next/server";
import { initDb, getUserProfile, updateUserProfile, getSearchConfig, updateSearchConfig, getCopilotConfig, updateCopilotConfig, getResumes, ensureUserRows } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import type { UserProfile, SearchConfig, CopilotConfig } from "@/lib/types";

/**
 * GET /api/onboarding — load all onboarding data (profile, search config, copilot config, resumes)
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const [profile, searchConfig, copilotConfig, resumes] = await Promise.all([
      getUserProfile(userId),
      getSearchConfig(userId),
      getCopilotConfig(userId),
      getResumes(userId),
    ]);
    return NextResponse.json({ success: true, data: { profile, searchConfig, copilotConfig, resumes } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/onboarding — save onboarding step data
 * Body: { step: 1|2|3|4, profile?, searchConfig?, copilotConfig? }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const body = await req.json();
    const { step } = body;

    switch (step) {
      case 1: {
        // Search preferences: keywords, boards, remote
        const config = body.searchConfig as SearchConfig;
        const copilot = body.copilotConfig as Partial<CopilotConfig>;
        await updateSearchConfig(config, userId);
        if (copilot) {
          const existing = await getCopilotConfig(userId);
          await updateCopilotConfig({
            ...existing,
            remoteOnly: copilot.remoteOnly ?? existing.remoteOnly,
            jobTypes: copilot.jobTypes ?? existing.jobTypes,
          }, userId);
        }
        return NextResponse.json({ success: true });
      }
      case 2: {
        // Filters: match threshold, seniority, timezones
        const copilot = body.copilotConfig as Partial<CopilotConfig>;
        const existing = await getCopilotConfig(userId);
        await updateCopilotConfig({
          ...existing,
          matchThreshold: copilot.matchThreshold ?? existing.matchThreshold,
          seniorityLevels: copilot.seniorityLevels ?? existing.seniorityLevels,
          timezones: copilot.timezones ?? existing.timezones,
        }, userId);
        return NextResponse.json({ success: true });
      }
      case 3: {
        // Profile info
        const profile = body.profile as UserProfile;
        await updateUserProfile(profile, userId);
        return NextResponse.json({ success: true });
      }
      case 4: {
        // Final: copilot mode, mark onboarding complete
        const copilot = body.copilotConfig as Partial<CopilotConfig>;
        const existing = await getCopilotConfig(userId);
        await updateCopilotConfig({
          ...existing,
          mode: copilot.mode ?? existing.mode,
          coverLetterMode: copilot.coverLetterMode ?? existing.coverLetterMode,
          maxDailyApplies: copilot.maxDailyApplies ?? existing.maxDailyApplies,
          enabled: true,
          onboardingComplete: true,
        }, userId);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, error: "Invalid step" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
