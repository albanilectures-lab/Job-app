import { NextRequest, NextResponse } from "next/server";
import { initDb, getJobById, getUserProfile, getResumes, insertApplicationLog, updateJobStatus, getTodayApplyCount, getSearchConfig } from "@/lib/db";

const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;

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
    const config = await getSearchConfig();
    const todayCount = await getTodayApplyCount();
    if (todayCount >= config.maxDailyApplies) {
      return NextResponse.json({
        success: false,
        error: `Daily limit of ${config.maxDailyApplies} applications reached.`,
      }, { status: 429 });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const profile = await getUserProfile();
    if (!profile.fullName || !profile.email) {
      return NextResponse.json({ success: false, error: "Please configure your profile first." }, { status: 400 });
    }

    const resumes = await getResumes();
    const resume = resumes.find((r) => r.id === job.resumeUsed) ?? resumes[0];
    if (!resume) {
      return NextResponse.json({ success: false, error: "No resumes uploaded." }, { status: 400 });
    }

    if (IS_SERVERLESS) {
      return NextResponse.json({ success: false, error: "Auto-apply requires running the app locally (Playwright browser needed)." }, { status: 400 });
    }

    const coverLetter = job.coverLetter ?? "";

    // Launch browser & auto-fill
    const { autoFillApplication } = await import("@/lib/playwright");
    const result = await autoFillApplication(job, profile, resume, coverLetter);

    // Log the application attempt
    await insertApplicationLog({
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

    await updateJobStatus(job.id, result.success ? "applied" : "failed", result.message);

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
    if (IS_SERVERLESS) {
      return NextResponse.json({ success: true, data: { message: "No browser to close in serverless." } });
    }
    const { closeBrowser } = await import("@/lib/playwright");
    await closeBrowser();
    return NextResponse.json({ success: true, data: { message: "Browser closed." } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
