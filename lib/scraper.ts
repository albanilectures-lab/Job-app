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

  log("initDb start");
  await initDb();
  log("initDb done");
  const allJobs: Job[] = [];

  const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  // On serverless, skip login-required boards (need Playwright) and enforce a deadline
  const DEADLINE_MS = IS_SERVERLESS ? 22000 : 120000;

  // Filter boards for serverless compatibility
  const activeBoards = IS_SERVERLESS
    ? boards.filter((b) => JOB_BOARD_CONFIGS[b].type !== "login-required")
    : boards;

  log(`serverless=${IS_SERVERLESS}, boards=${activeBoards.join(",")} (${activeBoards.length}/${boards.length}), keywords=${keywords.length}`);

  for (const board of activeBoards) {
    // Check deadline — return what we have so far
    if (Date.now() - startTime > DEADLINE_MS) {
      log(`deadline reached (${DEADLINE_MS}ms), returning ${allJobs.length} jobs collected so far`);
      break;
    }
    try {
      log(`fetching ${board}...`);
      const jobs = await scrapeBoard(board, keywords);
      log(`${board}: got ${jobs.length} jobs`);
      allJobs.push(...jobs);
      // Shorter delay on serverless to avoid function timeout
      await sleep(IS_SERVERLESS ? 100 : 2000 + Math.random() * 3000);
    } catch (error) {
      log(`${board} ERROR: ${error}`);
    }
  }

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

// ─── JSON API (Remote OK) ────────────────────────────────────
async function scrapeJson(board: JobBoard, apiUrl: string, keywords: string[]): Promise<Job[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const res = await fetch(apiUrl, {
    headers: { "User-Agent": randomPick(USER_AGENTS) },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) throw new Error(`HTTP ${res.status} from ${apiUrl}`);
  const data = await res.json();
  const now = new Date().toISOString();

  // Remote OK returns array, first item is metadata
  const listings = Array.isArray(data) ? data.slice(1) : [];

  return listings
    .filter((item: any) => {
      const text = `${item.position ?? ""} ${item.description ?? ""} ${item.tags?.join(" ") ?? ""}`.toLowerCase();
      return keywords.some((kw) =>
        kw.toLowerCase().split(/[_\s]+/).every((word) => text.includes(word))
      );
    })
    .map((item: any) => ({
      id: "",
      title: item.position ?? "Untitled",
      company: item.company ?? "Unknown",
      description: item.description ?? "",
      url: item.url
        ? resolveUrl(item.url, "https://remoteok.com")
        : (item.id ? `https://remoteok.com/remote-jobs/${item.id}` : ""),
      location: item.location ?? "Remote",
      salary: item.salary_min && item.salary_max ? `$${item.salary_min}-$${item.salary_max}` : undefined,
      source: board,
      scrapedAt: now,
      postedAt: item.date ?? undefined,
      status: "new" as const,
    }));
}

// ─── HTML Scraping (Playwright fallback) ─────────────────────
async function scrapeHtml(board: JobBoard, keywords: string[]): Promise<Job[]> {
  const config = JOB_BOARD_CONFIGS[board];
  const jobs: Job[] = [];
  const now = new Date().toISOString();

  try {
    // Use fetch + cheerio for lighter scraping first
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

      case "nodesk":
      case "wellfound":
      case "contra":
        // Generic scraper for boards with varying structures
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

      case "dice":
        $(".card, [data-cy='search-card'], .diceSearchResultPage-card").each((_, el) => {
          const title = $(el).find("a.card-title-link, h5 a, [data-cy='card-title']").first().text().trim();
          const company = $(el).find("[data-cy='search-result-company-name'], .card-company a").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "See listing", description: "",
              url: resolveUrl(url, config.baseUrl),
              location: "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "ziprecruiter":
        $(".job_result, .job_content, article").each((_, el) => {
          const title = $(el).find(".job_title, h2 a, .title").first().text().trim();
          const company = $(el).find(".t_org_link, .company_name, .hiring_company").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          if (title && url) {
            jobs.push({
              id: "", title, company: company || "See listing", description: "",
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

      case "greenhouse":
        $(".opening, .job-post, [data-mapped='true']").each((_, el) => {
          const title = $(el).find("a").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? "";
          const location = $(el).find(".location, span").last().text().trim();
          if (title && url) {
            jobs.push({
              id: "", title, company: "See listing", description: "",
              url: resolveUrl(url, "https://boards.greenhouse.io"),
              location: location || "Remote", source: board, scrapedAt: now, status: "new",
            });
          }
        });
        break;

      case "lever":
        $(".posting, .posting-title").each((_, el) => {
          const title = $(el).find("h5, a").first().text().trim();
          const url = $(el).find("a").first().attr("href") ?? $(el).closest("a").attr("href") ?? "";
          const location = $(el).find(".posting-categories .location, .workplaceTypes").first().text().trim();
          if (title && url) {
            jobs.push({
              id: "", title, company: "See listing", description: "",
              url: resolveUrl(url, "https://jobs.lever.co"),
              location: location || "Remote", source: board, scrapedAt: now, status: "new",
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
    case "nodesk":
      return `${config.baseUrl}/remote-jobs/?search=${encodeURIComponent(query)}`;
    case "wellfound":
      return `${config.baseUrl}/role/r/software-engineer`;
    case "contra":
      return `${config.baseUrl}/search/projects?query=${encodeURIComponent(query)}`;
    case "dice":
      return `https://www.dice.com/jobs?q=${encodeURIComponent(query)}&location=Remote&radius=30&radiusUnit=mi&page=1&pageSize=20&filters.isRemote=true`;
    case "ziprecruiter":
      return `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(query)}&location=Remote`;
    case "builtin":
      return `https://builtin.com/jobs/remote?search=${encodeURIComponent(query)}`;
    case "greenhouse":
      return `https://boards.greenhouse.io/search?query=${encodeURIComponent(query)}`;
    case "lever":
      return `https://jobs.lever.co/search?query=${encodeURIComponent(query)}`;
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
