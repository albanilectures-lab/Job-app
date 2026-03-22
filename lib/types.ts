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
  | "nodesk"
  | "justremote"
  | "dailyremote"
  | "remoteco"
  | "wellfound"
  | "contra"
  | "glassdoor"
  | "dice"
  | "ziprecruiter"
  | "builtin"
  | "greenhouse"
  | "lever"
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

// ─── User Profile ────────────────────────────────────────────
export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  skills: string[];
  yearsExperience: number;
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

// ─── API Responses ───────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
