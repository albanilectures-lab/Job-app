import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import type { Job, ApplicationLog, Resume, UserProfile, SearchConfig, JobStatus } from "./types";

const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
const DB_PATH = IS_SERVERLESS
  ? path.join("/tmp", "app.db")
  : path.join(process.cwd(), "data", "app.db");

let _db: SqlJsDatabase | null = null;
let _sqlPromise: Promise<any> | null = null;

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getDbAsync(): Promise<SqlJsDatabase> {
  if (_db) return _db;

  if (!_sqlPromise) {
    _sqlPromise = (async () => {
      // Try multiple paths to find the WASM binary
      const wasmPaths = [
        path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
        path.join(process.cwd(), "public", "sql-wasm.wasm"),
        path.join(process.cwd(), ".next", "server", "sql-wasm.wasm"),
        path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
      ];

      for (const wasmPath of wasmPaths) {
        try {
          if (fs.existsSync(wasmPath)) {
            const wasmBinary = fs.readFileSync(wasmPath);
            return await initSqlJs({ wasmBinary });
          }
        } catch { /* try next path */ }
      }

      // Last resort: let sql.js try to locate it on its own
      return await initSqlJs();
    })();
  }
  const SQL = await _sqlPromise;

  ensureDataDir();

  // Load existing database or create new
  let db: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  initTables(db);
  _db = db;
  return db;
}

function getDb(): SqlJsDatabase {
  if (!_db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

/** Initialize the database (must be called once at startup or before first use). */
export async function initDb(): Promise<void> {
  await getDbAsync();
}

function saveDb() {
  if (_db) {
    ensureDataDir();
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function initTables(db: SqlJsDatabase) {
  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      label TEXT NOT NULL,
      filePath TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      uploadedAt TEXT NOT NULL
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS search_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      keywords TEXT NOT NULL DEFAULT '[]',
      boards TEXT NOT NULL DEFAULT '[]',
      maxDailyApplies INTEGER NOT NULL DEFAULT 200,
      minFitScore INTEGER NOT NULL DEFAULT 75
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      accessToken TEXT NOT NULL,
      refreshToken TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    )
  `);

  // Insert default rows if not present
  const profileExists = db.exec("SELECT 1 FROM user_profile WHERE id = 1");
  if (profileExists.length === 0 || profileExists[0].values.length === 0) {
    db.run("INSERT OR IGNORE INTO user_profile (id) VALUES (1)");
  }

  const configExists = db.exec("SELECT 1 FROM search_config WHERE id = 1");
  if (configExists.length === 0 || configExists[0].values.length === 0) {
    db.run("INSERT OR IGNORE INTO search_config (id) VALUES (1)");
  }

  // Create indices
  db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)");
  db.run("CREATE INDEX IF NOT EXISTS idx_logs_appliedAt ON application_logs(appliedAt)");

  saveDb();
}

/** Helper: run a SELECT and return rows as objects */
function queryAll(sql: string, params: any[] = []): any[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Helper: run a SELECT and return the first row as an object */
function queryOne(sql: string, params: any[] = []): any | undefined {
  const rows = queryAll(sql, params);
  return rows[0];
}

/** Helper: run INSERT/UPDATE/DELETE */
function execute(sql: string, params: any[] = []): void {
  const db = getDb();
  db.run(sql, params);
  saveDb();
}

// ─── Jobs ────────────────────────────────────────────────────
export function insertJob(job: Omit<Job, "id" | "status">): Job {
  const id = uuid();
  execute(
    `INSERT OR IGNORE INTO jobs (id, title, company, description, url, location, salary, source, postedAt, scrapedAt, fitScore, coverLetter, resumeUsed, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [id, job.title, job.company, job.description, job.url, job.location, job.salary ?? null, job.source, job.postedAt ?? null, job.scrapedAt, job.fitScore ?? null, job.coverLetter ?? null, job.resumeUsed ?? null, job.notes ?? null]
  );
  return { ...job, id, status: "new" };
}

export function updateJobStatus(id: string, status: JobStatus, notes?: string): void {
  execute("UPDATE jobs SET status = ?, notes = COALESCE(?, notes) WHERE id = ?", [status, notes ?? null, id]);
}

export function updateJobFit(id: string, fitScore: number, coverLetter: string, resumeUsed: string): void {
  execute("UPDATE jobs SET fitScore = ?, coverLetter = ?, resumeUsed = ?, status = 'matched' WHERE id = ?", [fitScore, coverLetter, resumeUsed, id]);
}

export function getJobs(status?: JobStatus, limit = 200): Job[] {
  if (status) {
    return queryAll("SELECT * FROM jobs WHERE status = ? ORDER BY scrapedAt DESC LIMIT ?", [status, limit]) as Job[];
  }
  return queryAll("SELECT * FROM jobs ORDER BY scrapedAt DESC LIMIT ?", [limit]) as Job[];
}

export function getJobById(id: string): Job | undefined {
  return queryOne("SELECT * FROM jobs WHERE id = ?", [id]) as Job | undefined;
}

export function jobUrlExists(url: string): boolean {
  const row = queryOne("SELECT 1 FROM jobs WHERE url = ?", [url]);
  return !!row;
}

// ─── Resumes ─────────────────────────────────────────────────
export function insertResume(resume: Omit<Resume, "id">): Resume {
  const id = uuid();
  execute(
    "INSERT INTO resumes (id, filename, label, filePath, skills, uploadedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [id, resume.filename, resume.label, resume.filePath, JSON.stringify(resume.skills), resume.uploadedAt]
  );
  return { ...resume, id };
}

export function getResumes(): Resume[] {
  const rows = queryAll("SELECT * FROM resumes ORDER BY uploadedAt DESC");
  return rows.map((r: any) => ({ ...r, skills: JSON.parse(r.skills || "[]") }));
}

export function deleteResume(id: string): void {
  execute("DELETE FROM resumes WHERE id = ?", [id]);
}

// ─── Application Log ─────────────────────────────────────────
export function insertApplicationLog(log: Omit<ApplicationLog, "id">): ApplicationLog {
  const id = uuid();
  execute(
    "INSERT INTO application_logs (id, jobId, jobTitle, company, url, resumeUsed, coverSnippet, status, notes, appliedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, log.jobId, log.jobTitle, log.company, log.url, log.resumeUsed, log.coverSnippet ?? "", log.status, log.notes ?? "", log.appliedAt]
  );
  return { ...log, id };
}

export function getApplicationLogs(limit = 500): ApplicationLog[] {
  return queryAll("SELECT * FROM application_logs ORDER BY appliedAt DESC LIMIT ?", [limit]) as ApplicationLog[];
}

export function getTodayApplyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = queryOne("SELECT COUNT(*) as cnt FROM application_logs WHERE appliedAt LIKE ? AND status = 'applied'", [`${today}%`]);
  return row?.cnt ?? 0;
}

// ─── User Profile ────────────────────────────────────────────
export function getUserProfile(): UserProfile {
  const row = queryOne("SELECT * FROM user_profile WHERE id = 1");
  return { ...row, skills: JSON.parse(row?.skills || "[]") };
}

export function updateUserProfile(profile: UserProfile): void {
  execute(
    "UPDATE user_profile SET fullName=?, email=?, phone=?, linkedinUrl=?, githubUrl=?, portfolioUrl=?, skills=?, yearsExperience=? WHERE id=1",
    [
      profile.fullName, profile.email, profile.phone,
      profile.linkedinUrl ?? null, profile.githubUrl ?? null, profile.portfolioUrl ?? null,
      JSON.stringify(profile.skills), profile.yearsExperience
    ]
  );
}

// ─── Search Config ───────────────────────────────────────────
export function getSearchConfig(): SearchConfig {
  const row = queryOne("SELECT * FROM search_config WHERE id = 1");
  return {
    keywords: JSON.parse(row?.keywords || "[]"),
    boards: JSON.parse(row?.boards || "[]"),
    maxDailyApplies: row?.maxDailyApplies ?? 200,
    minFitScore: row?.minFitScore ?? 75,
  };
}

export function updateSearchConfig(config: SearchConfig): void {
  execute(
    "UPDATE search_config SET keywords=?, boards=?, maxDailyApplies=?, minFitScore=? WHERE id=1",
    [JSON.stringify(config.keywords), JSON.stringify(config.boards), config.maxDailyApplies, config.minFitScore]
  );
}

// ─── Gmail Tokens ────────────────────────────────────────────
export function getGmailTokens() {
  const row = queryOne("SELECT * FROM gmail_tokens WHERE id = 1");
  if (!row) return undefined;
  return row as { accessToken: string; refreshToken: string; expiresAt: number };
}

export function saveGmailTokens(accessToken: string, refreshToken: string, expiresAt: number) {
  execute(
    "INSERT OR REPLACE INTO gmail_tokens (id, accessToken, refreshToken, expiresAt) VALUES (1, ?, ?, ?)",
    [accessToken, refreshToken, expiresAt]
  );
}
