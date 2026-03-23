import type { JobBoard } from "./types";

// ─── Exclusion Keywords (reject if found) ────────────────────
export const EXCLUSION_KEYWORDS = [
  "security clearance",
  "ts/sci",
  "secret clearance",
  "top secret",
  "us citizen only",
  "u.s. citizen",
  "united states citizen",
  "us persons",
  "background check required",
  "on-site",
  "onsite",
  "hybrid",
  "in-office",
  "visa sponsorship needed",
  "government",
  "defense",
  "dod",
  "department of defense",
  "cleared personnel",
  "public trust",
  "suitability clearance",

];

// ─── Inclusion Keywords (must match at least one) ────────────
export const INCLUSION_KEYWORDS = [
  "remote",
  "100% remote",
  "fully remote",
  "work from anywhere",
  "work from home",
  "distributed",
  "remote-first",
];

// ─── Job Board Configurations ────────────────────────────────
export const JOB_BOARD_CONFIGS: Record<
  JobBoard,
  {
    name: string;
    baseUrl: string;
    feedUrl?: string;
    type: "rss" | "json" | "scrape" | "login-required";
    requiresLogin?: boolean;
    loginUrl?: string;
  }
> = {
  weworkremotely: {
    name: "We Work Remotely",
    baseUrl: "https://weworkremotely.com",
    feedUrl: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    type: "rss",
    requiresLogin: true,
    loginUrl: "https://weworkremotely.com/job-seekers/account/login",
  },
  remoteok: {
    name: "Remote OK",
    baseUrl: "https://remoteok.com",
    feedUrl: "https://remoteok.com/api",
    type: "json",
    requiresLogin: true,
    loginUrl: "https://remoteok.com/login",
  },
  remotive: {
    name: "Remotive",
    baseUrl: "https://remotive.com",
    feedUrl: "https://remotive.com/api/remote-jobs",
    type: "json",
  },
  jobicy: {
    name: "Jobicy",
    baseUrl: "https://jobicy.com",
    feedUrl: "https://jobicy.com/api/v2/remote-jobs",
    type: "json",
  },
  arbeitnow: {
    name: "Arbeitnow",
    baseUrl: "https://arbeitnow.com",
    feedUrl: "https://arbeitnow.com/api/job-board-api",
    type: "json",
  },
  themuse: {
    name: "The Muse",
    baseUrl: "https://www.themuse.com",
    feedUrl: "https://www.themuse.com/api/public/jobs",
    type: "json",
  },
  justremote: {
    name: "JustRemote",
    baseUrl: "https://justremote.co",
    type: "scrape",
  },
  dailyremote: {
    name: "DailyRemote",
    baseUrl: "https://dailyremote.com",
    type: "scrape",
  },
  remoteco: {
    name: "Remote.co",
    baseUrl: "https://remote.co",
    type: "scrape",
  },
  contra: {
    name: "Contra",
    baseUrl: "https://contra.com",
    type: "scrape",
  },

  glassdoor: {
    name: "Glassdoor",
    baseUrl: "https://www.glassdoor.com",
    type: "login-required",
    requiresLogin: true,
    loginUrl: "https://www.glassdoor.com/profile/login_input.htm",
  },
  builtin: {
    name: "Built In",
    baseUrl: "https://builtin.com",
    type: "scrape",
  },
  unitedhealthgroup: {
    name: "UnitedHealth Group",
    baseUrl: "https://www.unitedhealthgroup.com",
    type: "scrape",
    requiresLogin: true,
    loginUrl: "https://careers.unitedhealthgroup.com/",
  },
};

// ─── Defaults ────────────────────────────────────────────────
export const DEFAULT_MAX_DAILY_APPLIES = 200;
export const DEFAULT_MIN_FIT_SCORE = 75;
export const MAX_RESUMES = 8;
export const MIN_RESUMES = 1;
export const BATCH_SIZE = 100;

// ─── Anti-Detection ──────────────────────────────────────────
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

export const DELAY_RANGE = { min: 2000, max: 7000 }; // ms between actions
export const PAGE_LOAD_TIMEOUT = 30000;
