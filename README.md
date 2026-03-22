# Job Application Automation

A full-stack web application that automates the job application process for remote positions. Built with Next.js, TypeScript, Tailwind CSS, and Playwright.

## Features

- **Multi-Board Job Scraping** — Scrapes jobs from 8+ remote job boards (We Work Remotely, Remote OK, NoDesk, JustRemote, DailyRemote, Remote.co, Wellfound, Contra) using RSS, JSON APIs, and HTML parsing
- **AI-Powered Job Matching** — Uses OpenAI GPT-4o-mini to score job fit (0–100), select the best resume, and generate tailored cover letters
- **Smart Filtering** — Automatically excludes non-remote, clearance-required, hybrid, and on-site positions
- **Browser Automation** — Playwright-based auto-fill for job applications with anti-detection (stealth plugin, rotating user agents, random delays)
- **Resume Management** — Upload 2–8 targeted PDF resumes with labels and skill tags
- **Gmail Integration** — OAuth2 connection to monitor inbox for application replies
- **Excel Export** — Export application logs to styled XLSX spreadsheets
- **SQLite Database** — Persistent local storage using sql.js (pure JS/WASM)
- **Daily Apply Limits** — Configurable daily application cap (default: 200)
- **Responsive UI** — Mobile-friendly dashboard built with Tailwind CSS

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | sql.js (SQLite via WASM) |
| AI | OpenAI GPT-4o-mini |
| Scraping | Cheerio, RSS Parser, Playwright |
| Browser Automation | Playwright + Stealth Plugin |
| Email | Google Gmail API (OAuth2) |
| Export | ExcelJS |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/albanilectures-lab/Job-app.git
cd Job-app
npm install
```

### Environment Setup

Create a `.env.local` file in the root directory:

```env
OPENAI_API_KEY=your-openai-api-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
```

### Install Playwright Browser

```bash
npx playwright install chromium
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
  page.tsx                → Landing page
  dashboard/page.tsx      → Job list + actions
  settings/page.tsx       → Profile, resumes, config, Gmail
  api/
    jobs/route.ts         → Job listing & scraping
    apply/route.ts        → Playwright auto-fill
    resumes/route.ts      → Resume CRUD
    settings/route.ts     → Profile & search config
    gmail/route.ts        → Gmail status/auth/replies
    gmail/callback/       → OAuth2 redirect handler
    export/route.ts       → Excel download
    sessions/route.ts     → Browser session management
lib/
    db.ts                 → sql.js SQLite database
    ai.ts                 → OpenAI integration
    scraper.ts            → Multi-board job scraper
    filters.ts            → Job filtering logic
    playwright.ts         → Browser automation
    gmail.ts              → Google OAuth2 + inbox scanning
    excel.ts              → ExcelJS export
    constants.ts          → Board configs, user agents
    utils.ts              → Helper functions
    types.ts              → TypeScript interfaces
components/
    JobCard.tsx           → Expandable job card
    ResumeUploader.tsx    → Drag-drop PDF upload
    ProfileForm.tsx       → User profile form
    SearchConfigPanel.tsx → Search & board config
    StatsBar.tsx          → Dashboard statistics
    GmailConnect.tsx      → Gmail OAuth connection
    ErrorBoundary.tsx     → React error boundary
```

## Usage

1. **Settings** — Fill in your profile (name, email, skills), upload resumes, configure search keywords and job boards
2. **Dashboard** — Click "Scrape Jobs" to pull listings from selected boards
3. **AI Analysis** — Click "Analyze" to score jobs and generate cover letters (requires OpenAI API key)
4. **Apply** — Review matches, edit cover letters, and click "Apply Now" to auto-fill applications
5. **Export** — Download your application log as an Excel file

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Max Daily Applies | 200 | Maximum applications per day |
| Min Fit Score | 75 | Minimum AI match score to recommend |
| Job Boards | All enabled | Select which boards to scrape |

## License

MIT
