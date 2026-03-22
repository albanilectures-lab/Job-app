import { NextRequest, NextResponse } from "next/server";
import { initDb, getJobById, getUserProfile, getResumes, insertApplicationLog, updateJobStatus, getTodayApplyCount, getSearchConfig } from "@/lib/db";
import { autoFillApplication, closeBrowser } from "@/lib/playwright";

/**
 * POST /api/apply — trigger Playwright to auto-fill a job application
 * Body: { jobId: string }
 */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    }

    // Check daily limit
    const config = getSearchConfig();
    const todayCount = getTodayApplyCount();
    if (todayCount >= config.maxDailyApplies) {
      return NextResponse.json({
        success: false,
        error: `Daily limit of ${config.maxDailyApplies} applications reached.`,
      }, { status: 429 });
    }

    const job = getJobById(jobId);
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const profile = getUserProfile();
    if (!profile.fullName || !profile.email) {
      return NextResponse.json({ success: false, error: "Please configure your profile first." }, { status: 400 });
    }

    const resumes = getResumes();
    const resume = resumes.find((r) => r.id === job.resumeUsed) ?? resumes[0];
    if (!resume) {
      return NextResponse.json({ success: false, error: "No resumes uploaded." }, { status: 400 });
    }

    const coverLetter = job.coverLetter ?? "";

    // Launch browser & auto-fill
    const result = await autoFillApplication(job, profile, resume, coverLetter);

    // Log the application attempt
    insertApplicationLog({
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      url: job.url,
      resumeUsed: resume.label,
      coverSnippet: coverLetter.slice(0, 200),
      status: result.success ? "applied" : "failed",
      notes: result.message,
      appliedAt: new Date().toISOString(),
    });

    updateJobStatus(job.id, result.success ? "applied" : "failed", result.message);

    return NextResponse.json({
      success: true,
      data: {
        message: result.message,
        applied: result.success,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/apply — close the browser
 */
export async function DELETE() {
  try {
    await closeBrowser();
    return NextResponse.json({ success: true, data: { message: "Browser closed." } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
