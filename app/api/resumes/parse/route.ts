import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import pdf from "pdf-parse";

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

/**
 * OCR fallback for image-based PDFs: renders PDF pages to images, then uses tesseract.js
 */
async function ocrPdf(buffer: Buffer): Promise<string> {
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const canvasModule = require("canvas");
  const { createWorker } = require("tesseract.js");

  class CanvasFactory {
    create(width: number, height: number) {
      const canvas = canvasModule.createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(cc: any, width: number, height: number) {
      cc.canvas.width = width;
      cc.canvas.height = height;
    }
    destroy(cc: any) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
  }

  const data = new Uint8Array(buffer);
  const canvasFactory = new CanvasFactory();
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, canvasFactory }).promise;
  const worker = await createWorker("eng");

  let allText = "";
  const pageCount = Math.min(doc.numPages, 3); // OCR first 3 pages max
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const { canvas, context } = canvasFactory.create(vp.width, vp.height);
    await page.render({ canvasContext: context, viewport: vp, canvasFactory }).promise;
    const png = canvas.toBuffer("image/png");
    const { data: { text } } = await worker.recognize(png);
    allText += text + "\n";
  }
  await worker.terminate();
  return allText.trim();
}

/**
 * POST /api/resumes/parse — extract profile info from a resume PDF
 * Accepts multipart form data with a 'file' field (PDF).
 * Returns extracted profile fields.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buffer);
    let text = parsed.text?.trim();

    // Fallback to OCR for image-based PDFs
    if (!text) {
      console.log("[Resume Parse] No text found, using OCR fallback...");
      text = await ocrPdf(buffer);
    }

    if (!text) {
      return NextResponse.json(
        { success: false, error: "Could not extract text from the PDF (tried text extraction and OCR)." },
        { status: 400 }
      );
    }

    // Use AI to extract structured profile data from resume text
    const prompt = `Extract the following information from this resume text. If a field is not found, use an empty string or 0 for numbers. For skills, list all technical and professional skills mentioned. For yearsExperience, estimate from work history dates.

Resume text:
${text.slice(0, 6000)}

Respond with valid JSON only, no markdown:
{
  "fullName": "<string>",
  "email": "<string>",
  "phone": "<string>",
  "linkedinUrl": "<string>",
  "githubUrl": "<string>",
  "portfolioUrl": "<string>",
  "skills": ["<skill1>", "<skill2>", ...],
  "yearsExperience": <number>
}`;

    const response = await openai.chat.completions.create({
      model: "grok-3-mini-fast",
      messages: [
        {
          role: "system",
          content:
            "You are a precise resume parser. Extract structured data from resume text. Always respond with valid JSON only, no markdown code fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { success: false, error: "AI returned empty response." },
        { status: 500 }
      );
    }

    // Strip markdown fences if present
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const extracted = JSON.parse(cleaned);

    // Sanitize the output
    const profile = {
      fullName: String(extracted.fullName || ""),
      email: String(extracted.email || ""),
      phone: String(extracted.phone || ""),
      linkedinUrl: String(extracted.linkedinUrl || ""),
      githubUrl: String(extracted.githubUrl || ""),
      portfolioUrl: String(extracted.portfolioUrl || ""),
      skills: Array.isArray(extracted.skills)
        ? extracted.skills.map((s: unknown) => String(s)).filter(Boolean)
        : [],
      yearsExperience: Math.max(0, Math.round(Number(extracted.yearsExperience) || 0)),
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error("Resume parse error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to parse resume: " + String(error) },
      { status: 500 }
    );
  }
}
