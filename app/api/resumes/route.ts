import { NextRequest, NextResponse } from "next/server";
import { initDb, insertResume, getResumes, deleteResume } from "@/lib/db";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { MAX_RESUMES } from "@/lib/constants";

const UPLOAD_DIR = path.join(process.cwd(), "public", "resumes");

/**
 * GET /api/resumes — list all uploaded resumes
 */
export async function GET() {
  try {
    await initDb();
    const resumes = await getResumes();
    return NextResponse.json({ success: true, data: resumes });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/resumes — upload a resume PDF
 * Expects multipart form data with 'file' and 'label' fields.
 */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const existing = await getResumes();
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

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Save the file
    const filename = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Parse skills from label or explicit skills field
    const skills = skillsRaw
      ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : label.split(/[_,\s]+/).filter(Boolean);

    const resume = await insertResume({
      filename,
      label,
      filePath,
      skills,
      uploadedAt: new Date().toISOString(),
    });

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
    await initDb();
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "Resume ID required" }, { status: 400 });
    }

    const resumes = await getResumes();
    const resume = resumes.find((r) => r.id === id);
    if (resume) {
      try {
        await unlink(resume.filePath);
      } catch {
        // File may already be deleted
      }
    }

    await deleteResume(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
