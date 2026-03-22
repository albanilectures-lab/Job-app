import { NextRequest, NextResponse } from "next/server";
import { initDb, insertResume, getResumes, deleteResume, getResumeFileData } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { MAX_RESUMES } from "@/lib/constants";

/**
 * GET /api/resumes — list all uploaded resumes
 * If ?id=xxx&file=1 is provided, return the raw PDF binary for that resume.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();

    const id = req.nextUrl.searchParams.get("id");
    const file = req.nextUrl.searchParams.get("file");

    // Serve raw PDF from DB
    if (id && file) {
      const fileData = await getResumeFileData(id, userId);
      if (!fileData) {
        return NextResponse.json({ success: false, error: "File not found" }, { status: 404 });
      }
      const buffer = Buffer.from(fileData, "base64");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline",
        },
      });
    }

    const resumes = await getResumes(userId);
    return NextResponse.json({ success: true, data: resumes });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/resumes — upload a resume PDF
 * Expects multipart form data with 'file' and 'label' fields.
 * Stores file content as base64 in the database (serverless-compatible).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    const existing = await getResumes(userId);
    if (existing.length >= MAX_RESUMES) {
      return NextResponse.json(
        { success: false, error: `Max ${MAX_RESUMES} resumes. Delete one first.` },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const label = (formData.get("label") as string) ?? "general";
    const skillsRaw = (formData.get("skills") as string) ?? "";

    if (!file || !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    const filename = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileData = buffer.toString("base64");

    // Parse skills from label or explicit skills field
    const skills = skillsRaw
      ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : label.split(/[_,\s]+/).filter(Boolean);

    const resume = await insertResume({
      filename,
      label,
      filePath: "",
      skills,
      uploadedAt: new Date().toISOString(),
    }, userId, fileData);

    return NextResponse.json({ success: true, data: resume });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/resumes — delete a resume by ID
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await initDb();
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "Resume ID required" }, { status: 400 });
    }

    await deleteResume(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
