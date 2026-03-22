import { chromium as playwrightChromium, type Browser, type Page, type BrowserContext } from "playwright";
import { chromium as stealthChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import fs from "fs";
import type { Job, UserProfile, Resume, JobBoard } from "./types";
import { USER_AGENTS, DELAY_RANGE, PAGE_LOAD_TIMEOUT, JOB_BOARD_CONFIGS } from "./constants";
import { randomPick, randomDelay } from "./utils";

// Apply stealth plugin
stealthChromium.use(StealthPlugin());

// ─── Paths ───────────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const FORM_MAPS_PATH = path.join(DATA_DIR, "form-maps.json");
const BROWSER_PROFILE_DIR = path.join(DATA_DIR, "browser-profile");

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;
let currentSessionBoard: string | null = null;

// ─── Session Management ──────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getSessionPath(board: string): string {
  ensureDir(SESSIONS_DIR);
  return path.join(SESSIONS_DIR, `${board}.json`);
}

function hasSession(board: string): boolean {
  return fs.existsSync(getSessionPath(board));
}

/** Get all boards that have saved login sessions */
export function getSavedSessions(): string[] {
  ensureDir(SESSIONS_DIR);
  return fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

/** Save the current browser context's cookies/storage as a session for a board */
export async function saveSession(board: string): Promise<void> {
  if (!contextInstance) return;
  const state = await contextInstance.storageState();
  fs.writeFileSync(getSessionPath(board), JSON.stringify(state, null, 2));
  console.log(`[Session] Saved login session for ${board}`);
}

/** Delete a saved session */
export function deleteSession(board: string): void {
  const p = getSessionPath(board);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── Form Map (learned form structures) ──────────────────────

interface FormFieldMap {
  /** CSS selector → field purpose (name, email, phone, linkedin, github, portfolio, cover, resume) */
  [selector: string]: string;
}

interface FormMaps {
  [domain: string]: FormFieldMap;
}

function loadFormMaps(): FormMaps {
  if (fs.existsSync(FORM_MAPS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(FORM_MAPS_PATH, "utf-8"));
    } catch { /* corrupted, start fresh */ }
  }
  return {};
}

function saveFormMaps(maps: FormMaps): void {
  ensureDir(DATA_DIR);
  fs.writeFileSync(FORM_MAPS_PATH, JSON.stringify(maps, null, 2));
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

// ─── Browser Launch ──────────────────────────────────────────

/**
 * Launch a browser with anti-detection measures.
 * Uses the user's installed Chrome (not Chromium) + stealth plugin.
 * If a board is specified and has a saved session, loads that session.
 */
export async function launchBrowser(board?: string): Promise<BrowserContext> {
  // If we already have a context for the same board, reuse it
  if (contextInstance) {
    // Verify the context is still alive
    try {
      contextInstance.pages(); // throws if closed/crashed
      if (currentSessionBoard === (board ?? null)) return contextInstance;
    } catch {
      // Context is dead — clean up references
      contextInstance = null;
      browserInstance = null;
    }
  }

  // Close existing context if switching boards
  if (contextInstance) {
    if (currentSessionBoard) {
      try { await saveSession(currentSessionBoard); } catch { /* ignore */ }
    }
    try { await contextInstance.close(); } catch { /* already closed */ }
    contextInstance = null;
    browserInstance = null;
  }

  ensureDir(BROWSER_PROFILE_DIR);

  // Clean up stale lock files that prevent relaunch after crash
  const lockFile = path.join(BROWSER_PROFILE_DIR, "SingletonLock");
  const lockFile2 = path.join(BROWSER_PROFILE_DIR, "SingletonCookie");
  const lockFile3 = path.join(BROWSER_PROFILE_DIR, "SingletonSocket");
  for (const lf of [lockFile, lockFile2, lockFile3]) {
    try { if (fs.existsSync(lf)) fs.unlinkSync(lf); } catch { /* ignore */ }
  }

  const ua = randomPick(USER_AGENTS);

  const launchArgs = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--window-size=1366,768",
    "--disable-features=IsolateOrigins,site-per-process",
  ];

  // Try to use the user's real Chrome via channel: 'chrome'.
  // This avoids the Chromium bot detection fingerprint.
  try {
    contextInstance = await stealthChromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      args: launchArgs,
      userAgent: ua,
      viewport: { width: 1366, height: 768 },
      locale: "en-US",
      timezoneId: "America/New_York",
      ignoreDefaultArgs: ["--enable-automation"],
    });
    console.log("[Browser] Launched with real Chrome + stealth");
  } catch (err) {
    console.warn("[Browser] Real Chrome not available, falling back to Chromium + stealth:", String(err));
    try {
      contextInstance = await stealthChromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
        headless: false,
        args: launchArgs,
        userAgent: ua,
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/New_York",
        ignoreDefaultArgs: ["--enable-automation"],
      });
    } catch (err2) {
      // If persistent context fails, fall back to regular launch
      console.warn("[Browser] Persistent context failed, using regular browser:", String(err2));
      const browser = await stealthChromium.launch({
        headless: false,
        args: launchArgs,
      });
      browserInstance = browser;
      contextInstance = await browser.newContext({
        userAgent: ua,
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });
    }
  }

  currentSessionBoard = board ?? null;

  // Inject saved session cookies if available
  if (board) {
    const sessionPath = getSessionPath(board);
    if (fs.existsSync(sessionPath)) {
      try {
        const state = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
        if (state.cookies?.length) {
          await contextInstance.addCookies(state.cookies);
          console.log(`[Session] Loaded saved session for ${board}`);
        }
      } catch { /* corrupted session file, ignore */ }
    }
  }

  // Additional anti-detection overrides on top of stealth plugin
  await contextInstance.addInitScript(() => {
    // Ensure webdriver property is false
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // Mock Chrome runtime
    // @ts-ignore
    if (!window.chrome) window.chrome = {};
    // @ts-ignore
    window.chrome.runtime = window.chrome.runtime || {};
    // Set realistic plugin count
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    // Realistic languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
    // Override permissions query for notifications
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.query = (params: any) =>
      params.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(params);
  });

  return contextInstance;
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    if (currentSessionBoard) {
      try { await saveSession(currentSessionBoard); } catch { /* ignore if already closed */ }
    }
    try { await contextInstance.close(); } catch { /* already closed */ }
    contextInstance = null;
    currentSessionBoard = null;
  }
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* already closed */ }
    browserInstance = null;
  }
}

// ─── Manual Login Flow ───────────────────────────────────────

/**
 * Open a browser to a board's login page so the user can log in manually.
 * Uses real Chrome so Google SSO works. Waits for user to complete login + CAPTCHA.
 * After login, saves the session for future automated use.
 */
export async function manualLogin(board: JobBoard): Promise<{ success: boolean; message: string }> {
  const config = JOB_BOARD_CONFIGS[board];
  if (!config.loginUrl) {
    return { success: false, message: `${config.name} does not have a login URL configured.` };
  }

  const context = await launchBrowser(board);
  const page = await context.newPage();

  try {
    await page.goto(config.loginUrl, { waitUntil: "domcontentloaded", timeout: PAGE_LOAD_TIMEOUT });

    console.log(`[Login] Browser opened for ${config.name}. Please:`);
    console.log(`  1. Log in with your credentials (email/password or Google)`);
    console.log(`  2. Solve any CAPTCHA that appears`);
    console.log(`  3. Wait until you see the dashboard/home page`);
    console.log(`  → Session will be saved automatically.`);

    // Wait up to 10 minutes for user to complete login + CAPTCHA
    // Detect success by: URL no longer on login/auth pages, OR logged-in indicators appear
    await page.waitForFunction(
      (loginUrl: string) => {
        const url = window.location.href.toLowerCase();
        const loginKeywords = ["login", "sign_in", "signin", "auth", "captcha", "challenge", "verify"];
        const stillOnLogin = loginKeywords.some((kw) => url.includes(kw)) || url === loginUrl.toLowerCase();
        if (!stillOnLogin) return true;
        // Also check for logged-in indicators on the page
        const loggedIn = document.querySelector(
          'a[href*="logout"], a[href*="sign_out"], a[href*="signout"], ' +
          '[class*="avatar"], [class*="user-menu"], [class*="profile"], ' +
          '[data-testid="user-menu"], [class*="account"], [class*="dashboard"]'
        );
        return !!loggedIn;
      },
      config.loginUrl,
      { timeout: 600000 }
    ).catch(() => {
      // Timeout is OK — user might have logged in but page didn't trigger detection
    });

    // Save the session
    await saveSession(board);

    return { success: true, message: `Logged in to ${config.name}. Session saved for future use.` };
  } catch (error) {
    return { success: false, message: `Login flow error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ─── CAPTCHA Detection & Wait ────────────────────────────────

/**
 * Detect if a CAPTCHA or human verification is present on the page.
 * If found, wait for the user to solve it (up to 5 minutes).
 */
async function waitForCaptchaIfPresent(page: Page): Promise<void> {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="captcha"]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    '#challenge-running',
    '#challenge-stage',
    '.cf-turnstile',
    '[data-sitekey]',
    'iframe[src*="challenges.cloudflare"]',
  ];

  let hasCaptcha = false;
  for (const sel of captchaSelectors) {
    try {
      if (await page.locator(sel).count() > 0) {
        hasCaptcha = true;
        break;
      }
    } catch { /* ignore */ }
  }

  if (!hasCaptcha) return;

  console.log("[CAPTCHA] Detected! Please solve it in the browser window...");

  // Wait up to 5 minutes for the CAPTCHA to disappear
  try {
    await page.waitForFunction(() => {
      const selectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        '[class*="captcha" i]',
        '#challenge-running',
        '#challenge-stage',
        '.cf-turnstile',
      ];
      for (const sel of selectors) {
        if (document.querySelector(sel)) return false;
      }
      return true;
    }, undefined, { timeout: 300000 });
    console.log("[CAPTCHA] Solved! Continuing...");
    await randomDelay(1000, 2000);
  } catch {
    console.log("[CAPTCHA] Timeout waiting for solution, continuing anyway...");
  }
}

// ─── Smart Form Fill (learns form structure per site) ────────

/**
 * Auto-fill + learn: first tries learned selectors for this domain,
 * then falls back to heuristic matching, and saves what worked.
 */
export async function autoFillApplication(
  job: Job,
  profile: UserProfile,
  resume: Resume,
  coverLetter: string
): Promise<{ page: Page; success: boolean; message: string }> {
  const board = job.source;
  const context = await launchBrowser(board);
  const page = await context.newPage();
  const formMaps = loadFormMaps();
  const newMap: FormFieldMap = {};

  try {
    // Listen for popup/new tab — some "Apply" buttons open a new tab
    // (e.g. RemoteOK → Ashby, Greenhouse, Lever external ATS)
    const popupPages: Page[] = [];
    const pageHandler = (p: Page) => { popupPages.push(p); };
    context.on("page", pageHandler);

    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: PAGE_LOAD_TIMEOUT });
    await randomDelay(DELAY_RANGE.min, DELAY_RANGE.max);

    // Check for CAPTCHA before proceeding
    await waitForCaptchaIfPresent(page);

    // Check if we need login
    const isLoginPage = await detectLoginPage(page);
    if (isLoginPage) {
      if (hasSession(board)) {
        // Reload with session
        await page.close();
        const freshContext = await launchBrowser(board);
        const freshPage = await freshContext.newPage();
        await freshPage.goto(job.url, { waitUntil: "domcontentloaded", timeout: PAGE_LOAD_TIMEOUT });
        await randomDelay(1000, 2000);
        const d = getDomain(job.url);
        return autoFillOnPage(freshPage, profile, resume, coverLetter, d, formMaps[d] ?? {}, newMap, formMaps);
      } else {
        return { page, success: false, message: `${JOB_BOARD_CONFIGS[board]?.name ?? board} requires login. Go to Settings → Job Boards → click "Login" to save your session first.` };
      }
    }

    // Try to find and click "Apply" button on the job page
    const applyButton = await findApplyButton(page);
    if (applyButton) {
      await applyButton.click();

      // Wait for new tab or navigation — external ATS sites (Ashby, Greenhouse, Lever)
      // may take a few seconds to redirect through multiple hops
      await randomDelay(2000, 4000);

      // If a new tab was opened, switch to it and wait for it to fully load
      if (popupPages.length > 0) {
        const targetPage = popupPages[popupPages.length - 1];
        try {
          await targetPage.waitForLoadState("domcontentloaded", { timeout: 15000 });
          await randomDelay(1500, 3000);
          await targetPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        } catch { /* might already be loaded */ }
        // Check for CAPTCHA on the new tab
        await waitForCaptchaIfPresent(targetPage);
        const targetDomain = getDomain(targetPage.url());
        const learnedMap = formMaps[targetDomain] ?? {};
        context.off("page", pageHandler);
        return autoFillOnPage(targetPage, profile, resume, coverLetter, targetDomain, learnedMap, newMap, formMaps);
      }

      // No new tab — check if the current page navigated (e.g. same-tab redirect)
      try {
        await page.waitForLoadState("networkidle", { timeout: 8000 });
      } catch { /* timeout OK */ }

      // Check for CAPTCHA after navigation
      await waitForCaptchaIfPresent(page);
    }

    context.off("page", pageHandler);

    // Fill on the current page (might have navigated after clicking Apply)
    const currentDomain = getDomain(page.url());
    const learnedMap = formMaps[currentDomain] ?? {};
    return autoFillOnPage(page, profile, resume, coverLetter, currentDomain, learnedMap, newMap, formMaps);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Playwright] Auto-fill error:", errMsg);
    return { page, success: false, message: `Auto-fill partially failed: ${errMsg}. Please fill remaining fields manually.` };
  }
}

async function autoFillOnPage(
  page: Page,
  profile: UserProfile,
  resume: Resume,
  coverLetter: string,
  domain: string,
  learnedMap: FormFieldMap,
  newMap: FormFieldMap,
  formMaps: FormMaps
): Promise<{ page: Page; success: boolean; message: string }> {
  // 1) Try learned selectors first
  for (const [selector, purpose] of Object.entries(learnedMap)) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 })) {
        const value = getValueForPurpose(purpose, profile, coverLetter);
        if (value) {
          if (purpose === "resume") {
            await el.setInputFiles(resume.filePath);
          } else {
            await el.clear();
            await el.type(value, { delay: 40 + Math.random() * 80 });
          }
          await randomDelay(200, 500);
        }
      }
    } catch {
      // Learned selector no longer works, skip
    }
  }

  // 2) Heuristic fill and learn
  const fieldDefs: { purpose: string; patterns: string[]; value: string }[] = [
    { purpose: "name", patterns: ["name", "full_name", "fullName", "applicant_name", "first_name", "your_name"], value: profile.fullName },
    { purpose: "email", patterns: ["email", "applicant_email", "email_address", "your_email"], value: profile.email },
    { purpose: "phone", patterns: ["phone", "phone_number", "telephone", "mobile", "cell"], value: profile.phone },
    { purpose: "linkedin", patterns: ["linkedin", "linkedin_url", "linked_in", "linkedin_profile"], value: profile.linkedinUrl ?? "" },
    { purpose: "github", patterns: ["github", "github_url", "github_profile"], value: profile.githubUrl ?? "" },
    { purpose: "portfolio", patterns: ["portfolio", "website", "personal_site", "portfolio_url", "personal_website"], value: profile.portfolioUrl ?? "" },
  ];

  for (const { purpose, patterns, value } of fieldDefs) {
    if (!value) continue;
    const filled = await tryFillFieldAndLearn(page, patterns, value, newMap, purpose);
    if (!filled) {
      // Try by label text as fallback
      await tryFillByLabel(page, purpose, value, newMap);
    }
  }

  // Cover letter
  await tryFillTextareaAndLearn(page, ["cover_letter", "cover", "message", "motivation", "about", "introduction", "why_interested"], coverLetter, newMap);

  // Resume upload
  await tryAttachFileAndLearn(page, resume.filePath, newMap);

  // 3) Save what we learned
  if (Object.keys(newMap).length > 0) {
    formMaps[domain] = { ...learnedMap, ...newMap };
    saveFormMaps(formMaps);
    console.log(`[FormMap] Learned ${Object.keys(newMap).length} new selectors for ${domain}`);
  }

  // Save session after successful fill
  if (currentSessionBoard) {
    await saveSession(currentSessionBoard);
  }

  return { page, success: true, message: "Form pre-filled. Please review and submit manually (solve CAPTCHA if needed)." };
}

function getValueForPurpose(purpose: string, profile: UserProfile, coverLetter: string): string {
  switch (purpose) {
    case "name": return profile.fullName;
    case "email": return profile.email;
    case "phone": return profile.phone;
    case "linkedin": return profile.linkedinUrl ?? "";
    case "github": return profile.githubUrl ?? "";
    case "portfolio": return profile.portfolioUrl ?? "";
    case "cover": return coverLetter;
    default: return "";
  }
}

async function detectLoginPage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("/login") || url.includes("/auth") || url.includes("/signin") || url.includes("/sign-in")) {
    return true;
  }
  try {
    const hasLoginForm = await page.locator('input[type="password"]').count();
    return hasLoginForm > 0;
  } catch {
    return false;
  }
}

// ─── Apply Button Detection ─────────────────────────────────

async function findApplyButton(page: Page) {
  const selectors = [
    'button:has-text("Apply")',
    'a:has-text("Apply")',
    'button:has-text("Submit Application")',
    'a:has-text("Apply Now")',
    'a:has-text("Apply for this")',
    'a:has-text("Easy Apply")',
    'button:has-text("Easy Apply")',
    'button:has-text("Quick Apply")',
    '[data-action="apply"]',
    ".apply-button",
    "#apply-button",
    ".jobs-apply-button",
    '[data-control-name="jobdetail_applybutton"]',
  ];

  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        return el;
      }
    } catch {
      // Try next
    }
  }
  return null;
}

// ─── Field Fill with Learning ────────────────────────────────

async function tryFillFieldAndLearn(
  page: Page, patterns: string[], value: string, newMap: FormFieldMap, purpose: string
): Promise<boolean> {
  for (const pattern of patterns) {
    const selectors = [
      `input[name*="${pattern}" i]`,
      `input[id*="${pattern}" i]`,
      `input[placeholder*="${pattern}" i]`,
      `input[aria-label*="${pattern}" i]`,
      `input[autocomplete*="${pattern}" i]`,
    ];

    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 })) {
          await el.clear();
          await el.type(value, { delay: 40 + Math.random() * 80 });
          await randomDelay(200, 500);
          newMap[selector] = purpose;
          return true;
        }
      } catch {
        // Try next
      }
    }
  }
  return false;
}

/** Try filling by visible label text — works on many ATS forms */
async function tryFillByLabel(page: Page, purpose: string, value: string, newMap: FormFieldMap): Promise<boolean> {
  const labelTexts: Record<string, string[]> = {
    name: ["Full Name", "Name", "Your Name"],
    email: ["Email", "Email Address", "Your Email"],
    phone: ["Phone", "Phone Number", "Mobile"],
    linkedin: ["LinkedIn", "LinkedIn URL", "LinkedIn Profile"],
    github: ["GitHub", "GitHub URL"],
    portfolio: ["Portfolio", "Website", "Personal Website"],
  };

  const labels = labelTexts[purpose] ?? [];
  for (const text of labels) {
    try {
      const label = page.locator(`label:has-text("${text}")`).first();
      if (await label.isVisible({ timeout: 300 })) {
        const forAttr = await label.getAttribute("for");
        if (forAttr) {
          const input = page.locator(`#${forAttr}`);
          if (await input.isVisible({ timeout: 300 })) {
            await input.clear();
            await input.type(value, { delay: 40 + Math.random() * 80 });
            newMap[`#${forAttr}`] = purpose;
            return true;
          }
        }
        // Try next sibling input
        const siblingInput = label.locator("~ input, + input, input").first();
        if (await siblingInput.count() > 0) {
          await siblingInput.clear();
          await siblingInput.type(value, { delay: 40 + Math.random() * 80 });
          return true;
        }
      }
    } catch {
      // Try next
    }
  }
  return false;
}

async function tryFillTextareaAndLearn(
  page: Page, patterns: string[], value: string, newMap: FormFieldMap
): Promise<void> {
  for (const pattern of patterns) {
    const selectors = [
      `textarea[name*="${pattern}" i]`,
      `textarea[id*="${pattern}" i]`,
      `textarea[placeholder*="${pattern}" i]`,
      `textarea[aria-label*="${pattern}" i]`,
    ];

    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 })) {
          await el.clear();
          await el.type(value, { delay: 25 + Math.random() * 50 });
          await randomDelay(200, 500);
          newMap[selector] = "cover";
          return;
        }
      } catch {
        // Try next
      }
    }
  }

  // Fallback: any visible textarea
  try {
    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible({ timeout: 500 })) {
      await textarea.clear();
      await textarea.type(value, { delay: 25 + Math.random() * 50 });
    }
  } catch {
    // No textarea
  }
}

async function tryAttachFileAndLearn(page: Page, filePath: string, newMap: FormFieldMap): Promise<void> {
  const selectors = [
    'input[type="file"]',
    'input[name*="resume" i]',
    'input[name*="cv" i]',
    'input[accept=".pdf"]',
    'input[accept*="pdf"]',
    'input[name*="attachment" i]',
  ];

  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      const count = await el.count();
      if (count > 0) {
        await el.setInputFiles(filePath);
        await randomDelay(500, 1500);
        newMap[selector] = "resume";
        return;
      }
    } catch {
      // Try next
    }
  }
}

// ─── Login-Required Board Scraping ───────────────────────────

/**
 * Scrape jobs from a login-required board using saved session.
 * Opens a browser with the saved session, navigates to search results, extracts jobs.
 */
export async function scrapeWithSession(
  board: JobBoard, keywords: string[]
): Promise<Job[]> {
  if (!hasSession(board)) {
    console.log(`[Scraper] No saved session for ${board}, skipping.`);
    return [];
  }

  const config = JOB_BOARD_CONFIGS[board];
  const context = await launchBrowser(board);
  const page = await context.newPage();
  const jobs: Job[] = [];
  const now = new Date().toISOString();
  const query = keywords[0]?.replace(/[_]/g, " ") ?? "software engineer";

  try {
    switch (board) {
      case "glassdoor": {
        const url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(query)}&remoteWorkType=1`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_LOAD_TIMEOUT });
        await randomDelay(3000, 5000);

        // Wait for CAPTCHA if Glassdoor shows one
        await waitForCaptchaIfPresent(page);

        const cards = page.locator("[data-test='jobListing'], .JobsList_jobListItem__JBBUQ, li[data-id]");
        const count = Math.min(await cards.count(), 25);

        for (let i = 0; i < count; i++) {
          try {
            const card = cards.nth(i);
            const title = await card.locator("a[data-test='job-link'], .JobCard_jobTitle__GLyJ1, .job-title").first().textContent() ?? "";
            const company = await card.locator(".EmployerProfile_compactEmployerName__9MGcV, .job-search-company-name, .employer-name").first().textContent() ?? "";
            const link = await card.locator("a").first().getAttribute("href") ?? "";
            const fullUrl = link.startsWith("http") ? link : (link.startsWith("//") ? `https:${link}` : (link.startsWith("/") ? `https://www.glassdoor.com${link}` : link));

            if (title.trim()) {
              jobs.push({
                id: "", title: title.trim(), company: company.trim() || "Unknown",
                description: "", url: fullUrl,
                location: "Remote", source: board, scrapedAt: now, status: "new",
              });
            }
          } catch { /* skip card */ }
        }
        break;
      }
    }

    // Save updated session
    await saveSession(board);
  } catch (error) {
    console.error(`[Scraper] Session scraping failed for ${board}:`, error);
  } finally {
    await page.close();
  }

  return jobs;
}
