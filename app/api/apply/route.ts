import { NextRequest, NextResponse } from "next/server";
import { initDb, getJobById, getUserProfile, getResumes, getResumeFileData, insertApplicationLog, updateJobStatus, getTodayApplyCount, getSearchConfig } from "@/lib/db";
import { requireUserId } from "@/lib/session";

const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;

/**
 * POST /api/apply — trigger Playwright to auto-fill a job application
 * Body: { jobId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    }

    // Check daily limit
    const config = await getSearchConfig(userId);
    const todayCount = await getTodayApplyCount(userId);
    if (todayCount >= config.maxDailyApplies) {
      return NextResponse.json({
        success: false,
        error: `Daily limit of ${config.maxDailyApplies} applications reached.`,
      }, { status: 429 });
    }

    const job = await getJobById(jobId, userId);
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const profile = await getUserProfile(userId);
    if (!profile.fullName || !profile.email) {
      return NextResponse.json({ success: false, error: "Please configure your profile first." }, { status: 400 });
    }

    const resumes = await getResumes(userId);
    const resume = resumes.find((r) => r.id === job.resumeUsed) ?? resumes[0];
    if (!resume) {
      return NextResponse.json({ success: false, error: "No resumes uploaded." }, { status: 400 });
    }

    if (IS_SERVERLESS) {
      return NextResponse.json({ success: false, error: "Auto-apply requires running the app locally (Playwright browser needed)." }, { status: 400 });
    }

    const coverLetter = job.coverLetter ?? "";

    // Write resume to temp file for Playwright (needs a real file path for setInputFiles)
    const fileData = await getResumeFileData(resume.id, userId);
    let tempFilePath = resume.filePath;
    if (fileData) {
      const os = await import("os");
      const path = await import("path");
      const { writeFile, mkdir } = await import("fs/promises");
      const tmpDir = path.join(os.tmpdir(), "jobbot-resumes");
      await mkdir(tmpDir, { recursive: true });
      tempFilePath = path.join(tmpDir, resume.filename);
      await writeFile(tempFilePath, Buffer.from(fileData, "base64"));
    }
    const resumeForPlaywright = { ...resume, filePath: tempFilePath };

    // Launch browser & auto-fill
    const { autoFillApplication } = await import("@/lib/playwright");
    const result = await autoFillApplication(job, profile, resumeForPlaywright, coverLetter);

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
    }, userId);

    await updateJobStatus(job.id, result.success ? "applied" : "failed", userId, result.message);

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
