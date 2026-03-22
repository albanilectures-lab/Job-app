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
    "userId" TEXT NOT NULL DEFAULT 'admin',
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    location TEXT DEFAULT 'Remote',
    salary TEXT,
    source TEXT NOT NULL,
    "postedAt" TEXT,
    "scrapedAt" TEXT NOT NULL,
    "fitScore" INTEGER,
    "coverLetter" TEXT,
    "resumeUsed" TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT,
    UNIQUE("userId", url)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'admin',
    filename TEXT NOT NULL,
    label TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    skills TEXT NOT NULL DEFAULT '[]',
    "uploadedAt" TEXT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS application_logs (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'admin',
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
    "userId" TEXT PRIMARY KEY,
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
    "userId" TEXT PRIMARY KEY,
    keywords TEXT NOT NULL DEFAULT '[]',
    boards TEXT NOT NULL DEFAULT '[]',
    "maxDailyApplies" INTEGER NOT NULL DEFAULT 200,
    "minFitScore" INTEGER NOT NULL DEFAULT 75
  )`;

  await sql`CREATE TABLE IF NOT EXISTS gmail_tokens (
    "userId" TEXT PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "email" TEXT
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs("userId", status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_user_source ON jobs("userId", source)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_user_appliedAt ON application_logs("userId", "appliedAt")`;
  await sql`CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes("userId")`;
}

/** Ensure a user has profile & config seed rows */
export async function ensureUserRows(userId: string): Promise<void> {
  const sql = getSQL();
  await sql`INSERT INTO user_profile ("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
  await sql`INSERT INTO search_config ("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
}

// ─── Jobs ────────────────────────────────────────────────────
export async function insertJob(job: Omit<Job, "id" | "status">, userId: string): Promise<Job> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO jobs (id, "userId", title, company, description, url, location, salary, source, "postedAt", "scrapedAt", "fitScore", "coverLetter", "resumeUsed", status, notes)
    VALUES (${id}, ${userId}, ${job.title}, ${job.company}, ${job.description}, ${job.url}, ${job.location}, ${job.salary ?? null}, ${job.source}, ${job.postedAt ?? null}, ${job.scrapedAt}, ${job.fitScore ?? null}, ${job.coverLetter ?? null}, ${job.resumeUsed ?? null}, 'new', ${job.notes ?? null})
    ON CONFLICT ("userId", url) DO NOTHING`;
  return { ...job, id, status: "new" };
}

export async function updateJobStatus(id: string, status: JobStatus, userId: string, notes?: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE jobs SET status = ${status}, notes = COALESCE(${notes ?? null}, notes) WHERE id = ${id} AND "userId" = ${userId}`;
}

export async function updateJobFit(id: string, fitScore: number, coverLetter: string, resumeUsed: string, userId: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE jobs SET "fitScore" = ${fitScore}, "coverLetter" = ${coverLetter}, "resumeUsed" = ${resumeUsed}, status = 'matched' WHERE id = ${id} AND "userId" = ${userId}`;
}

export async function getJobs(userId: string, status?: JobStatus, limit = 200): Promise<Job[]> {
  const sql = getSQL();
  if (status) {
    return await sql`SELECT * FROM jobs WHERE "userId" = ${userId} AND status = ${status} ORDER BY "scrapedAt" DESC LIMIT ${limit}` as any as Job[];
  }
  return await sql`SELECT * FROM jobs WHERE "userId" = ${userId} ORDER BY "scrapedAt" DESC LIMIT ${limit}` as any as Job[];
}

export async function getJobById(id: string, userId: string): Promise<Job | undefined> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM jobs WHERE id = ${id} AND "userId" = ${userId}`;
  return rows[0] as any as Job | undefined;
}

export async function jobUrlExists(url: string, userId: string): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`SELECT 1 FROM jobs WHERE url = ${url} AND "userId" = ${userId}`;
  return rows.length > 0;
}

// ─── Resumes ─────────────────────────────────────────────────
export async function insertResume(resume: Omit<Resume, "id">, userId: string): Promise<Resume> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO resumes (id, "userId", filename, label, "filePath", skills, "uploadedAt")
    VALUES (${id}, ${userId}, ${resume.filename}, ${resume.label}, ${resume.filePath}, ${JSON.stringify(resume.skills)}, ${resume.uploadedAt})`;
  return { ...resume, id };
}

export async function getResumes(userId: string): Promise<Resume[]> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM resumes WHERE "userId" = ${userId} ORDER BY "uploadedAt" DESC`;
  return rows.map((r: any) => ({ ...r, skills: JSON.parse(r.skills || "[]") }));
}

export async function deleteResume(id: string, userId: string): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM resumes WHERE id = ${id} AND "userId" = ${userId}`;
}

// ─── Application Log ─────────────────────────────────────────
export async function insertApplicationLog(log: Omit<ApplicationLog, "id">, userId: string): Promise<ApplicationLog> {
  const id = uuid();
  const sql = getSQL();
  await sql`INSERT INTO application_logs (id, "userId", "jobId", "jobTitle", company, url, "resumeUsed", "coverSnippet", status, notes, "appliedAt")
    VALUES (${id}, ${userId}, ${log.jobId}, ${log.jobTitle}, ${log.company}, ${log.url}, ${log.resumeUsed}, ${log.coverSnippet ?? ""}, ${log.status}, ${log.notes ?? ""}, ${log.appliedAt})`;
  return { ...log, id };
}

export async function getApplicationLogs(userId: string, limit = 500): Promise<ApplicationLog[]> {
  const sql = getSQL();
  return await sql`SELECT * FROM application_logs WHERE "userId" = ${userId} ORDER BY "appliedAt" DESC LIMIT ${limit}` as any as ApplicationLog[];
}

export async function getTodayApplyCount(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const sql = getSQL();
  const rows = await sql`SELECT COUNT(*) as cnt FROM application_logs WHERE "userId" = ${userId} AND "appliedAt" LIKE ${today + '%'} AND status = 'applied'`;
  return Number(rows[0]?.cnt ?? 0);
}

// ─── User Profile ────────────────────────────────────────────
export async function getUserProfile(userId: string): Promise<UserProfile> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM user_profile WHERE "userId" = ${userId}`;
  const row = rows[0] as any;
  if (!row) return { fullName: "", email: "", phone: "", skills: [], yearsExperience: 0 };
  return { fullName: row.fullName, email: row.email, phone: row.phone, linkedinUrl: row.linkedinUrl, githubUrl: row.githubUrl, portfolioUrl: row.portfolioUrl, skills: JSON.parse(row.skills || "[]"), yearsExperience: row.yearsExperience };
}

export async function updateUserProfile(profile: UserProfile, userId: string): Promise<void> {
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
    WHERE "userId" = ${userId}`;
}

// ─── Search Config ───────────────────────────────────────────
export async function getSearchConfig(userId: string): Promise<SearchConfig> {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM search_config WHERE "userId" = ${userId}`;
  const row = rows[0] as any;
  if (!row) return { keywords: [], boards: [], maxDailyApplies: 200, minFitScore: 75 };
  return {
    keywords: JSON.parse(row.keywords || "[]"),
    boards: JSON.parse(row.boards || "[]"),
    maxDailyApplies: row.maxDailyApplies ?? 200,
    minFitScore: row.minFitScore ?? 75,
  };
}

export async function updateSearchConfig(config: SearchConfig, userId: string): Promise<void> {
  const sql = getSQL();
  await sql`UPDATE search_config SET
    keywords = ${JSON.stringify(config.keywords)},
    boards = ${JSON.stringify(config.boards)},
    "maxDailyApplies" = ${config.maxDailyApplies},
    "minFitScore" = ${config.minFitScore}
    WHERE "userId" = ${userId}`;
}

// ─── Gmail Tokens ────────────────────────────────────────────
export async function getGmailTokens(userId: string) {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM gmail_tokens WHERE "userId" = ${userId}`;
  if (rows.length === 0) return undefined;
  return rows[0] as any as { accessToken: string; refreshToken: string; expiresAt: number; email?: string };
}

export async function saveGmailTokens(accessToken: string, refreshToken: string, expiresAt: number, userId: string, email?: string) {
  const sql = getSQL();
  await sql`INSERT INTO gmail_tokens ("userId", "accessToken", "refreshToken", "expiresAt", "email")
    VALUES (${userId}, ${accessToken}, ${refreshToken}, ${expiresAt}, ${email ?? null})
    ON CONFLICT ("userId") DO UPDATE SET "accessToken" = ${accessToken}, "refreshToken" = ${refreshToken}, "expiresAt" = ${expiresAt}, "email" = COALESCE(${email ?? null}, gmail_tokens."email")`;
}

export async function isGmailConnected(userId: string): Promise<{ connected: boolean; email?: string }> {
  const t = await getGmailTokens(userId);
  return { connected: !!t, email: t?.email ?? undefined };
}
