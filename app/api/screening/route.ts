import { NextRequest, NextResponse } from "next/server";
import { initDb, ensureUserRows, getUserProfile, getResumes, getScreeningAnswers, saveScreeningAnswers, getResumeFileData } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generateDefaultScreeningAnswers, aiAnswerScreeningQuestions } from "@/lib/screening";
import { scoreResume } from "@/lib/resume-scoring";
import type { ScreeningQuestion } from "@/lib/types";
import { v4 as uuid } from "uuid";

/**
 * GET /api/screening — get saved screening answers + resume scores
 * ?what=answers  → screening answers
 * ?what=score&resumeId=xxx → resume quality score
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);

    const what = req.nextUrl.searchParams.get("what");

    if (what === "score") {
      const resumeId = req.nextUrl.searchParams.get("resumeId");
      if (!resumeId) {
        return NextResponse.json({ success: false, error: "resumeId required" }, { status: 400 });
      }

      const fileData = await getResumeFileData(resumeId, userId);
      if (!fileData) {
        return NextResponse.json({ success: false, error: "Resume file not found" }, { status: 404 });
      }

      // Decode base64 and extract text
      const buffer = Buffer.from(fileData, "base64");
      let text = "";
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        text = parsed.text;
      } catch {
        // Fallback: just decode as string
        text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ");
      }

      const resumes = await getResumes(userId);
      const resume = resumes.find((r) => r.id === resumeId);
      if (!resume) {
        return NextResponse.json({ success: false, error: "Resume not found" }, { status: 404 });
      }

      const score = scoreResume(text, resume);
      return NextResponse.json({ success: true, data: score });
    }

    // Default: return saved screening answers
    const answers = await getScreeningAnswers(userId);
    return NextResponse.json({ success: true, data: { answers } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/screening — manage screening answers
 * { action: "generate-defaults" } — seed from profile
 * { action: "ai-answer", questions: ["..."] } — AI-generate answers for custom questions
 * { action: "save", answers: [...] } — save all answers
 * { action: "add", question: "...", answer: "...", category: "..." } — add one Q&A
 * { action: "delete", id: "..." } — delete one Q&A
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    await ensureUserRows(userId);
    const body = await req.json();

    switch (body.action) {
      case "generate-defaults": {
        const profile = await getUserProfile(userId);
        const defaults = generateDefaultScreeningAnswers(profile);
        const existing = await getScreeningAnswers(userId);
        // Merge: keep existing, add new defaults that don't duplicate questions
        const existingQs = new Set(existing.map((q) => q.question.toLowerCase()));
        const merged = [...existing, ...defaults.filter((d) => !existingQs.has(d.question.toLowerCase()))];
        await saveScreeningAnswers(userId, merged);
        return NextResponse.json({ success: true, data: { answers: merged } });
      }

      case "ai-answer": {
        const { questions } = body as { questions: string[] };
        if (!questions?.length) {
          return NextResponse.json({ success: false, error: "Provide questions array" }, { status: 400 });
        }
        const profile = await getUserProfile(userId);
        const aiAnswers = await aiAnswerScreeningQuestions(questions, profile);
        // Convert to ScreeningQuestion format and merge with existing
        const existing = await getScreeningAnswers(userId);
        const newQs: ScreeningQuestion[] = aiAnswers.map((a) => ({
          id: uuid(),
          question: a.question,
          answer: a.answer,
          category: "general",
        }));
        const merged = [...existing, ...newQs];
        await saveScreeningAnswers(userId, merged);
        return NextResponse.json({ success: true, data: { answers: merged, generated: newQs } });
      }

      case "save": {
        const { answers } = body as { answers: ScreeningQuestion[] };
        if (!Array.isArray(answers)) {
          return NextResponse.json({ success: false, error: "answers must be an array" }, { status: 400 });
        }
        await saveScreeningAnswers(userId, answers);
        return NextResponse.json({ success: true });
      }

      case "add": {
        const { question, answer, category } = body;
        if (!question) {
          return NextResponse.json({ success: false, error: "question required" }, { status: 400 });
        }
        const existing = await getScreeningAnswers(userId);
        const newQ: ScreeningQuestion = {
          id: uuid(),
          question,
          answer: answer ?? "",
          category: category ?? "general",
        };
        const merged = [...existing, newQ];
        await saveScreeningAnswers(userId, merged);
        return NextResponse.json({ success: true, data: { answers: merged, added: newQ } });
      }

      case "delete": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
        }
        const existing = await getScreeningAnswers(userId);
        const filtered = existing.filter((q) => q.id !== id);
        await saveScreeningAnswers(userId, filtered);
        return NextResponse.json({ success: true, data: { answers: filtered } });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
