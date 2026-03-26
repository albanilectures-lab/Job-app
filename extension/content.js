// ─── JobPilot Content Script ──────────────────────────────────
// Injected on all pages. Detects job application forms, shows a floating
// "Auto-Fill" button, and fills fields from cached JobPilot data.
// Uses score-based field matching to avoid mis-fills.

(function () {
  "use strict";

  if (window.__jobpilotInjected) return;
  window.__jobpilotInjected = true;

  // ═══════════════════════════════════════════════════════════════
  // FIELD MATCHERS — scored system with positive/negative keywords
  // ═══════════════════════════════════════════════════════════════
  const FIELD_MATCHERS = [
    { id: "firstName", positives: ["first.?name", "first_name", "fname", "given.?name", "prenom"], negatives: ["last", "surname", "family", "company", "middle"], getValue: (p) => p.fullName?.split(" ")[0] || "" },
    { id: "lastName", positives: ["last.?name", "last_name", "lname", "surname", "family.?name"], negatives: ["first", "given", "company", "middle"], getValue: (p) => p.fullName?.split(" ").slice(1).join(" ") || "" },
    { id: "fullName", positives: ["full.?name", "your.?name", "candidate.?name", "applicant.?name"], negatives: ["first", "last", "company", "email", "phone"], getValue: (p) => p.fullName || "" },
    { id: "email", positives: ["e.?mail", "email.?address", "your.?email", "contact.?email"], negatives: ["company", "referral", "manager"], getValue: (p) => p.email || "" },
    { id: "phone", positives: ["phone", "mobile", "telephone", "tel[^l]", "cell.?phone", "phone.?number", "contact.?number", "mobile.?number"], negatives: ["company", "fax", "office.?phone"], getValue: (p) => p.phone || "" },
    { id: "linkedin", positives: ["linkedin", "linked.?in"], negatives: [], getValue: (p) => p.linkedinUrl || "" },
    { id: "github", positives: ["github"], negatives: [], getValue: (p) => p.githubUrl || "" },
    { id: "portfolio", positives: ["portfolio", "website", "personal.?site", "personal.?url", "homepage"], negatives: ["linkedin", "github", "company"], getValue: (p) => p.portfolioUrl || "" },
    { id: "city", positives: ["\\bcity\\b", "\\btown\\b"], negatives: ["country", "state", "zip", "postal"], getValue: (p) => p.city || "" },
    { id: "state", positives: ["\\bstate\\b", "\\bprovince\\b", "\\bregion\\b"], negatives: ["country", "city", "zip", "postal", "united"], getValue: (p) => p.state || "" },
    { id: "country", positives: ["\\bcountry\\b", "\\bnation\\b", "country.?of.?residence", "where.?are.?you.?located", "which.?country"], negatives: ["city", "state", "zip", "postal", "code", "phone"], getValue: (p) => p.country || "" },
    { id: "postCode", positives: ["\\bzip\\b", "\\bpostal\\b", "post.?code", "zip.?code"], negatives: ["country", "city", "state"], getValue: (p) => p.postCode || "" },
    { id: "location", positives: ["\\blocation\\b", "\\baddress\\b", "where.?are.?you", "current.?location", "your.?location"], negatives: ["email", "company", "url", "office"], getValue: (p) => [p.city, p.state, p.country].filter(Boolean).join(", ") },
    { id: "currentTitle", positives: ["current.?title", "job.?title", "current.?role", "current.?position"], negatives: ["desired", "company", "apply"], getValue: (p) => p.currentTitle || "" },
    { id: "yearsExp", positives: ["years?.?(?:of)?.?experience", "experience.?years", "how.?many.?years", "total.?experience", "yrs?.?(?:of)?.?exp"], negatives: ["salary", "rate", "language"], getValue: (p) => (p.yearsExperience != null && p.yearsExperience > 0) ? String(p.yearsExperience) : "" },
    { id: "expectedSalary", positives: ["salary.?expect", "desired.?salary", "expected.?salary", "compensation.?expect", "salary.?requirement", "what.?are.?your.?salary"], negatives: ["current.?salary", "hourly"], getValue: (p) => (p.expectedSalary && p.expectedSalary > 0) ? String(p.expectedSalary) : "" },
    { id: "currentSalary", positives: ["current.?salary", "present.?salary"], negatives: ["expected", "desired", "hourly"], getValue: (p) => (p.currentSalary && p.currentSalary > 0) ? String(p.currentSalary) : "" },
    { id: "hourlyRate", positives: ["hourly.?rate", "rate.?per.?hour", "day.?rate"], negatives: ["salary", "annual"], getValue: (p) => (p.expectedHourlyRate && p.expectedHourlyRate > 0) ? String(p.expectedHourlyRate) : "" },
    { id: "nationality", positives: ["\\bnationality\\b", "\\bcitizenship\\b"], negatives: ["country", "location"], getValue: (p) => p.nationality || "" },
    { id: "availability", positives: ["availab", "notice.?period", "start.?date", "when.?can.?you.?start", "how.?quickly", "how.?soon"], negatives: ["salary", "email"], getValue: (p) => { const m = { immediately: "Immediately", "1week": "1 week", "2weeks": "2 weeks", "1month": "1 month", "2months": "2 months" }; return m[p.availability] || p.availability || ""; } },
    { id: "visa", positives: ["visa", "sponsorship", "authorized.?to.?work", "work.?permit", "right.?to.?work", "legally.?authorized", "work.?authorization"], negatives: [], getValue: (p) => p.visaSponsorship != null ? (p.visaSponsorship ? "Yes" : "No") : "" },
    { id: "summary", positives: ["tell.?us.?about", "about.?you", "summary", "introduction", "describe.?yourself", "experience.?summary", "professional.?summary"], negatives: ["cover.?letter", "salary", "email"], getValue: (p) => p.experienceSummary || "", isTextarea: true },
  ];

  const RESUME_FILE_KEYWORDS = ["resume", "\\bcv\\b", "curriculum"];
  const COVER_LETTER_FILE_KEYWORDS = ["cover.?letter"];

  let floatingBtn = null;
  let statusOverlay = null;

  // ── Initialization ───────────────────────────────────────────
  async function init() {
    const settings = await chrome.storage.local.get(["autoDetect", "autoShowBtn"]);
    if (settings.autoDetect === false) return;

    // Check if this page has form fields
    const formFields = detectFormFields();
    if (formFields.length === 0) return;

    if (settings.autoShowBtn !== false) {
      showFloatingButton();
    }
  }

  // ── Detect Form Fields ───────────────────────────────────────
  function detectFormFields() {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], ' +
      'input:not([type]), textarea, select, input[type="file"]'
    );
    return Array.from(inputs).filter((el) => {
      // Exclude hidden/tiny fields
      if (el.offsetHeight === 0 && el.type !== "file") return false;
      if (el.type === "hidden") return false;
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // GET FIELD CONTEXT — split into label vs attribute for scoring
  // ═══════════════════════════════════════════════════════════════
  function getFieldContext(el) {
    const labelParts = [];
    const attrParts = [];

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) labelParts.push(label.textContent);
    }
    const parentLabel = el.closest("label");
    if (parentLabel) labelParts.push(parentLabel.textContent);
    if (el.getAttribute("aria-label")) labelParts.push(el.getAttribute("aria-label"));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) labelParts.push(ref.textContent);
    }
    const prev = el.previousElementSibling;
    if (prev && ["LABEL", "SPAN", "P", "DIV"].includes(prev.tagName)) {
      labelParts.push(prev.textContent);
    }
    const container = el.closest(".field, .form-group, .form-field, .question, [class*=field], [class*=question], [class*=form], [class*=Field], [class*=Question]");
    if (container) {
      const heading = container.querySelector("label, legend, h3, h4, .label, [class*=label], [class*=Label]");
      if (heading && !labelParts.some(lp => lp === heading.textContent)) {
        labelParts.push(heading.textContent);
      }
    }

    attrParts.push(el.name || "");
    attrParts.push(el.id || "");
    attrParts.push(el.placeholder || "");
    attrParts.push(el.getAttribute("data-qa") || "");
    attrParts.push(el.getAttribute("autocomplete") || "");

    const labelText = labelParts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    const attrText = attrParts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    const fullText = (labelText + " " + attrText).trim();
    return { labelText, attrText, fullText };
  }

  // ═══════════════════════════════════════════════════════════════
  // SCORE-BASED FIELD MATCHING
  // ═══════════════════════════════════════════════════════════════
  function scoreMatcher(matcher, fieldContext) {
    const { labelText, attrText } = fieldContext;
    let score = 0;
    for (const neg of (matcher.negatives || [])) {
      if (new RegExp(neg, "i").test(labelText)) score -= 100;
    }
    for (const pos of matcher.positives) {
      const regex = new RegExp(pos, "i");
      if (regex.test(labelText)) score += 30;
      if (regex.test(attrText)) score += 10;
    }
    return score;
  }

  function bestMatchForField(fieldContext, profile) {
    let bestMatcher = null;
    let bestScore = 0;
    for (const matcher of FIELD_MATCHERS) {
      const score = scoreMatcher(matcher, fieldContext);
      if (score > bestScore) {
        const val = matcher.getValue(profile);
        if (val) { bestScore = score; bestMatcher = matcher; }
      }
    }
    return bestMatcher ? { value: bestMatcher.getValue(profile), matcher: bestMatcher, score: bestScore } : null;
  }

  // ═══════════════════════════════════════════════════════════════
  // SCREENING QUESTION MATCHING (improved fuzzy + category boost)
  // ═══════════════════════════════════════════════════════════════
  function matchScreening(fullContext, screeningAnswers) {
    if (!screeningAnswers || !screeningAnswers.length) return null;
    let bestAnswer = null;
    let bestScore = 0;

    const categoryBoosts = {
      experience: ["experience", "years", "proficient", "familiar", "comfortable"],
      salary: ["salary", "compensation", "pay", "rate", "expectations"],
      availability: ["available", "start", "notice", "relocate", "willing"],
      legal: ["authorized", "visa", "sponsorship", "legally", "eligible", "gender", "veteran", "disability", "race"],
      technical: ["language", "framework", "tool", "technology", "proficiency", "aws", "python", "java", "coding"],
    };

    for (const qa of screeningAnswers) {
      const qLower = qa.question.toLowerCase();
      const questionWords = qLower.split(/\s+/).filter((w) => w.length > 3);
      if (questionWords.length === 0) continue;
      const matchCount = questionWords.filter((w) => fullContext.includes(w)).length;
      const ratio = matchCount / questionWords.length;
      let score = matchCount * 10 + ratio * 20;
      if (qa.category && categoryBoosts[qa.category]) {
        if (categoryBoosts[qa.category].some((kw) => fullContext.includes(kw))) score += 5;
      }
      if (score > bestScore && (matchCount >= 2 || (questionWords.length <= 3 && matchCount >= 1) || ratio >= 0.4)) {
        bestScore = score;
        bestAnswer = qa.answer;
      }
    }
    return bestAnswer;
  }

  // ═══════════════════════════════════════════════════════════════
  // SELECT / DROPDOWN MATCHING (enhanced)
  // ═══════════════════════════════════════════════════════════════
  function matchSelectOption(selectEl, desiredValue) {
    if (!desiredValue) return false;
    const desired = desiredValue.toLowerCase().trim();

    // Exact match
    for (const opt of selectEl.options) {
      const optVal = opt.value.toLowerCase().trim();
      const optText = opt.textContent.toLowerCase().trim();
      if (optVal === desired || optText === desired) {
        selectEl.value = opt.value;
        fireEvents(selectEl);
        return true;
      }
    }
    // Contains match
    for (const opt of selectEl.options) {
      const optText = opt.textContent.toLowerCase().trim();
      if (optText.length > 1 && (optText.includes(desired) || desired.includes(optText))) {
        selectEl.value = opt.value;
        fireEvents(selectEl);
        return true;
      }
    }
    // Word overlap for multi-word values
    const desiredWords = desired.split(/[\s,]+/).filter(w => w.length > 2);
    if (desiredWords.length > 1) {
      let bestOpt = null, bestOverlap = 0;
      for (const opt of selectEl.options) {
        const optText = opt.textContent.toLowerCase();
        const overlap = desiredWords.filter(w => optText.includes(w)).length;
        if (overlap > bestOverlap && overlap >= Math.ceil(desiredWords.length / 2)) {
          bestOverlap = overlap;
          bestOpt = opt;
        }
      }
      if (bestOpt) {
        selectEl.value = bestOpt.value;
        fireEvents(selectEl);
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // RADIO / CHECKBOX MATCHING
  // ═══════════════════════════════════════════════════════════════
  function fillRadiosAndCheckboxes(profile, screeningAnswers) {
    let filled = 0;
    const radioGroups = {};

    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      const ctx = getFieldContext(el);
      const match = bestMatchForField(ctx, profile);
      const value = match?.value || matchScreening(ctx.fullText, screeningAnswers);
      if (!value) return;

      if (el.type === "radio") {
        const name = el.name;
        if (radioGroups[name]) return;
        const group = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
        for (const radio of group) {
          const radioCtx = getFieldContext(radio);
          if (radioCtx.fullText.includes(value.toLowerCase())) {
            radio.checked = true;
            fireEvents(radio);
            radioGroups[name] = true;
            filled++;
            break;
          }
        }
      } else {
        const yesIndicators = ["yes", "true", "1", "agree", "accept"];
        if (yesIndicators.some((y) => value.toLowerCase().includes(y)) && !el.checked) {
          el.checked = true;
          fireEvents(el);
          filled++;
        }
      }
    });
    return filled;
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUME / COVER LETTER FILE UPLOAD
  // ═══════════════════════════════════════════════════════════════
  async function attachResumeFiles() {
    let attached = 0;
    const fileInputs = document.querySelectorAll('input[type="file"]');

    for (const input of fileInputs) {
      const ctx = getFieldContext(input);
      const context = ctx.fullText;
      const isResume = RESUME_FILE_KEYWORDS.some((kw) => new RegExp(kw, "i").test(context));
      const isCoverLetter = COVER_LETTER_FILE_KEYWORDS.some((kw) => new RegExp(kw, "i").test(context));

      if (!isResume && !isCoverLetter) continue;

      try {
        const stored = await chrome.storage.local.get(["appUrl", "sessionCookie", "defaultResumeId", "cachedResumes", "cachedCoverLetterPdf"]);

        if (isCoverLetter && stored.cachedCoverLetterPdf) {
          const file = dataUrlToFile(stored.cachedCoverLetterPdf, "cover_letter.pdf");
          if (setFileInput(input, file)) attached++;
          continue;
        }

        if (!isResume || !stored.appUrl || !stored.sessionCookie) continue;
        const resumes = stored.cachedResumes || [];
        const resumeId = stored.defaultResumeId || resumes[0]?.id;
        if (!resumeId) continue;
        const resume = resumes.find((r) => r.id === resumeId) || resumes[0];
        if (!resume) continue;

        const pdfDataUrl = await bgMessage({
          action: "fetchResumePdf", appUrl: stored.appUrl,
          resumeId: resume.id, sessionCookie: stored.sessionCookie,
        });

        const file = dataUrlToFile(pdfDataUrl, resume.filename || "resume.pdf");
        if (setFileInput(input, file)) attached++;
      } catch (err) {
        console.warn("[JobPilot] File attach failed for input:", input, "Error:", String(err));
      }
    }
    return attached;
  }

  /**
   * Safely set a file on an input[type="file"].
   * Handles hidden, disabled, and accept-restricted inputs.
   * Greenhouse and similar ATS use hidden inputs with strict accept attrs.
   */
  function setFileInput(input, file) {
    try {
      // Clone the input, strip restrictions, set file, then swap back
      const prevAccept = input.getAttribute("accept");
      const prevDisabled = input.disabled;
      const prevRequired = input.required;
      const prevDisplay = input.style.display;
      const prevVisibility = input.style.visibility;

      // Make the input fully writable
      input.removeAttribute("accept");
      input.disabled = false;
      input.required = false;
      input.style.display = "";
      input.style.visibility = "visible";

      // Ensure the File has the correct MIME for PDF
      let fixedFile = file;
      if (file.name.endsWith(".pdf") && file.type !== "application/pdf") {
        fixedFile = new File([file], file.name, { type: "application/pdf" });
      }

      const dt = new DataTransfer();
      dt.items.add(fixedFile);
      input.files = dt.files;

      // Restore original attributes
      if (prevAccept !== null) input.setAttribute("accept", prevAccept);
      input.disabled = prevDisabled;
      input.required = prevRequired;
      input.style.display = prevDisplay;
      input.style.visibility = prevVisibility;

      // Fire all the events React/Angular/Greenhouse might listen for
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[JobPilot] setFileInput primary failed:", e);
    }

    // Fallback 1: use Object.defineProperty to bypass setter
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(input, "files", {
        value: dt.files,
        writable: true,
        configurable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e2) {
      console.warn("[JobPilot] setFileInput defineProperty failed:", e2);
    }

    // Fallback 2: programmatically click the input and use a drop event
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      // Find the nearest drop zone (Greenhouse wraps file inputs in a drop area)
      const dropZone = input.closest("[class*=drop]") || input.closest("[class*=upload]") || input.parentElement;
      if (dropZone) {
        const dropEvent = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        dropZone.dispatchEvent(dropEvent);
        return true;
      }
    } catch (e3) {
      console.warn("[JobPilot] setFileInput drop fallback failed:", e3);
    }

    return false;
  }

  function dataUrlToFile(dataUrl, filename) {
    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const mimeMatch = dataUrl.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
    return new File([new Blob([ab], { type: mime })], filename, { type: mime });
  }

  // ═══════════════════════════════════════════════════════════════
  // COVER LETTER — extract job description + generate via API
  // ═══════════════════════════════════════════════════════════════
  async function generateAndFillCoverLetter() {
    let filled = 0;
    const stored = await chrome.storage.local.get(["appUrl", "sessionCookie"]);
    if (!stored.appUrl || !stored.sessionCookie) return 0;

    // Try clicking "Enter manually" links to reveal cover letter textarea
    const clickables = document.querySelectorAll('a, button, [role="button"]');
    for (const link of clickables) {
      const text = link.textContent.toLowerCase().trim();
      if (text.includes("enter manually") || text.includes("write cover") || text.includes("type cover")) {
        link.click();
        await sleep(500);
      }
    }

    const coverTextareas = findCoverLetterTextareas();
    if (coverTextareas.length === 0) return 0;

    const jobDescription = extractJobDescription();
    if (!jobDescription) return 0;

    try {
      showStatusOverlay("Generating cover letter...");
      const result = await bgMessage({
        action: "generateCoverLetter",
        appUrl: stored.appUrl,
        sessionCookie: stored.sessionCookie,
        jobDescription,
      });

      if (result?.coverLetter) {
        for (const ta of coverTextareas) {
          if (!ta.value || ta.value.trim().length < 10) {
            ta.value = result.coverLetter;
            fireEvents(ta);
            filled++;
          }
        }
        if (result.coverLetterPdf) {
          await chrome.storage.local.set({ cachedCoverLetterPdf: result.coverLetterPdf });
        }
      }
    } catch (err) {
      console.warn("[JobPilot] Cover letter generation failed:", err);
    }
    return filled;
  }

  function findCoverLetterTextareas() {
    const results = [];
    for (const ta of document.querySelectorAll("textarea")) {
      const ctx = getFieldContext(ta);
      if (/cover.?letter/i.test(ctx.fullText) || /why.?do.?you.?want/i.test(ctx.fullText) ||
          /why.?should.?we.?hire/i.test(ctx.fullText) || /why.?are.?you.?interested/i.test(ctx.fullText)) {
        results.push(ta);
      }
    }
    return results;
  }

  function extractJobDescription() {
    const selectors = [
      '[data-qa="job-description"]', ".job-description", ".job_description",
      "#job-description", "#job_description", '[class*="jobDescription"]',
      '[class*="job-description"]', '[class*="JobDescription"]',
      ".posting-description", ".job-details", ".description__text",
      'article[class*="job"]', '[itemprop="description"]', ".content-intro",
      "#content .body", "#app_body .content", ".posting-page .content",
      '[data-automation-id="jobPostingDescription"]', "main article", "main .content",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 100) return el.textContent.trim().slice(0, 4000);
    }
    // Fallback: largest text block
    const title = document.title || "";
    const blocks = [title];
    document.querySelectorAll("section, article, div.content, main").forEach((el) => {
      const text = el.textContent.trim();
      if (text.length > 200 && text.length < 10000) blocks.push(text.slice(0, 2000));
    });
    const combined = blocks.join("\n\n").trim();
    return combined.length > 100 ? combined.slice(0, 4000) : null;
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN FILL LOGIC
  // ═══════════════════════════════════════════════════════════════
  async function fillForm() {
    const stored = await chrome.storage.local.get(["cachedProfile", "cachedScreening"]);
    const profile = stored.cachedProfile;
    const screeningAnswers = stored.cachedScreening || [];

    if (!profile) {
      return { success: false, error: "No profile data. Open the extension popup and connect first." };
    }

    let filledCount = 0;
    const fields = detectFormFields();

    // Pass 1: Text inputs, selects, textareas
    for (const el of fields) {
      if (el.type === "file") continue;
      const ctx = getFieldContext(el);
      if (!ctx.fullText) continue;

      const match = bestMatchForField(ctx, profile);
      const screeningVal = matchScreening(ctx.fullText, screeningAnswers);
      const value = match?.value || screeningVal;
      if (!value) continue;

      if (el.tagName === "SELECT") {
        if (matchSelectOption(el, value)) filledCount++;
      } else if (!el.value || el.value.trim().length === 0) {
        el.value = value;
        fireEvents(el);
        filledCount++;
      }
    }

    // Pass 2: Radio / checkboxes
    filledCount += fillRadiosAndCheckboxes(profile, screeningAnswers);

    // Pass 3: Cover letter (textarea or file)
    filledCount += await generateAndFillCoverLetter();

    // Pass 4: File inputs (resume + cover letter PDF)
    filledCount += await attachResumeFiles();

    if (filledCount > 0) {
      showStatusOverlay(`JobPilot filled ${filledCount} field(s)`);
    } else {
      showStatusOverlay("No matching fields found on this page");
    }
    return { success: filledCount > 0, filledCount };
  }

  // ═══════════════════════════════════════════════════════════════
  // FIRE EVENTS (React/Angular/Vue compatibility)
  // ═══════════════════════════════════════════════════════════════
  function fireEvents(el) {
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;

    if (el.tagName === "INPUT" && nativeInputSetter) nativeInputSetter.call(el, el.value);
    else if (el.tagName === "TEXTAREA" && nativeTextAreaSetter) nativeTextAreaSetter.call(el, el.value);
    else if (el.tagName === "SELECT" && nativeSelectSetter) nativeSelectSetter.call(el, el.value);

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    el.dispatchEvent(new Event("focus", { bubbles: true }));
  }

  // ═══════════════════════════════════════════════════════════════
  // UI — FLOATING BUTTON
  // ═══════════════════════════════════════════════════════════════
  function showFloatingButton() {
    if (floatingBtn) return;

    floatingBtn = document.createElement("div");
    floatingBtn.id = "jobpilot-float-btn";
    floatingBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>
      <span>Auto-Fill</span>
    `;
    floatingBtn.addEventListener("click", async () => {
      floatingBtn.classList.add("jobpilot-loading");
      floatingBtn.querySelector("span").textContent = "Filling...";
      await fillForm();
      floatingBtn.classList.remove("jobpilot-loading");
      floatingBtn.querySelector("span").textContent = "Auto-Fill";
    });

    document.body.appendChild(floatingBtn);
    makeDraggable(floatingBtn);
  }

  function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    el.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      el.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.left = (startLeft + e.clientX - startX) + "px";
      el.style.top = (startTop + e.clientY - startY) + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      el.style.transition = "";
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // UI — STATUS OVERLAY
  // ═══════════════════════════════════════════════════════════════
  function showStatusOverlay(message) {
    if (statusOverlay) statusOverlay.remove();
    statusOverlay = document.createElement("div");
    statusOverlay.id = "jobpilot-status";
    statusOverlay.textContent = message;
    document.body.appendChild(statusOverlay);
    setTimeout(() => {
      statusOverlay?.classList.add("jobpilot-fade-out");
      setTimeout(() => statusOverlay?.remove(), 500);
    }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  function bgMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.error) return reject(new Error(response.error));
        resolve(response.data);
      });
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════
  // MESSAGE LISTENER (from popup)
  // ═══════════════════════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fillForm") {
      fillForm().then((result) => sendResponse(result));
      return true;
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // BOOT — slight delay for SPA rendering
  // ═══════════════════════════════════════════════════════════════
  setTimeout(init, 1200);
})();
