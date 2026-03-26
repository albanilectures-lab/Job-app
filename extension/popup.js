// ─── Popup Script ─────────────────────────────────────────────
// Manages login, data display, and sends commands to content script

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const stored = await chrome.storage.local.get([
    "appUrl", "sessionCookie", "displayName", "autoDetect", "autoShowBtn", "defaultResumeId"
  ]);

  // Restore settings
  if (stored.appUrl) document.getElementById("app-url").value = stored.appUrl;
  if (stored.autoDetect !== undefined) document.getElementById("auto-detect").checked = stored.autoDetect;
  if (stored.autoShowBtn !== undefined) document.getElementById("auto-show-btn").checked = stored.autoShowBtn;

  // If we have a session, try to show main view
  if (stored.sessionCookie) {
    await showMainView(stored);
  }

  // ── Event listeners ──
  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("fill-now-btn").addEventListener("click", handleFillNow);
  document.getElementById("refresh-btn").addEventListener("click", handleRefresh);
  document.getElementById("auto-detect").addEventListener("change", saveSettings);
  document.getElementById("auto-show-btn").addEventListener("change", saveSettings);
  document.getElementById("default-resume").addEventListener("change", saveSettings);
}

// ── Login ──────────────────────────────────────────────────────
async function handleLogin() {
  const appUrl = document.getElementById("app-url").value.replace(/\/+$/, "");
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const statusEl = document.getElementById("login-status");

  if (!appUrl || !username || !password) {
    showStatus(statusEl, "All fields required", "error");
    return;
  }

  try {
    showStatus(statusEl, "Connecting...", "success");

    // Login via API
    const res = await fetch(`${appUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", username, password }),
    });

    const data = await res.json();
    if (!data.success) {
      showStatus(statusEl, data.error || "Login failed", "error");
      return;
    }

    // Build the session cookie value (base64 JSON, same as the server)
    const sessionCookie = btoa(JSON.stringify({
      username: data.user.username,
      displayName: data.user.displayName,
    }));

    await chrome.storage.local.set({
      appUrl,
      sessionCookie,
      displayName: data.user.displayName,
      username: data.user.username,
    });

    const stored = await chrome.storage.local.get();
    await showMainView(stored);
  } catch (err) {
    showStatus(statusEl, `Connection failed: ${err.message}`, "error");
  }
}

// ── Show Main View ─────────────────────────────────────────────
async function showMainView(stored) {
  const appUrl = stored.appUrl;
  const sessionCookie = stored.sessionCookie;

  // ─── Instant render from cache (if available) ───
  const hasCached = stored.cachedProfile && stored.cachedResumes && stored.cachedScreening;
  if (hasCached) {
    renderMainData(stored.displayName, stored.cachedProfile, stored.cachedResumes, stored.cachedScreening, stored.defaultResumeId);
    document.getElementById("login-section").classList.remove("active");
    document.getElementById("main-section").classList.add("active");
  }

  // ─── Background refresh ───
  try {
    const [settingsData, resumesData, screeningData] = await Promise.all([
      bgFetch(`${appUrl}/api/settings`, sessionCookie),
      bgFetch(`${appUrl}/api/resumes`, sessionCookie),
      bgFetch(`${appUrl}/api/screening`, sessionCookie),
    ]);

    if (!settingsData.success) throw new Error("Failed to load settings");

    const profile = settingsData.data?.profile || {};
    const resumes = resumesData.data || [];
    const answers = screeningData.data?.answers || [];
    const normalizedAnswers = Array.isArray(answers) ? answers : (answers.questions || []);

    await chrome.storage.local.set({
      cachedProfile: profile,
      cachedResumes: resumes,
      cachedScreening: normalizedAnswers,
      lastRefresh: Date.now(),
    });

    renderMainData(stored.displayName, profile, resumes, normalizedAnswers, stored.defaultResumeId);
    document.getElementById("login-section").classList.remove("active");
    document.getElementById("main-section").classList.add("active");
  } catch (err) {
    if (!hasCached) {
      const statusEl = document.getElementById("login-status");
      showStatus(statusEl, `Could not load data: ${err.message}`, "error");
      await handleLogout();
    }
    // If we had cache, silently ignore the refresh failure
  }
}

function renderMainData(displayName, profile, resumes, answers, defaultResumeId) {
  document.getElementById("display-name").textContent = displayName || "—";
  document.getElementById("profile-name").textContent = profile.fullName || "Not set";
  document.getElementById("resume-count").textContent = Array.isArray(resumes) ? resumes.length : 0;
  document.getElementById("screening-count").textContent = Array.isArray(answers) ? answers.length : 0;

  const select = document.getElementById("default-resume");
  select.innerHTML = "";
  (Array.isArray(resumes) ? resumes : []).forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.label} (${r.filename})`;
    if (r.id === defaultResumeId) opt.selected = true;
    select.appendChild(opt);
  });
}

// ── Logout ─────────────────────────────────────────────────────
async function handleLogout() {
  await chrome.storage.local.remove([
    "sessionCookie", "displayName", "username",
    "cachedProfile", "cachedResumes", "cachedScreening"
  ]);
  document.getElementById("main-section").classList.remove("active");
  document.getElementById("login-section").classList.add("active");
}

// ── Fill Now ───────────────────────────────────────────────────
async function handleFillNow() {
  const statusEl = document.getElementById("main-status");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus(statusEl, "No active tab", "error");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "fillForm" }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(statusEl, "Could not reach page. Reload the tab and try again.", "error");
        return;
      }
      if (response?.success) {
        showStatus(statusEl, `Filled ${response.filledCount} fields`, "success");
      } else {
        showStatus(statusEl, response?.error || "No form fields found", "error");
      }
    });
  } catch (err) {
    showStatus(statusEl, err.message, "error");
  }
}

// ── Refresh ────────────────────────────────────────────────────
async function handleRefresh() {
  const stored = await chrome.storage.local.get();
  if (stored.sessionCookie) {
    const statusEl = document.getElementById("main-status");
    showStatus(statusEl, "Refreshing...", "success");
    await showMainView(stored);
    showStatus(statusEl, "Data refreshed", "success");
  }
}

// ── Save Settings ──────────────────────────────────────────────
async function saveSettings() {
  await chrome.storage.local.set({
    autoDetect: document.getElementById("auto-detect").checked,
    autoShowBtn: document.getElementById("auto-show-btn").checked,
    defaultResumeId: document.getElementById("default-resume").value,
  });
}

// ── Helper: fetch via background service worker ────────────────
function bgFetch(url, sessionCookie) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "apiFetch", url, sessionCookie },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.data);
        }
      }
    );
  });
}

// ── Status helper ──────────────────────────────────────────────
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.style.display = "block";
  if (type === "success") {
    setTimeout(() => { el.style.display = "none"; }, 3000);
  }
}
