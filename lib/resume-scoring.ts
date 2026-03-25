import type { ResumeScore, Resume } from "./types";

/**
 * Score a resume's quality based on content analysis.
 * Works on the extracted text content of a resume.
 */
export function scoreResume(text: string, resume: Resume): ResumeScore {
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const issues: string[] = [];
  const tips: string[] = [];

  // ── Length check ──
  let length: ResumeScore["length"] = "good";
  if (wordCount < 150) {
    length = "too-short";
    issues.push("Resume is too short (under 150 words)");
    tips.push("Add more detail about your experience, projects, and achievements");
  } else if (wordCount > 1500) {
    length = "too-long";
    issues.push("Resume is very long (over 1500 words)");
    tips.push("Trim to 1-2 pages — recruiters spend ~7 seconds on initial scan");
  }

  // ── Contact Info ──
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]+/;
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
  const hasEmail = emailRegex.test(text);
  const hasPhone = phoneRegex.test(text);
  const hasContactInfo = hasEmail && hasPhone;
  if (!hasEmail) { issues.push("No email address found"); tips.push("Add your email address at the top"); }
  if (!hasPhone) { issues.push("No phone number found"); tips.push("Add your phone number for quick contact"); }

  // ── Sections check ──
  const hasSkillsSection = /\b(skills|technologies|tech stack|competencies|proficiencies)\b/i.test(text);
  const hasExperienceSection = /\b(experience|employment|work history|positions|career)\b/i.test(text);
  const hasEducationSection = /\b(education|degree|university|college|certification|certifications)\b/i.test(text);

  if (!hasSkillsSection) { issues.push("No skills section detected"); tips.push("Add a clear 'Skills' or 'Technologies' section"); }
  if (!hasExperienceSection) { issues.push("No experience section detected"); tips.push("Add a 'Work Experience' section with dates and achievements"); }
  if (!hasEducationSection) { issues.push("No education section detected"); tips.push("Add an 'Education' section with degrees or certifications"); }

  // ── ATS-Friendliness ──
  const atsIssues: string[] = [];

  // Check for action verbs
  const actionVerbs = ["developed", "built", "designed", "implemented", "led", "managed", "created", "optimized", "delivered", "achieved", "improved", "reduced", "increased", "launched"];
  const hasActionVerbs = actionVerbs.some((v) => lower.includes(v));
  if (!hasActionVerbs) { atsIssues.push("No action verbs found"); tips.push("Start bullet points with action verbs: 'Developed', 'Implemented', 'Led', etc."); }

  // Check for quantifiable achievements
  const hasNumbers = /\d+%|\$\d|saved|reduced|increased by|improved by|grew/i.test(text);
  if (!hasNumbers) { tips.push("Add quantifiable achievements (e.g., 'Reduced load time by 40%', 'Managed team of 5')"); }

  // Check for dates in experience
  const hasDates = /\b(20\d{2}|19\d{2})\b/.test(text) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}\b/i.test(text);
  if (!hasDates && hasExperienceSection) { atsIssues.push("No dates found in experience"); tips.push("Add date ranges to work experience (e.g., 'Jan 2022 - Present')"); }

  // Check LinkedIn URL presence
  const hasLinkedin = /linkedin\.com/i.test(text);
  if (!hasLinkedin) { tips.push("Add your LinkedIn profile URL"); }

  // Skills from resume metadata vs detected
  const skillsInResume = resume.skills.length;
  if (skillsInResume < 3) { issues.push("Very few skills tagged"); tips.push("Ensure at least 5-10 relevant technical skills are listed"); }

  const atsFriendly = atsIssues.length === 0 && hasContactInfo && hasSkillsSection && hasExperienceSection;
  if (!atsFriendly) { issues.push(...atsIssues); }

  // ── Calculate Overall Score ──
  let score = 50; // Base score
  if (length === "good") score += 10;
  if (length === "too-short") score -= 15;
  if (length === "too-long") score -= 5;
  if (hasContactInfo) score += 10;
  if (hasEmail) score += 3;
  if (hasPhone) score += 2;
  if (hasSkillsSection) score += 8;
  if (hasExperienceSection) score += 8;
  if (hasEducationSection) score += 5;
  if (hasActionVerbs) score += 5;
  if (hasNumbers) score += 5;
  if (hasDates) score += 4;
  if (hasLinkedin) score += 2;
  if (skillsInResume >= 5) score += 3;
  if (skillsInResume >= 10) score += 2;

  // Penalty for issues
  score -= issues.length * 2;

  const overall = Math.max(0, Math.min(100, Math.round(score)));

  return {
    overall,
    length,
    hasContactInfo,
    hasSkillsSection,
    hasExperienceSection,
    hasEducationSection,
    atsFriendly,
    issues,
    tips: tips.slice(0, 5), // Max 5 tips
  };
}

/**
 * Get a badge color based on score.
 */
export function getScoreBadge(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Excellent", color: "bg-green-100 text-green-700" };
  if (score >= 70) return { label: "Good", color: "bg-blue-100 text-blue-700" };
  if (score >= 50) return { label: "Fair", color: "bg-yellow-100 text-yellow-700" };
  return { label: "Needs Work", color: "bg-red-100 text-red-700" };
}
