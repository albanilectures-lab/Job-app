// ─── Background Service Worker ────────────────────────────────
// Handles API calls to the JobPilot app on behalf of popup and content scripts.
// Runs as MV3 service worker. Keeps data cached via chrome.alarms.

const REFRESH_ALARM = "refresh-data";
const REFRESH_INTERVAL_MIN = 5;

// ─── Alarms: periodic data refresh ──────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MIN });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MIN });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshCachedData();
  }
});

async function refreshCachedData() {
  try {
    const stored = await chrome.storage.local.get(["appUrl", "sessionCookie"]);
    if (!stored.appUrl || !stored.sessionCookie) return;

    const base = stored.appUrl;
    const headers = { "X-Session": stored.sessionCookie };

    const [settingsRes, resumesRes, screeningRes] = await Promise.all([
      fetch(`${base}/api/settings`, { headers }),
      fetch(`${base}/api/resumes`, { headers }),
      fetch(`${base}/api/screening`, { headers }),
    ]);

    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      if (settingsData.success) {
        await chrome.storage.local.set({ cachedProfile: settingsData.data.profile });
      }
    }
    if (resumesRes.ok) {
      const resumesData = await resumesRes.json();
      if (resumesData.success) {
        await chrome.storage.local.set({ cachedResumes: resumesData.data.resumes });
      }
    }
    if (screeningRes.ok) {
      const screeningData = await screeningRes.json();
      if (screeningData.success) {
        await chrome.storage.local.set({ cachedScreening: screeningData.data.answers });
      }
    }

    await chrome.storage.local.set({ lastRefresh: Date.now() });
  } catch (e) {
    console.warn("JobPilot: background refresh failed", e);
  }
}

// ─── Message Handler ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "apiFetch") {
    handleApiFetch(message.url, message.sessionCookie)
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "fetchResumePdf") {
    handleFetchResumePdf(message.appUrl, message.resumeId, message.sessionCookie)
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "generateCoverLetter") {
    handleGenerateCoverLetter(message.appUrl, message.sessionCookie, message.jobDescription, message.jobTitle, message.company)
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "refreshData") {
    refreshCachedData()
      .then(() => sendResponse({ data: { ok: true } }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * Generic API fetch with session header.
 */
async function handleApiFetch(url, sessionCookie) {
  const res = await fetch(url, {
    headers: { "X-Session": sessionCookie },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Fetch resume PDF as base64 data URL for file-input injection.
 */
async function handleFetchResumePdf(appUrl, resumeId, sessionCookie) {
  const url = `${appUrl}/api/resumes?id=${encodeURIComponent(resumeId)}&file=1`;

  const res = await fetch(url, {
    headers: { "X-Session": sessionCookie },
  });

  if (!res.ok) throw new Error(`Resume fetch failed: ${res.status}`);

  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read resume blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a cover letter via the screening API.
 */
async function handleGenerateCoverLetter(appUrl, sessionCookie, jobDescription, jobTitle, company) {
  const res = await fetch(`${appUrl}/api/screening`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session": sessionCookie,
    },
    body: JSON.stringify({
      action: "generate-cover-letter",
      jobDescription,
      jobTitle: jobTitle || "",
      company: company || "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cover letter API ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Cover letter generation failed");
  return json.data;
}
