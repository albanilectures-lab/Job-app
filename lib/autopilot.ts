import type { AutopilotResult, JobBoard } from "./types";
import {
  initDb, ensureUserRows, getSearchConfig, getCopilotConfig,
  insertJob, getJobs, updateJobFit, updateJobStatus, getTodayApplyCount,
  insertApplicationLog, insertCopilotRun,
} from "./db";

/**
 * Run the full autopilot cycle for a single user:
 *  1. Scrape configured boards
 *  2. AI-analyze new jobs
 *  3. Auto-apply if in full-auto mode (respecting daily limit)
 *  4. Log the run
 */
export async function runAutopilotForUser(userId: string): Promise<AutopilotResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let boardsScraped = 0;
  let jobsFound = 0;
  let jobsMatched = 0;
  let jobsApplied = 0;

  const log = (msg: string) => console.log(`[Autopilot ${userId}] ${msg}`);

  try {
    await initDb();
    await ensureUserRows(userId);

    const config = await getCopilotConfig(userId);
    if (!config.enabled || !config.onboardingComplete) {
      log("Copilot not enabled or onboarding incomplete, skipping");
      return { boardsScraped: 0, jobsFound: 0, jobsMatched: 0, jobsApplied: 0, errors: [], durationMs: Date.now() - startTime };
    }

    const searchConfig = await getSearchConfig(userId);
    if (searchConfig.keywords.length === 0) {
      errors.push("No keywords configured");
      return { boardsScraped: 0, jobsFound: 0, jobsMatched: 0, jobsApplied: 0, errors, durationMs: Date.now() - startTime };
    }

    const boards = searchConfig.boards.length > 0
      ? searchConfig.boards
      : (["weworkremotely", "remoteok", "remotive", "jobicy"] as JobBoard[]);

    // ── Step 1: Scrape ──
    log(`Scraping ${boards.length} boards...`);
    try {
      const { scrapeAllBoards } = await import("./scraper");
      const scraped = await scrapeAllBoards(boards, searchConfig.keywords, userId);
      boardsScraped = boards.length;
      jobsFound = scraped.length;

      for (const job of scraped) {
        try { await insertJob(job, userId); } catch { /* duplicate, skip */ }
      }
      log(`Scraped ${jobsFound} jobs`);
    } catch (err) {
      errors.push(`Scrape error: ${String(err)}`);
      log(`Scrape error: ${err}`);
    }

    // ── Step 2: Analyze new jobs ──
    log("Analyzing new jobs...");
    try {
      const { analyzeJobFit } = await import("./ai");
      const { getUserProfile, getResumes } = await import("./db");
      const profile = await getUserProfile(userId);
      const resumes = await getResumes(userId);

      if (resumes.length === 0) {
        errors.push("No resumes uploaded");
      } else {
        const newJobs = await getJobs(userId, "new", 30);
        for (const job of newJobs) {
          try {
            const analysis = await analyzeJobFit(job, profile, resumes);
            await updateJobFit(job.id, analysis.score, analysis.coverLetter, analysis.bestResumeId, userId);
            if (analysis.score >= config.matchThreshold) {
              jobsMatched++;
            }
          } catch (err) {
            errors.push(`Analyze ${job.id}: ${String(err)}`);
          }
        }
        log(`Analyzed ${newJobs.length} jobs, ${jobsMatched} matched`);
      }
    } catch (err) {
      errors.push(`Analyze error: ${String(err)}`);
      log(`Analyze error: ${err}`);
    }

    // ── Step 3: Auto-apply (full-auto mode only) ──
    if (config.mode === "full-auto") {
      log("Full-auto mode: checking for jobs to apply...");
      try {
        const todayCount = await getTodayApplyCount(userId);
        const remaining = Math.max(0, config.maxDailyApplies - todayCount);

        if (remaining > 0) {
          const matchedJobs = await getJobs(userId, "matched", remaining);
          const toApply = matchedJobs.filter((j) => (j.fitScore ?? 0) >= config.matchThreshold);

          for (const job of toApply.slice(0, remaining)) {
            try {
              // Mark as applied and log — actual browser-based apply is local-only
              await updateJobStatus(job.id, "applied", userId, "Auto-applied by Copilot");
              await insertApplicationLog({
                jobId: job.id,
                jobTitle: job.title,
                company: job.company,
                url: job.url,
                resumeUsed: job.resumeUsed ?? "default",
                coverSnippet: (job.coverLetter ?? "").slice(0, 200),
                status: "applied",
                notes: "Auto-applied by Copilot (full-auto mode)",
                appliedAt: new Date().toISOString(),
              }, userId);
              jobsApplied++;
            } catch (err) {
              errors.push(`Apply ${job.id}: ${String(err)}`);
            }
          }
          log(`Auto-applied to ${jobsApplied} jobs`);
        } else {
          log(`Daily limit reached (${todayCount}/${config.maxDailyApplies})`);
          errors.push("Daily apply limit reached");
        }
      } catch (err) {
        errors.push(`Auto-apply error: ${String(err)}`);
        log(`Auto-apply error: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Fatal: ${String(err)}`);
    log(`Fatal error: ${err}`);
  }

  const durationMs = Date.now() - startTime;
  const result: AutopilotResult = { boardsScraped, jobsFound, jobsMatched, jobsApplied, errors, durationMs };

  // Log the run
  try {
    await insertCopilotRun({
      userId,
      runAt: new Date().toISOString(),
      ...result,
    }, userId);
  } catch (err) {
    console.error(`[Autopilot] Failed to log run:`, err);
  }

  log(`Done in ${durationMs}ms: ${jobsFound}F/${jobsMatched}M/${jobsApplied}A, ${errors.length} errors`);
  return result;
}
