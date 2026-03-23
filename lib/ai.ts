import OpenAI from "openai";
import type { FitAnalysis, Resume, UserProfile, Job } from "./types";

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

export interface ScoutResult {
  searchLinks: { site: string; url: string; description: string }[];
  tips: string[];
}

export interface AnalyzeResult {
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  requirements: string[];
  coverLetter: string;
  summary: string;
}

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

/**
 * AI Scout — generate tailored search links for major job sites.
 */
export async function aiScoutSearch(profile: UserProfile): Promise<ScoutResult> {
  const prompt = `You are a job search assistant. Based on this candidate's profile, generate direct search URLs for major job sites that will show the best matching remote jobs.

## Candidate Profile
Name: ${profile.fullName}
Years of Experience: ${profile.yearsExperience}
Skills: ${profile.skills.join(", ")}
${profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : ""}

## Instructions
Generate search URLs for these job sites, using the candidate's top skills as search terms. Focus on remote/work-from-home positions.

Sites to include: LinkedIn Jobs, Indeed, Glassdoor, Google Jobs, ZipRecruiter, Dice, Built In, SimplyHired, FlexJobs, CareerBuilder

For each site:
1. Create a real, working search URL with proper query parameters encoding the candidate's skills
2. Focus on remote positions
3. Add a brief description of what types of jobs will appear

Also provide 3-4 actionable tips specific to this candidate's profile for improving their job search.

Respond in valid JSON only:
{
  "searchLinks": [
    { "site": "<Site Name>", "url": "<full URL>", "description": "<what jobs to expect>" }
  ],
  "tips": ["<tip1>", "<tip2>", ...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: "You are a job search expert. Always respond with valid JSON. Generate real, working URLs." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as ScoutResult;
  } catch (error) {
    console.error("AI Scout failed:", error);
    // Fallback with generic links
    const q = encodeURIComponent(profile.skills.slice(0, 3).join(" ") + " remote");
    return {
      searchLinks: [
        { site: "LinkedIn Jobs", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&f_WT=2`, description: "Remote jobs matching your skills" },
        { site: "Indeed", url: `https://www.indeed.com/jobs?q=${q}&l=remote`, description: "Remote job listings" },
        { site: "Google Jobs", url: `https://www.google.com/search?q=${q}+jobs`, description: "Aggregated job results" },
        { site: "Glassdoor", url: `https://www.glassdoor.com/Job/remote-${q}-jobs-SRCH_IL.0,6_IS11047_KO7,20.htm`, description: "Remote positions with salary data" },
      ],
      tips: [
        "Tailor your resume for each application — highlight the specific skills mentioned in the job description.",
        "Apply within 48 hours of posting for the best response rate.",
        "Network on LinkedIn by connecting with hiring managers at target companies.",
      ],
    };
  }
}

/**
 * AI Job Analyzer — analyze a pasted job description against the user's profile.
 */
export async function aiAnalyzeJobDescription(
  jobDescription: string,
  jobTitle: string,
  company: string,
  profile: UserProfile,
  resumes: Resume[]
): Promise<AnalyzeResult> {
  const resumeSummaries = resumes
    .map((r) => `- ${r.label}: skills=[${r.skills.join(", ")}]`)
    .join("\n");

  const prompt = `You are a job matching AI. Analyze this job posting against the candidate's profile.

## Job Posting
Title: ${jobTitle}
Company: ${company}
Description:
${jobDescription.slice(0, 4000)}

## Candidate Profile
Name: ${profile.fullName}
Years of Experience: ${profile.yearsExperience}
Skills: ${profile.skills.join(", ")}

## Available Resumes
${resumeSummaries}

## Instructions
1. Score the fit from 0-100
2. List matching and missing skills
3. List what the candidate needs to submit (resume, cover letter, references, portfolio, etc.)
4. Generate a tailored cover letter (3-4 paragraphs)
5. Write a brief summary of the role and fit

Respond in valid JSON only:
{
  "fitScore": <number>,
  "matchedSkills": ["<skill>", ...],
  "missingSkills": ["<skill>", ...],
  "requirements": ["<what to submit>", ...],
  "coverLetter": "<string>",
  "summary": "<brief summary>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: "You are a precise job matching assistant. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned) as AnalyzeResult;
    result.fitScore = Math.max(0, Math.min(100, Math.round(result.fitScore)));
    return result;
  } catch (error) {
    console.error("AI Analyze failed:", error);
    throw new Error("AI analysis failed. Please try again.");
  }
}
