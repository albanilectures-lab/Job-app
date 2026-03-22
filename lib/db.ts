import { neon } from "@neondatabase/serverless";
import { v4 as uuid } from "uuid";
import type { Job, ApplicationLog, Resume, UserProfile, SearchConfig, JobStatus } from "./types";

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See README for Neon database setup.");
  }
  return neon(url);
}

/** Initialize the database (must be called once at startup or before first use). */
export async function initDb(): Promise<void> {
  const sql = getSQL();

  await sql`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    location TEXT DEFAULT 'Remote',
    salary TEXT,
    source TEXT NOT NULL,
    "postedAt" TEXT,
    "scrapedAt" TEXT NOT NULL,
    "fitScore" INTEGER,
    "coverLetter" TEXT,
    "resumeUsed" TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT
  )`;

  await sql`CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    label TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    skills TEXT NOT NULL DEFAULT '[]',
    "uploadedAt" TEXT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS application_logs (
    id TEXT PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    company TEXT NOT NULL,
    url TEXT NOT NULL,
    "resumeUsed" TEXT NOT NULL,
    "coverSnippet" TEXT,
    status TEXT NOT NULL,
    notes TEXT,
    "appliedAt" TEXT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    "fullName" TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    skills TEXT NOT NULL DEFAULT '[]',
    "yearsExperience" INTEGER NOT NULL DEFAULT 0
  )`;

  await sql`CREATE TABLE IF NOT EXISTS search_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    keywords TEXT NOT NULL DEFAULT '[]',
    boards TEXT NOT NULL DEFAULT '[]',
    "maxDailyApplies" INTEGER NOT NULL DEFAULT 200,
    "minFitScore" INTEGER NOT NULL DEFAULT 75
  )`;

  await sql`CREATE TABLE IF NOT EXISTS gmail_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL
  )`;

  await sql`INSERT INTO user_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO search_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_appliedAt ON application_logs("appliedAt")`;
}

// ─── Jobs ────────────────────────────────────────────────────
export async function insertJob(job: Omit<Job, "id" | "status">): Promise<Job> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO jobs (id, title, company, description, url, location, salary, source, "postedAt", "scrapedAt", "fitScore", "coverLetter", "resumeUsed", status, notes)
    VALUES (${id}, ${job.title}, ${job.company}, ${job.description}, ${job.url}, ${job.location}, ${job.salary ?? null}, ${job.source}, ${job.postedAt ?? null}, ${job.scrapedAt}, ${job.fitScore ?? null}, ${job.coverLetter ?? null}, ${job.resumeUsed ?? null}, 'new', ${job.notes ?? null})
    ON CONFLICT (url) DO NOTHING`;
  return { ...job, id, status: "new" };
}

export async function updateJobStatus(id: string, status: JobStatus, notes?: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE jobs SET status = ${status}, notes = COALESCE(${notes ?? null}, notes) WHERE id = ${id}`;
}

export async function updateJobFit(id: string, fitScore: number, coverLetter: string, resumeUsed: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE jobs SET "fitScore" = ${fitScore}, "coverLetter" = ${coverLetter}, "resumeUsed" = ${resumeUsed}, status = 'matched' WHERE id = ${id}`;
}

export async function getJobs(status?: JobStatus, limit = 200): Promise<Job[]> {
  const sql = getSQL();
  if (status) {
    return await sql`SELECT * FROM jobs WHERE status = ${status} ORDER BY "scrapedAt" DESC LIMIT ${limit}` as any as Job[];
  }
  return await sql`SELECT * FROM jobs ORDER BY "scrapedAt" DESC LIMIT ${limit}` as any as Job[];
}

export async function getJobById(id: string): Promise<Job | undefined> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  return rows[0] as any as Job | undefined;
}

export async function jobUrlExists(url: string): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`SELECT 1 FROM jobs WHERE url = ${url}`;
  return rows.length > 0;
}

// ─── Resumes ─────────────────────────────────────────────────
export async function insertResume(resume: Omit<Resume, "id">): Promise<Resume> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO resumes (id, filename, label, "filePath", skills, "uploadedAt")
    VALUES (${id}, ${resume.filename}, ${resume.label}, ${resume.filePath}, ${JSON.stringify(resume.skills)}, ${resume.uploadedAt})`;
  return { ...resume, id };
}

export async function getResumes(): Promise<Resume[]> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM resumes ORDER BY "uploadedAt" DESC`;
  return rows.map((r: any) => ({ ...r, skills: JSON.parse(r.skills || "[]") }));
}

export async function deleteResume(id: string): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM resumes WHERE id = ${id}`;
}

// ─── Application Log ─────────────────────────────────────────
export async function insertApplicationLog(log: Omit<ApplicationLog, "id">): Promise<ApplicationLog> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO application_logs (id, "jobId", "jobTitle", company, url, "resumeUsed", "coverSnippet", status, notes, "appliedAt")
    VALUES (${id}, ${log.jobId}, ${log.jobTitle}, ${log.company}, ${log.url}, ${log.resumeUsed}, ${log.coverSnippet ?? ""}, ${log.status}, ${log.notes ?? ""}, ${log.appliedAt})`;
  return { ...log, id };
}

export async function getApplicationLogs(limit = 500): Promise<ApplicationLog[]> {
  const sql = getSQL();
  return await sql`SELECT * FROM application_logs ORDER BY "appliedAt" DESC LIMIT ${limit}` as any as ApplicationLog[];
}

export async function getTodayApplyCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const sql = getSQL();
  const rows = await sql`SELECT COUNT(*) as cnt FROM application_logs WHERE "appliedAt" LIKE ${today + '%'} AND status = 'applied'`;
  return Number(rows[0]?.cnt ?? 0);
}

// ─── User Profile ────────────────────────────────────────────
export async function getUserProfile(): Promise<UserProfile> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM user_profile WHERE id = 1`;
  const row = rows[0] as any;
  return { ...row, skills: JSON.parse(row?.skills || "[]") };
}

export async function updateUserProfile(profile: UserProfile): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE user_profile SET
    "fullName" = ${profile.fullName},
    email = ${profile.email},
    phone = ${profile.phone},
    "linkedinUrl" = ${profile.linkedinUrl ?? null},
    "githubUrl" = ${profile.githubUrl ?? null},
    "portfolioUrl" = ${profile.portfolioUrl ?? null},
    skills = ${JSON.stringify(profile.skills)},
    "yearsExperience" = ${profile.yearsExperience}
    WHERE id = 1`;
}

// ─── Search Config ───────────────────────────────────────────
export async function getSearchConfig(): Promise<SearchConfig> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM search_config WHERE id = 1`;
  const row = rows[0] as any;
  return {
    keywords: JSON.parse(row?.keywords || "[]"),
    boards: JSON.parse(row?.boards || "[]"),
    maxDailyApplies: row?.maxDailyApplies ?? 200,
    minFitScore: row?.minFitScore ?? 75,
  };
}

export async function updateSearchConfig(config: SearchConfig): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE search_config SET
    keywords = ${JSON.stringify(config.keywords)},
    boards = ${JSON.stringify(config.boards)},
    "maxDailyApplies" = ${config.maxDailyApplies},
    "minFitScore" = ${config.minFitScore}
    WHERE id = 1`;
}

// ─── Gmail Tokens ────────────────────────────────────────────
export async function getGmailTokens() {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM gmail_tokens WHERE id = 1`;
  if (rows.length === 0) return undefined;
  return rows[0] as any as { accessToken: string; refreshToken: string; expiresAt: number };
}

export async function saveGmailTokens(accessToken: string, refreshToken: string, expiresAt: number) {
  const sql = getSQL();
  await sql`INSERT INTO gmail_tokens (id, "accessToken", "refreshToken", "expiresAt")
    VALUES (1, ${accessToken}, ${refreshToken}, ${expiresAt})
    ON CONFLICT (id) DO UPDATE SET "accessToken" = ${accessToken}, "refreshToken" = ${refreshToken}, "expiresAt" = ${expiresAt}`;
}

export function isGmailConnected(): Promise<boolean> {
  return getGmailTokens().then((t) => !!t);
}
