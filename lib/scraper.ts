import RssParser from "rss-parser";
import * as cheerio from "cheerio";
import type { Job, JobBoard } from "./types";
import { JOB_BOARD_CONFIGS, USER_AGENTS } from "./constants";
import { randomPick, sleep } from "./utils";
import { jobUrlExists, initDb } from "./db";
import { filterJob } from "./filters";
// Playwright is loaded dynamically only when needed (not available on serverless)

const rssParser = new RssParser();

/** Safely resolve a URL — if it's already absolute, return as-is; otherwise prepend baseUrl. */
function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return "";
  // Fix malformed protocol (e.g. "https//example.com" → "https://example.com")
  const fixed = href.replace(/^(https?)(\/\/)/, "$1:$2");
  // Already a full URL
  if (fixed.startsWith("http://") || fixed.startsWith("https://")) return fixed;
  // Protocol-relative
  if (fixed.startsWith("//")) return `https:${fixed}`;
  // Absolute path
  if (fixed.startsWith("/")) return `${baseUrl.replace(/\/$/, "")}${fixed}`;
  // Relative
  return `${baseUrl.replace(/\/$/, "")}/${fixed}`;
}

/**
 * Fetch jobs from all configured boards for the given keywords.
 */
export async function scrapeAllBoards(
  boards: JobBoard[],
  keywords: string[],
  userId: string
): Promise<Job[]> {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[Scraper ${Date.now() - startTime}ms] ${msg}`);

  const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  // Deadline: leave headroom for DB insert + response on serverless
  const DEADLINE_MS = IS_SERVERLESS ? 18000 : 45000;

  // Filter boards for serverless compatibility
  const activeBoards = IS_SERVERLESS
    ? boards.filter((b) => JOB_BOARD_CONFIGS[b].type !== "login-required")
    : boards;

  log(`serverless=${IS_SERVERLESS}, boards=${activeBoards.join(",")} (${activeBoards.length}/${boards.length}), keywords=${keywords.length}`);

  // Scrape all boards concurrently — collect results as they arrive
  const allJobs: Job[] = [];
  const scrapePromises = activeBoards.map(async (board) => {
    try {
      log(`fetching ${board}...`);
      const jobs = await scrapeBoard(board, keywords);
      log(`${board}: got ${jobs.length} jobs`);
      allJobs.push(...jobs);
    } catch (error) {
      log(`${board} ERROR: ${error}`);
    }
  });

  // Wait for all boards to finish OR deadline, whichever comes first
  await Promise.race([
    Promise.allSettled(scrapePromises),
    sleep(DEADLINE_MS).then(() => log(`deadline reached (${DEADLINE_MS}ms), collected ${allJobs.length} jobs so far`)),
  ]);

  log(`scraping phase done, ${allJobs.length} raw jobs`);

  // Filter and deduplicate
  const validJobs = allJobs.filter(filterJob);
  const filtered: Job[] = [];
  for (const j of validJobs) {
    if (!(await jobUrlExists(j.url, userId))) {
      filtered.push(j);
    }
  }
  console.log(`[Scraper] ${allJobs.length} total → ${filtered.length} after filtering`);
  return filtered;
}

async function scrapeBoard(board: JobBoard, keywords: string[]): Promise<Job[]> {
  const config = JOB_BOARD_CONFIGS[board];

  switch (config.type) {
    case "rss":
      return scrapeRss(board, config.feedUrl!, keywords);
    case "json":
      return scrapeJson(board, config.feedUrl!, keywords);
    case "login-required": {
      try {
        const { scrapeWithSession } = await import("./playwright");
        return scrapeWithSession(board, keywords);
      } catch {
        console.warn(`[Scraper] Playwright not available, skipping ${board}`);
        return [];
      }
    }
    case "scrape":
      return scrapeHtml(board, keywords);
    default:
      return [];
  }
}

// ─── RSS Feed (We Work Remotely) ─────────────────────────────
async function scrapeRss(board: JobBoard, feedUrl: string, keywords: string[]): Promise<Job[]> {
  const feed = await Promise.race([
    rssParser.parseURL(feedUrl),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("RSS fetch timeout")), 7000)
    ),
  ]);
  const now = new Date().toISOString();

  return feed.items
    .filter((item) => {
      const text = `${item.title} ${item.contentSnippet ?? ""}`.toLowerCase();
      return keywords.some((kw) =>
        kw.toLowerCase().split(/[_\s]+/).every((word) => text.includes(word))
      );
    })
    .map((item) => ({
      id: "",
      title: item.title ?? "Untitled",
      company: extractCompany(item.title ?? ""),
      description: item.contentSnippet ?? item.content ?? "",
      url: resolveUrl(item.link ?? "", JOB_BOARD_CONFIGS[board].baseUrl),
      location: "Remote",
      source: board,
      scrapedAt: now,
      postedAt: item.pubDate ?? undefined,
      status: "new" as const,
    }));
}

// ─── JSON API ────────────────────────────────────────────────
async function scrapeJson(board: JobBoard, apiUrl: string, keywords: string[]): Promise<Job[]> {
  switch (board) {
    case "remoteok":
      return scrapeRemoteOk(apiUrl, keywords);
    case "remotive":
      return scrapeRemotive(apiUrl, keywords);
    case "jobicy":
      return scrapeJobicy(apiUrl, keywords);
    case "arbeitnow":
      return scrapeArbeitnow(apiUrl, keywords);
    case "themuse":
      return scrapeTheMuse(apiUrl, keywords);
    default:
      return [];
  }
}

async function jsonFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const res = await fetch(url, {
    headers: { "User-Agent": randomPick(USER_AGENTS) },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) =>
    kw.toLowerCase().split(/[_\s]+/).every((word) => lower.includes(word))
  );
}

async function scrapeRemoteOk(apiUrl: string, keywords: string[]): Promise<Job[]> {
  const data = await jsonFetch(apiUrl);
  const now = new Date().toISOString();
  const listings = Array.isArray(data) ? data.slice(1) : [];

  return listings
    .filter((item: any) =>
      matchesKeywords(`${item.position ?? ""} ${item.description ?? ""} ${item.tags?.join(" ") ?? ""}`, keywords)
    )
    .map((item: any) => ({
      id: "",
      title: item.position ?? "Untitled",
      company: item.company ?? "Unknown",
      description: (item.description ?? "").slice(0, 500),
      url: item.url
        ? resolveUrl(item.url, "https://remoteok.com")
        : (item.id ? `https://remoteok.com/remote-jobs/${item.id}` : ""),
      location: item.location ?? "Remote",
      salary: item.salary_min && item.salary_max ? `$${item.salary_min}-$${item.salary_max}` : undefined,
      source: "remoteok" as JobBoard,
      scrapedAt: now,
      postedAt: item.date ?? undefined,
      status: "new" as const,
    }));
}

async function scrapeRemotive(apiUrl: string, keywords: string[]): Promise<Job[]> {
  const data = await jsonFetch(apiUrl);
  const now = new Date().toISOString();
  const jobs = data?.jobs ?? [];

  return jobs
    .filter((item: any) =>
      matchesKeywords(`${item.title ?? ""} ${item.description ?? ""} ${item.tags?.join(" ") ?? ""} ${item.category ?? ""}`, keywords)
    )
    .map((item: any) => ({
      id: "",
      title: item.title ?? "Untitled",
      company: item.company_name ?? "Unknown",
      description: (item.description ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
      url: item.url ?? "",
      location: item.candidate_required_location ?? "Remote",
      salary: item.salary ?? undefined,
      source: "remotive" as JobBoard,
      scrapedAt: now,
      postedAt: item.publication_date ?? undefined,
      status: "new" as const,
    }));
}

async function scrapeJobicy(apiUrl: string, keywords: string[]): Promise<Job[]> {
  const data = await jsonFetch(apiUrl);
  const now = new Date().toISOString();
  const jobs = data?.jobs ?? [];

  return jobs
    .filter((item: any) =>
      matchesKeywords(`${item.jobTitle ?? ""} ${item.jobDescription ?? ""} ${item.jobIndustry?.join(" ") ?? ""}`, keywords)
    )
    .map((item: any) => ({
      id: "",
      title: item.jobTitle ?? "Untitled",
      company: item.companyName ?? "Unknown",
      description: (item.jobDescription ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
      url: item.url ?? "",
      location: item.jobGeo ?? "Remote",
      salary: item.annualSalaryMin && item.annualSalaryMax
        ? `$${item.annualSalaryMin}-$${item.annualSalaryMax}`
        : undefined,
      source: "jobicy" as JobBoard,
      scrapedAt: now,
      postedAt: item.pubDate ?? undefined,
      status: "new" as const,
    }));
}

async function scrapeArbeitnow(apiUrl: string, keywords: string[]): Promise<Job[]> {
  const data = await jsonFetch(apiUrl);
  const now = new Date().toISOString();
  const jobs = data?.data ?? [];

  return jobs
    .filter((item: any) =>
      matchesKeywords(`${item.title ?? ""} ${item.description ?? ""} ${item.tags?.join(" ") ?? ""}`, keywords)
    )
    .filter((item: any) => item.remote === true)
    .map((item: any) => ({
      id: "",
      title: item.title ?? "Untitled",
      company: item.company_name ?? "Unknown",
      description: (item.description ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
      url: item.url ?? "",
      location: item.location ?? "Remote",
      source: "arbeitnow" as JobBoard,
      scrapedAt: now,
      postedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : undefined,
      status: "new" as const,
    }));
}

async function scrapeTheMuse(apiUrl: string, keywords: string[]): Promise<Job[]> {
  // The Muse supports query params: ?category=Engineering&level=Senior&location=Flexible%20/%20Remote&page=0
  const url = `${apiUrl}?category=Engineering&location=Flexible%20%2F%20Remote&page=0`;
  const data = await jsonFetch(url);
  const now = new Date().toISOString();
  const results = data?.results ?? [];

  return results
    .filter((item: any) =>
      matchesKeywords(`${item.name ?? ""} ${item.contents ?? ""} ${item.categories?.join(" ") ?? ""}`, keywords)
    )
    .map((item: any) => ({
      id: "",
      title: item.name ?? "Untitled",
      company: item.company?.name ?? "Unknown",
      description: (item.contents ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
      url: item.refs?.landing_page ?? "",
      location: item.locations?.map((l: any) => l.name)?.join(", ") ?? "Remote",
      source: "themuse" as JobBoard,
      scrapedAt: now,
      postedAt: item.publication_date ?? undefined,
      status: "new" as const,
    }));
}

// ─── HTML Scraping (cheerio) ─────────────────────────────────
async function scrapeHtml(board: JobBoard, keywords: string[]): Promise<Job[]> {
  const config = JOB_BOARD_CONFIGS[board];
  const jobs: Job[] = [];
  const now = new Date().toISOString();

  try {
    const searchUrl = buildSearchUrl(board, keywords);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": randomPick(USER_AGENTS) },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn(`[Scraper] ${board} returned HTTP ${res.status}, skipping`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    switch (board) {
      case "justremote":
        $(".job-listing, .job-card, article").each((_, el) => {
          const title = $(el).find("h2, h3, .job-title").first().text().trim();
          const company = $(el).find(".company-name, .company").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          const desc = $(el).find(".description, .job-description, p").first().text().trim();
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "Unknown", description: desc,
              url: resolveUrl(url, config.baseUrl),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "dailyremote":
        $(".job-item, .job-card, article").each((_, el) => {
          const title = $(el).find("h2, h3, .title").first().text().trim();
          const company = $(el).find(".company, .employer").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          const desc = $(el).find(".description, p").first().text().trim();
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "Unknown", description: desc,
              url: resolveUrl(url, config.baseUrl),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "remoteco":
        $(".card, .job_listing, article").each((_, el) => {
          const title = $(el).find("h2, h3, .position").first().text().trim();
          const company = $(el).find(".company, .employer").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "Unknown", description: "",
              url: resolveUrl(url, config.baseUrl),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "contra":
        $("a[href*='job'], a[href*='position'], .job-card, .job-listing").each((_, el) => {
          const title = $(el).text().trim().slice(0, 200);
          const url = $(el).attr("href") ?? "";
          if (title.length > 5 && url) {
            jobs.push({
              id: "", title, company: "See listing", description: "",
              url: resolveUrl(url, config.baseUrl),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "builtin":
        $("[data-id], .job-item, .job-card").each((_, el) => {
          const title = $(el).find("h2 a, .company-title a, .job-title").first().text().trim();
          const company = $(el).find(".company-name, .company-link").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "See listing", description: "",
              url: resolveUrl(url, "https://builtin.com"),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;
    }
  } catch (error) {
    console.error(`[Scraper] HTML scraping failed for ${board}:`, error);
  }

  return jobs;
}

function buildSearchUrl(board: JobBoard, keywords: string[]): string {
  const config = JOB_BOARD_CONFIGS[board];
  const query = keywords[0]?.replace(/[_]/g, "+") ?? "developer";

  switch (board) {
    case "justremote":
      return `${config.baseUrl}/remote-developer-jobs?search=${encodeURIComponent(query)}`;
    case "dailyremote":
      return `${config.baseUrl}/jobs/search?query=${encodeURIComponent(query)}`;
    case "remoteco":
      return `${config.baseUrl}/remote-jobs/developer/?search=${encodeURIComponent(query)}`;
    case "contra":
      return `${config.baseUrl}/search/projects?query=${encodeURIComponent(query)}`;
    case "builtin":
      return `https://builtin.com/jobs/remote?search=${encodeURIComponent(query)}`;
    default:
      return config.baseUrl;
  }
}

function extractCompany(title: string): string {
  // Many RSS titles are "Company: Job Title" or "Job Title at Company"
  if (title.includes(":")) return title.split(":")[0].trim();
  if (title.toLowerCase().includes(" at ")) {
    return title.split(/ at /i).slice(-1)[0].trim();
  }
  return "Unknown";
}
