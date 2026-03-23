import { NextRequest, NextResponse } from "next/server";
import { initDb, getSearchConfig, insertJob, getJobs, updateJobStatus, updateJobFit, getJobById, getUserProfile, getResumes, getTodayApplyCount, ensureUserRows } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import type { JobStatus, JobBoard } from "@/lib/types";

/**
 * GET /api/jobs — list jobs, optional ?status=matched
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();

    // Return status counts for stats bar
    const wantCounts = req.nextUrl.searchParams.get("counts");
    if (wantCounts) {
      const jobs = await getJobs(userId, undefined, 10000);
      const counts = {
        total: jobs.length,
        matched: jobs.filter((j) => j.status === "matched").length,
        applied: jobs.filter((j) => j.status === "applied").length,
        skipped: jobs.filter((j) => j.status === "skipped").length,
        failed: jobs.filter((j) => j.status === "failed").length,
      };
      return NextResponse.json({ success: true, counts });
    }

    const status = req.nextUrl.searchParams.get("status") as JobStatus | null;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10);
    const jobs = await getJobs(userId, status ?? undefined, limit);
    return NextResponse.json({ success: true, data: jobs });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/jobs — trigger a scrape + AI analysis
 * Body: { action: "scrape" | "analyze" | "updateStatus", ... }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[Jobs API ${Date.now() - startTime}ms] ${msg}`);
  try {
    log("POST start");
    const userId = await requireUserId();
    log("auth done");
    await initDb();
    log("db init done");
    const body = await req.json();
    const { action } = body;
    log(`action=${action}`);

    switch (action) {
      case "scrape": {
        const config = await getSearchConfig(userId);
        log(`config: ${config.keywords.length} keywords, ${config.boards.length} boards`);
        if (config.keywords.length === 0) {
          return NextResponse.json({ success: false, error: "No search keywords configured. Go to Settings to add keywords." }, { status: 400 });
        }
        const boards = config.boards.length > 0 ? config.boards : (["weworkremotely", "remoteok"] as JobBoard[]);
        log(`scraping boards: ${boards.join(", ")}`);
        try {
          const { scrapeAllBoards } = await import("@/lib/scraper");
          log("scraper imported");
          const jobs = await scrapeAllBoards(boards, config.keywords, userId);
          log(`scraped ${jobs.length} jobs`);

          // Insert new jobs into DB
          let inserted = 0;
          for (const job of jobs) {
            try {
              await insertJob(job, userId);
              inserted++;
            } catch {
              // Duplicate URL, skip
            }
          }
          log(`inserted ${inserted} jobs`);

          return NextResponse.json({ success: true, data: { scraped: jobs.length, inserted } });
        } catch (scrapeErr) {
          log(`scrape error: ${scrapeErr}`);
          return NextResponse.json({ success: false, error: `Scrape failed: ${String(scrapeErr)}` }, { status: 500 });
        }
      }

      case "analyze": {
        const profile = await getUserProfile(userId);
        const resumes = await getResumes(userId);
        if (resumes.length === 0) {
          return NextResponse.json({ success: false, error: "Upload at least one resume first." }, { status: 400 });
        }

        const newJobs = await getJobs(userId, "new", 50);
        const results = [];

        const { analyzeJobFit } = await import("@/lib/ai");

        for (const job of newJobs) {
          try {
            const analysis = await analyzeJobFit(job, profile, resumes);
            await updateJobFit(job.id, analysis.score, analysis.coverLetter, analysis.bestResumeId, userId);
            results.push({ id: job.id, score: analysis.score });
          } catch (error) {
            console.error(`Analysis failed for job ${job.id}:`, error);
          }
        }

        return NextResponse.json({ success: true, data: { analyzed: results.length, results } });
      }

      case "updateStatus": {
        const { jobId, status, notes } = body as { jobId: string; status: JobStatus; notes?: string };
        if (!jobId || !status) {
          return NextResponse.json({ success: false, error: "jobId and status required" }, { status: 400 });
        }

        // Check daily limit
        if (status === "applied") {
          const config = await getSearchConfig(userId);
          const todayCount = await getTodayApplyCount(userId);
          if (todayCount >= config.maxDailyApplies) {
            return NextResponse.json({
              success: false,
              error: `Daily application limit reached (${config.maxDailyApplies}). Try again tomorrow.`,
            }, { status: 429 });
          }
        }

        await updateJobStatus(jobId, status, userId, notes);
        return NextResponse.json({ success: true });
      }

      case "scout": {
        const profile = await getUserProfile(userId);
        if (!profile.skills?.length) {
          return NextResponse.json({ success: false, error: "Set up your profile with skills first (Settings)." }, { status: 400 });
        }
        const { aiScoutSearch } = await import("@/lib/ai");
        const result = await aiScoutSearch(profile);
        return NextResponse.json({ success: true, data: result });
      }

      case "analyzeDescription": {
        const { jobDescription, jobTitle, company } = body;
        if (!jobDescription) {
          return NextResponse.json({ success: false, error: "Paste a job description to analyze." }, { status: 400 });
        }
        const profile = await getUserProfile(userId);
        const resumes = await getResumes(userId);
        const { aiAnalyzeJobDescription } = await import("@/lib/ai");
        const result = await aiAnalyzeJobDescription(
          jobDescription,
          jobTitle || "Unknown Position",
          company || "Unknown Company",
          profile,
          resumes
        );
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
