// ─── Job Types ───────────────────────────────────────────────
export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  salary?: string;
  source: JobBoard;
  postedAt?: string;
  scrapedAt: string;
  fitScore?: number;
  coverLetter?: string;
  resumeUsed?: string;
  status: JobStatus;
  notes?: string;
}

export type JobStatus = "new" | "matched" | "skipped" | "applied" | "failed" | "rejected" | "interview";

export type JobBoard =
  | "weworkremotely"
  | "remoteok"
  | "remotive"
  | "jobicy"
  | "arbeitnow"
  | "themuse"
  | "justremote"
  | "dailyremote"
  | "remoteco"
  | "contra"
  | "glassdoor"
  | "builtin"
  | "unitedhealthgroup";

// ─── Resume Types ────────────────────────────────────────────
export interface Resume {
  id: string;
  filename: string;
  label: string; // e.g. "C#_AWS_Angular"
  filePath: string;
  skills: string[];
  uploadedAt: string;
}

// ─── User Profile (expanded) ─────────────────────────────────
export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  skills: string[];
  yearsExperience: number;
  // New fields
  currentTitle?: string;
  country?: string;
  state?: string;
  city?: string;
  postCode?: string;
  availability?: "immediately" | "1week" | "2weeks" | "1month" | "2months";
  workAuthCountries?: string[];
  visaSponsorship?: boolean;
  nationality?: string;
  currentSalary?: number;
  expectedSalary?: number;
  hourlyRate?: number;
  expectedHourlyRate?: number;
  experienceSummary?: string;
}

// ─── Copilot Config ──────────────────────────────────────────
export type CopilotMode = "manual-review" | "full-auto";
export type JobType = "fulltime" | "part-time" | "contract" | "internship";
export type SeniorityLevel = "entry" | "associate" | "mid-senior" | "director";

export interface CopilotConfig {
  mode: CopilotMode;
  enabled: boolean;
  matchThreshold: number; // 0-100
  jobTypes: JobType[];
  seniorityLevels: SeniorityLevel[];
  remoteOnly: boolean;
  timezones?: string[];
  maxDailyApplies: number;
  coverLetterMode: "auto-generate" | "upload-own";
  onboardingComplete: boolean;
}

// ─── Copilot Run Log ─────────────────────────────────────────
export interface CopilotRun {
  id: string;
  userId: string;
  runAt: string;
  boardsScraped: number;
  jobsFound: number;
  jobsMatched: number;
  jobsApplied: number;
  errors: string[];
  durationMs: number;
}

// ─── Application Log ─────────────────────────────────────────
export interface ApplicationLog {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  url: string;
  resumeUsed: string;
  coverSnippet: string;
  status: JobStatus;
  notes: string;
  appliedAt: string;
}

// ─── Search Config ───────────────────────────────────────────
export interface SearchConfig {
  keywords: string[];
  boards: JobBoard[];
  maxDailyApplies: number;
  minFitScore: number;
}

// ─── Gmail ───────────────────────────────────────────────────
export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ─── AI Analysis ─────────────────────────────────────────────
export interface FitAnalysis {
  score: number; // 0-100
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  bestResumeId: string;
  coverLetter: string;
}

// ─── Resume Quality ──────────────────────────────────────────
export interface ResumeScore {
  overall: number; // 0-100
  length: "too-short" | "good" | "too-long";
  hasContactInfo: boolean;
  hasSkillsSection: boolean;
  hasExperienceSection: boolean;
  hasEducationSection: boolean;
  atsFriendly: boolean;
  issues: string[];
  tips: string[];
}

// ─── Screening Questions ─────────────────────────────────────
export interface ScreeningQuestion {
  id: string;
  question: string;
  answer: string;
  category: "experience" | "availability" | "salary" | "legal" | "technical" | "general";
}

export interface ScreeningAnswers {
  userId: string;
  questions: ScreeningQuestion[];
  updatedAt: string;
}

// ─── Autopilot Run Result ────────────────────────────────────
export interface AutopilotResult {
  boardsScraped: number;
  jobsFound: number;
  jobsMatched: number;
  jobsApplied: number;
  errors: string[];
  durationMs: number;
}

// ─── API Responses ───────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
