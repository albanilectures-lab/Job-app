import OpenAI from "openai";
import type { FitAnalysis, Resume, UserProfile, Job } from "./types";

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

/**
 * Analyze a job against the user's profile and resumes.
 * Returns a fit score (0-100), reasoning, matched/missing skills,
 * best resume to use, and a generated cover letter.
 */
export async function analyzeJobFit(
  job: Job,
  profile: UserProfile,
  resumes: Resume[]
): Promise<FitAnalysis> {
  const resumeSummaries = resumes
    .map((r) => `- ${r.label}: skills=[${r.skills.join(", ")}]`)
    .join("\n");

  const prompt = `You are a job matching AI. Analyze how well this job matches the candidate's profile.

## Job Posting
Title: ${job.title}
Company: ${job.company}
Description:
${job.description.slice(0, 3000)}

## Candidate Profile
Name: ${profile.fullName}
Years of Experience: ${profile.yearsExperience}
Skills: ${profile.skills.join(", ")}

## Available Resumes
${resumeSummaries}

## Instructions
1. Score the fit from 0-100 (100 = perfect match).
2. List skills that match and skills that are missing.
3. Choose the best resume ID for this application.
4. If score >= 75, generate a tailored cover letter (3-4 paragraphs, professional, enthusiastic, highlight relevant experience).
5. If score < 75, write a brief note on why it's not a good fit.

Respond in valid JSON only:
{
  "score": <number>,
  "reasoning": "<string>",
  "matchedSkills": ["<skill1>", ...],
  "missingSkills": ["<skill1>", ...],
  "bestResumeId": "<resume id>",
  "coverLetter": "<string>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "grok-4-1-fast",
      messages: [
        { role: "system", content: "You are a precise job matching assistant. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const result = JSON.parse(content) as FitAnalysis;

    // Validate and clamp score
    result.score = Math.max(0, Math.min(100, Math.round(result.score)));

    // If no valid resume suggested, pick the first one
    if (!resumes.find((r) => r.id === result.bestResumeId) && resumes.length > 0) {
      result.bestResumeId = resumes[0].id;
    }

    return result;
  } catch (error) {
    console.error("AI analysis failed:", error);
    // Fallback: keyword matching
    return keywordFallbackAnalysis(job, profile, resumes);
  }
}

/**
 * Simple keyword-based fallback when the AI call fails.
 */
function keywordFallbackAnalysis(
  job: Job,
  profile: UserProfile,
  resumes: Resume[]
): FitAnalysis {
  const descLower = job.description.toLowerCase();
  const matched = profile.skills.filter((s) => descLower.includes(s.toLowerCase()));
  const missing = profile.skills.filter((s) => !descLower.includes(s.toLowerCase()));
  const score = Math.round((matched.length / Math.max(profile.skills.length, 1)) * 100);

  // Pick best resume based on overlap
  let bestResume = resumes[0];
  let bestOverlap = 0;
  for (const resume of resumes) {
    const overlap = resume.skills.filter((s) => descLower.includes(s.toLowerCase())).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestResume = resume;
    }
  }

  return {
    score,
    reasoning: `Keyword match: ${matched.length}/${profile.skills.length} skills found.`,
    matchedSkills: matched,
    missingSkills: missing,
    bestResumeId: bestResume?.id ?? "",
    coverLetter: score >= 75
      ? `Dear Hiring Manager,\n\nI am excited to apply for the ${job.title} position at ${job.company}. With ${profile.yearsExperience} years of experience and skills in ${matched.slice(0, 5).join(", ")}, I am confident I can contribute effectively to your team.\n\nBest regards,\n${profile.fullName}`
      : "Score below threshold — not a strong fit based on keyword analysis.",
  };
}

/**
 * Generate / refine a cover letter for a specific job+resume combo.
 */
export async function generateCoverLetter(
  job: Job,
  profile: UserProfile,
  resume: Resume
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "grok-4-1-fast",
      messages: [
        {
          role: "system",
          content:
            "You write professional, concise cover letters for software engineering roles. Be specific to the job and candidate's experience. 3-4 paragraphs max.",
        },
        {
          role: "user",
          content: `Write a cover letter for this job.

Job: ${job.title} at ${job.company}
Description: ${job.description.slice(0, 2000)}

Candidate: ${profile.fullName}, ${profile.yearsExperience} years experience
Skills: ${resume.skills.join(", ")}
Resume targeting: ${resume.label}

Write a personalized, enthusiastic cover letter. Do not include address headers.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 1200,
    });

    return response.choices[0]?.message?.content ?? "Failed to generate cover letter.";
  } catch (error) {
    console.error("Cover letter generation failed:", error);
    return `Dear Hiring Manager,\n\nI am writing to apply for the ${job.title} position at ${job.company}. With ${profile.yearsExperience} years of professional software engineering experience, I believe I would be a strong addition to your team.\n\nBest regards,\n${profile.fullName}`;
  }
}
