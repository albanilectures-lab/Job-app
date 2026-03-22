import { createClient, type Client } from "@libsql/client";
import { v4 as uuid } from "uuid";
import type { Job, ApplicationLog, Resume, UserProfile, SearchConfig, JobStatus } from "./types";

let _client: Client | null = null;

function getClient(): Client {
  if (_client) return _client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set. See README for setup instructions.");
  }

  _client = createClient({
    url,
    authToken,
  });

  return _client;
}

/** Initialize the database (must be called once at startup or before first use). */
export async function initDb(): Promise<void> {
  const client = getClient();
  await initTables(client);
}

async function initTables(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      description TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      location TEXT DEFAULT 'Remote',
      salary TEXT,
      source TEXT NOT NULL,
      postedAt TEXT,
      scrapedAt TEXT NOT NULL,
      fitScore INTEGER,
      coverLetter TEXT,
      resumeUsed TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      label TEXT NOT NULL,
      filePath TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      uploadedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_logs (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      jobTitle TEXT NOT NULL,
      company TEXT NOT NULL,
      url TEXT NOT NULL,
      resumeUsed TEXT NOT NULL,
      coverSnippet TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      appliedAt TEXT NOT NULL,
      FOREIGN KEY (jobId) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      fullName TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      linkedinUrl TEXT,
      githubUrl TEXT,
      portfolioUrl TEXT,
      skills TEXT NOT NULL DEFAULT '[]',
      yearsExperience INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS search_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      keywords TEXT NOT NULL DEFAULT '[]',
      boards TEXT NOT NULL DEFAULT '[]',
      maxDailyApplies INTEGER NOT NULL DEFAULT 200,
      minFitScore INTEGER NOT NULL DEFAULT 75
    );

    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      accessToken TEXT NOT NULL,
      refreshToken TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO user_profile (id) VALUES (1);
    INSERT OR IGNORE INTO search_config (id) VALUES (1);

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_logs_appliedAt ON application_logs(appliedAt);
  `);
}

/** Helper: run a SELECT and return rows as objects */
async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  const client = getClient();
  const result = await client.execute({ sql, args: params });
  return result.rows as any[];
}

/** Helper: run a SELECT and return the first row as an object */
async function queryOne(sql: string, params: any[] = []): Promise<any | undefined> {
  const rows = await queryAll(sql, params);
  return rows[0];
}

/** Helper: run INSERT/UPDATE/DELETE */
async function execute(sql: string, params: any[] = []): Promise<void> {
  const client = getClient();
  await client.execute({ sql, args: params });
}

// ─── Jobs ────────────────────────────────────────────────────
export async function insertJob(job: Omit<Job, "id" | "status">): Promise<Job> {
  const id = uuid();
  await execute(
    `INSERT OR IGNORE INTO jobs (id, title, company, description, url, location, salary, source, postedAt, scrapedAt, fitScore, coverLetter, resumeUsed, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [id, job.title, job.company, job.description, job.url, job.location, job.salary ?? null, job.source, job.postedAt ?? null, job.scrapedAt, job.fitScore ?? null, job.coverLetter ?? null, job.resumeUsed ?? null, job.notes ?? null]
  );
  return { ...job, id, status: "new" };
}

export async function updateJobStatus(id: string, status: JobStatus, notes?: string): Promise<void> {
  await execute("UPDATE jobs SET status = ?, notes = COALESCE(?, notes) WHERE id = ?", [status, notes ?? null, id]);
}

export async function updateJobFit(id: string, fitScore: number, coverLetter: string, resumeUsed: string): Promise<void> {
  await execute("UPDATE jobs SET fitScore = ?, coverLetter = ?, resumeUsed = ?, status = 'matched' WHERE id = ?", [fitScore, coverLetter, resumeUsed, id]);
}

export async function getJobs(status?: JobStatus, limit = 200): Promise<Job[]> {
  if (status) {
    return await queryAll("SELECT * FROM jobs WHERE status = ? ORDER BY scrapedAt DESC LIMIT ?", [status, limit]) as Job[];
  }
  return await queryAll("SELECT * FROM jobs ORDER BY scrapedAt DESC LIMIT ?", [limit]) as Job[];
}

export async function getJobById(id: string): Promise<Job | undefined> {
  return await queryOne("SELECT * FROM jobs WHERE id = ?", [id]) as Job | undefined;
}

export async function jobUrlExists(url: string): Promise<boolean> {
  const row = await queryOne("SELECT 1 FROM jobs WHERE url = ?", [url]);
  return !!row;
}

// ─── Resumes ─────────────────────────────────────────────────
export async function insertResume(resume: Omit<Resume, "id">): Promise<Resume> {
  const id = uuid();
  await execute(
    "INSERT INTO resumes (id, filename, label, filePath, skills, uploadedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [id, resume.filename, resume.label, resume.filePath, JSON.stringify(resume.skills), resume.uploadedAt]
  );
  return { ...resume, id };
}

export async function getResumes(): Promise<Resume[]> {
  const rows = await queryAll("SELECT * FROM resumes ORDER BY uploadedAt DESC");
  return rows.map((r: any) => ({ ...r, skills: JSON.parse(r.skills || "[]") }));
}

export async function deleteResume(id: string): Promise<void> {
  await execute("DELETE FROM resumes WHERE id = ?", [id]);
}

// ─── Application Log ─────────────────────────────────────────
export async function insertApplicationLog(log: Omit<ApplicationLog, "id">): Promise<ApplicationLog> {
  const id = uuid();
  await execute(
    "INSERT INTO application_logs (id, jobId, jobTitle, company, url, resumeUsed, coverSnippet, status, notes, appliedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, log.jobId, log.jobTitle, log.company, log.url, log.resumeUsed, log.coverSnippet ?? "", log.status, log.notes ?? "", log.appliedAt]
  );
  return { ...log, id };
}

export async function getApplicationLogs(limit = 500): Promise<ApplicationLog[]> {
  return await queryAll("SELECT * FROM application_logs ORDER BY appliedAt DESC LIMIT ?", [limit]) as ApplicationLog[];
}

export async function getTodayApplyCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await queryOne("SELECT COUNT(*) as cnt FROM application_logs WHERE appliedAt LIKE ? AND status = 'applied'", [`${today}%`]);
  return Number(row?.cnt ?? 0);
}

// ─── User Profile ────────────────────────────────────────────
export async function getUserProfile(): Promise<UserProfile> {
  const row = await queryOne("SELECT * FROM user_profile WHERE id = 1");
  return { ...row, skills: JSON.parse(row?.skills || "[]") };
}

export async function updateUserProfile(profile: UserProfile): Promise<void> {
  await execute(
    "UPDATE user_profile SET fullName=?, email=?, phone=?, linkedinUrl=?, githubUrl=?, portfolioUrl=?, skills=?, yearsExperience=? WHERE id=1",
    [
      profile.fullName, profile.email, profile.phone,
      profile.linkedinUrl ?? null, profile.githubUrl ?? null, profile.portfolioUrl ?? null,
      JSON.stringify(profile.skills), profile.yearsExperience
    ]
  );
}

// ─── Search Config ───────────────────────────────────────────
export async function getSearchConfig(): Promise<SearchConfig> {
  const row = await queryOne("SELECT * FROM search_config WHERE id = 1");
  return {
    keywords: JSON.parse(row?.keywords || "[]"),
    boards: JSON.parse(row?.boards || "[]"),
    maxDailyApplies: row?.maxDailyApplies ?? 200,
    minFitScore: row?.minFitScore ?? 75,
  };
}

export async function updateSearchConfig(config: SearchConfig): Promise<void> {
  await execute(
    "UPDATE search_config SET keywords=?, boards=?, maxDailyApplies=?, minFitScore=? WHERE id=1",
    [JSON.stringify(config.keywords), JSON.stringify(config.boards), config.maxDailyApplies, config.minFitScore]
  );
}

// ─── Gmail Tokens ────────────────────────────────────────────
export async function getGmailTokens() {
  const row = await queryOne("SELECT * FROM gmail_tokens WHERE id = 1");
  if (!row) return undefined;
  return row as { accessToken: string; refreshToken: string; expiresAt: number };
}

export async function saveGmailTokens(accessToken: string, refreshToken: string, expiresAt: number) {
  await execute(
    "INSERT OR REPLACE INTO gmail_tokens (id, accessToken, refreshToken, expiresAt) VALUES (1, ?, ?, ?)",
    [accessToken, refreshToken, expiresAt]
  );
}

export function isGmailConnected(): Promise<boolean> {
  return getGmailTokens().then((t) => !!t);
}
