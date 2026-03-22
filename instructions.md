You are a senior full-stack developer and automation expert building a personal job application automation web app in 2026.

Project goal:
Create a responsive web application (Next.js 14+, TypeScript, Tailwind CSS) that helps a senior software engineer automate job applications to remote US jobs ONLY.
Focus: 100% remote, no security clearance, no special US-person requirements, no on-site.
Exclude LinkedIn and Indeed completely.

Key features:
1. User uploads 2–8 different resumes (PDF) targeted to roles (e.g. C#_AWS_Angular,Python_AWS_React, C#_Azure_React).
2. Connects to user's Gmail via Google OAuth2 (read inbox for application replies, optional send).
3. Allows user to input job search keywords (e.g. "senior python remote", "Java_AWS_Angular").
4. Scrapes / searches selected job boards: We Work Remotely, Remote OK, NoDesk, JustRemote, DailyRemote, Remote.co, Wellfound, Contra (add RSS/JSON feeds where possible, fallback to Playwright scraping).
5. For each job listing:
   - Parse: title, company, description, URL, location ("100% remote"), salary if available
   - Filter aggressively:
     - Must contain "remote", "100% remote", "work from anywhere"
     - Must NOT contain: security clearance, TS/SCI, secret clearance, US citizen only, background check required, on-site, hybrid, visa sponsorship needed (unless remote ok), government, defense
   - AI analyzes fit: match user's skills/experience vs job requirements (use embeddings or simple keyword + GPT-4o-mini prompt)
   - If good fit (score > 75%): generate tailored cover letter / proposal using the most suitable resume
6. Shows dashboard: list of filtered jobs with
   - Title, company, URL, fit score
   - Generated cover message
   - Buttons: Skip, Edit cover, Apply Now (triggers Playwright to fill form)
7. Application flow (semi-automated):
   - Open browser (headless=false for safety), go to job URL
   - Auto-fill name, email, phone, LinkedIn/GitHub if present
   - Attach correct resume PDF
   - Paste generated cover
   - Click apply/submit — but PAUSE for user to solve CAPTCHA / final check if needed
8. Logs every action to SQLite: job title, URL, timestamp, status (applied/skipped/failed), notes
9. Export log to Excel (exceljs) with columns: Date, Job Title, Company, URL, Resume Used, Cover Snippet, Status, Notes
10. Strong anti-detection: use playwright-extra + stealth plugin, random user-agents, delays, no parallel browsers >1

Important rules:
- Never apply fully automatically without user confirmation per batch (max 100–200 jobs per run)
- Respect robots.txt where possible
- Add config to limit daily applies (default 200)
- Handle errors gracefully (banned, form changed, etc.)
- Make UI/UX clean, responsive (mobile-friendly for checking on phone)

Generate project structure first, then implement step-by-step:
- /app (Next.js app router)
- /components (JobCard, ResumeUploader, GmailConnect, etc.)
- /lib/playwright.ts (browser automation helpers)
- /lib/ai.ts (OpenAI client for tailoring)
- /api/routes for backend logic

Start by creating package.json dependencies and folder structure.
Use best practices 2026: app router, server actions, TypeScript strict, error boundaries.