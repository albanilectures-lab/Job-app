"use client";

import { useState, useEffect, useCallback } from "react";
import JobCard from "@/components/JobCard";
import AIScout from "@/components/AIScout";
import type { Job, JobStatus, CopilotConfig, CopilotRun, ApplicationLog, ScreeningQuestion } from "@/lib/types";
import {
  Search, Brain, Loader2, Filter, CheckCircle2, AlertCircle, X, Sparkles,
  Trash2, Power, Clock, Briefcase, BarChart3, CheckCircle, XCircle,
  Activity, Settings, Zap, ChevronRight, Play, MessageSquare,
} from "lucide-react";
import Link from "next/link";

type FilterTab = "all" | "matched" | "applied" | "skipped" | "failed";
type ViewTab = "jobs" | "scout" | "screening";

interface StatusMessage {
  type: "info" | "success" | "error";
  title: string;
  detail?: string;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("matched");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [scrapeStep, setScrapeStep] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const [view, setView] = useState<ViewTab>("jobs");
  const [clearing, setClearing] = useState(false);
  const [runningAutopilot, setRunningAutopilot] = useState(false);

  // Screening state
  const [screeningQs, setScreeningQs] = useState<ScreeningQuestion[]>([]);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [customQsInput, setCustomQsInput] = useState("");

  // Copilot state
  const [copilotConfig, setCopilotConfig] = useState<CopilotConfig | null>(null);
  const [recentRuns, setRecentRuns] = useState<CopilotRun[]>([]);
  const [activityLogs, setActivityLogs] = useState<ApplicationLog[]>([]);
  const [togglingCopilot, setTogglingCopilot] = useState(false);

  const [allCounts, setAllCounts] = useState({ total: 0, matched: 0, applied: 0, skipped: 0, failed: 0 });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeTab === "all" ? "/api/jobs" : `/api/jobs?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      setJobs(data.data ?? []);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?counts=true");
      const data = await res.json();
      if (data.counts) setAllCounts(data.counts);
    } catch { /* ignore */ }
  }, []);

  const fetchCopilotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?what=copilot");
      const data = await res.json();
      if (data.success) {
        setCopilotConfig(data.data.copilotConfig);
        setRecentRuns(data.data.recentRuns ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?what=activity");
      const data = await res.json();
      if (data.success) setActivityLogs(data.data.logs ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchCounts();
    fetchCopilotStatus();
    fetchActivity();
  }, [fetchJobs, fetchCounts, fetchCopilotStatus, fetchActivity]);

  // Fetch screening answers when Screening tab is active
  useEffect(() => {
    if (view === "screening") {
      setScreeningLoading(true);
      fetch("/api/screening?what=answers")
        .then((r) => r.json())
        .then((d) => { if (d.success) setScreeningQs(d.data.answers ?? []); })
        .catch(() => {})
        .finally(() => setScreeningLoading(false));
    }
  }, [view]);

  const clearStatus = () => setStatus(null);

  // Auto-clear success messages after 6 seconds
  useEffect(() => {
    if (status?.type === "success") {
      const t = setTimeout(clearStatus, 6000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handleScrape = async () => {
    setScraping(true);
    setStatus({ type: "info", title: "Scraping job boards...", detail: "Connecting to configured boards and fetching listings" });
    setScrapeStep("Connecting to job boards...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scrape" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      if (data.success) {
        setStatus({
          type: "success",
          title: "Scrape complete!",
          detail: `Found ${data.data.scraped} jobs, ${data.data.inserted} new added to database.`,
        });
        fetchJobs();
      } else {
        setStatus({ type: "error", title: "Scrape failed", detail: data.error });
      }
    } catch (err: any) {
      const detail = err?.name === "AbortError"
        ? "Request timed out. The server may be overloaded or the function exceeded its time limit."
        : String(err);
      setStatus({ type: "error", title: "Scrape error", detail });
    } finally {
      setScraping(false);
      setScrapeStep("");
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeProgress({ current: 0, total: 0 });
    setStatus({ type: "info", title: "AI Analysis starting...", detail: "Sending jobs to Grok for fit scoring and cover letter generation" });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus({
          type: "success",
          title: "Analysis complete!",
          detail: `${data.data.analyzed} jobs analyzed with fit scores and cover letters generated.`,
        });
        setActiveTab("matched");
        fetchJobs();
        fetchCounts();
      } else {
        setStatus({ type: "error", title: "Analysis failed", detail: data.error });
      }
    } catch (err) {
      setStatus({ type: "error", title: "Analysis error", detail: String(err) });
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress({ current: 0, total: 0 });
    }
  };

  const handleApply = async (jobId: string) => {
    if (!confirm("This will open a browser window and auto-fill the application form. Continue?")) return;

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      setStatus({
        type: data.success ? "success" : "error",
        title: data.success ? "Application submitted!" : "Apply failed",
        detail: data.data?.message ?? data.error ?? "Unknown result",
      });
      fetchJobs();
      fetchCounts();
    } catch (err) {
      setStatus({ type: "error", title: "Apply error", detail: String(err) });
    }
  };

  const handleSkip = async (jobId: string) => {
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateStatus", jobId, status: "skipped" }),
      });
      fetchJobs();
      fetchCounts();
    } catch (err) {
      console.error("Skip error:", err);
    }
  };

  const handleEditCover = async (jobId: string, cover: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, coverLetter: cover } : j))
    );
  };

  const handleClearAll = async () => {
    if (!confirm("Delete ALL jobs from the database? This cannot be undone.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/jobs", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setStatus({ type: "success", title: "Jobs cleared", detail: `${data.data.deleted} jobs deleted.` });
        fetchJobs();
        fetchCounts();
      } else {
        setStatus({ type: "error", title: "Clear failed", detail: data.error });
      }
    } catch (err) {
      setStatus({ type: "error", title: "Clear error", detail: String(err) });
    } finally {
      setClearing(false);
    }
  };

  const handleToggleCopilot = async () => {
    setTogglingCopilot(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleCopilot" }),
      });
      const data = await res.json();
      if (data.success) {
        setCopilotConfig((prev) => prev ? { ...prev, enabled: data.data.enabled } : prev);
        setStatus({ type: "success", title: data.data.enabled ? "Copilot activated" : "Copilot paused" });
      }
    } catch (err) {
      setStatus({ type: "error", title: "Toggle failed", detail: String(err) });
    } finally {
      setTogglingCopilot(false);
    }
  };

  const handleRunAutopilot = async () => {
    setRunningAutopilot(true);
    setStatus({ type: "info", title: "Running Autopilot...", detail: "Scraping, analyzing, and applying to matching jobs" });
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.data;
        setStatus({
          type: "success",
          title: "Autopilot run complete",
          detail: `Found ${r.jobsFound} jobs, ${r.jobsMatched} matched, ${r.jobsApplied} applied${r.errors?.length ? ` (${r.errors.length} errors)` : ""}`,
        });
        fetchJobs();
        fetchCounts();
        fetchCopilotStatus();
        fetchActivity();
      } else {
        setStatus({ type: "error", title: "Autopilot failed", detail: data.error });
      }
    } catch (err) {
      setStatus({ type: "error", title: "Autopilot error", detail: String(err) });
    } finally {
      setRunningAutopilot(false);
    }
  };

  // ── Screening handlers ──
  const handleGenerateDefaults = async () => {
    setScreeningLoading(true);
    try {
      const res = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-defaults" }),
      });
      const data = await res.json();
      if (data.success) setScreeningQs(data.data.answers);
    } catch { /* ignore */ }
    setScreeningLoading(false);
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      const res = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", question: newQuestion.trim(), answer: newAnswer.trim(), category: "general" }),
      });
      const data = await res.json();
      if (data.success) { setScreeningQs(data.data.answers); setNewQuestion(""); setNewAnswer(""); }
    } catch { /* ignore */ }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      const res = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (data.success) setScreeningQs(data.data.answers);
    } catch { /* ignore */ }
  };

  const handleAiAnswer = async () => {
    const qs = customQsInput.split("\n").map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) return;
    setAiGenerating(true);
    try {
      const res = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ai-answer", questions: qs }),
      });
      const data = await res.json();
      if (data.success) { setScreeningQs(data.data.answers); setCustomQsInput(""); }
    } catch { /* ignore */ }
    setAiGenerating(false);
  };

  const handleSaveScreening = async () => {
    try {
      await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", answers: screeningQs }),
      });
      setStatus({ type: "success", title: "Screening answers saved" });
    } catch { /* ignore */ }
  };

  // Stats from all-status counts
  const statItems = [
    { label: "Total Jobs", value: allCounts.total, icon: Briefcase, color: "text-gray-700 bg-gray-50 border-gray-200" },
    { label: "Matched", value: allCounts.matched, icon: BarChart3, color: "text-blue-700 bg-blue-50 border-blue-200" },
    { label: "Applied", value: allCounts.applied, icon: CheckCircle, color: "text-green-700 bg-green-50 border-green-200" },
    { label: "Skipped", value: allCounts.skipped, icon: Clock, color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
    { label: "Failed", value: allCounts.failed, icon: XCircle, color: "text-red-700 bg-red-50 border-red-200" },
  ];

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "matched", label: "Matched", count: allCounts.matched },
    { key: "all", label: "All", count: allCounts.total },
    { key: "applied", label: "Applied", count: allCounts.applied },
    { key: "skipped", label: "Skipped", count: allCounts.skipped },
    { key: "failed", label: "Failed", count: allCounts.failed },
  ];

  const lastRun = recentRuns[0];
  const copilotRunning = copilotConfig?.enabled && copilotConfig?.onboardingComplete;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* View Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200">
          {(["jobs", "scout", "screening"] as ViewTab[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-sm px-4 py-2 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                view === v ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {v === "jobs" ? <Briefcase size={14} /> : v === "scout" ? <Sparkles size={14} /> : <MessageSquare size={14} />}
              {v === "jobs" ? "Dashboard" : v === "scout" ? "AI Scout" : "Screening Q&A"}
            </button>
          ))}
        </div>
        {view === "jobs" && (
          <div className="flex items-center gap-2">
            <button onClick={handleScrape} disabled={scraping || analyzing}
              className="inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all">
              {scraping ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {scraping ? "Scraping..." : "Scrape Jobs"}
            </button>
            <button onClick={handleAnalyze} disabled={analyzing || scraping}
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {analyzing ? "Analyzing..." : "AI Analyze"}
            </button>
            <button onClick={handleClearAll} disabled={clearing || scraping || analyzing}
              className="inline-flex items-center gap-1.5 text-sm bg-white border border-red-200 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-all">
              {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        )}
      </div>

      {/* Status Banner */}
      {status && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 transition-all ${
          status.type === "info" ? "bg-blue-50 border-blue-200 text-blue-800"
          : status.type === "success" ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <div className="mt-0.5 flex-shrink-0">
            {status.type === "info" && <Loader2 size={18} className="animate-spin" />}
            {status.type === "success" && <CheckCircle2 size={18} />}
            {status.type === "error" && <AlertCircle size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{status.title}</p>
            {status.detail && <p className="text-sm mt-0.5 opacity-80">{status.detail}</p>}
            {scraping && scrapeStep && (
              <div className="mt-2">
                <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
                <p className="text-xs mt-1 opacity-70">{scrapeStep}</p>
              </div>
            )}
            {analyzing && (
              <div className="mt-2">
                <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: "45%" }} />
                </div>
                <p className="text-xs mt-1 opacity-70">Grok is analyzing job fit and generating cover letters...</p>
              </div>
            )}
          </div>
          {status.type !== "info" && (
            <button onClick={clearStatus} className="flex-shrink-0 opacity-60 hover:opacity-100"><X size={16} /></button>
          )}
        </div>
      )}

      {view === "scout" ? (
        <AIScout />
      ) : view === "screening" ? (
        /* ─── Screening Q&A Tab ─── */
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare size={20} className="text-indigo-500" /> Screening Questions & Answers
                </h2>
                <p className="text-sm text-gray-500 mt-1">Pre-configure answers to common application questions. These will be used during auto-apply.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleGenerateDefaults} disabled={screeningLoading}
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {screeningLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Generate from Profile
                </button>
                <button onClick={handleSaveScreening}
                  className="text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5">
                  <CheckCircle size={14} /> Save All
                </button>
              </div>
            </div>

            {/* Existing Q&A list */}
            {screeningQs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No screening answers yet</p>
                <p className="text-sm mt-1">Click &quot;Generate from Profile&quot; or add your own below.</p>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {screeningQs.map((q) => (
                  <div key={q.id} className="border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            q.category === "experience" ? "bg-blue-50 text-blue-600"
                            : q.category === "salary" ? "bg-green-50 text-green-600"
                            : q.category === "legal" ? "bg-yellow-50 text-yellow-700"
                            : q.category === "technical" ? "bg-purple-50 text-purple-600"
                            : q.category === "availability" ? "bg-indigo-50 text-indigo-600"
                            : "bg-gray-50 text-gray-600"
                          }`}>{q.category}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800">{q.question}</p>
                        <textarea
                          value={q.answer}
                          onChange={(e) => setScreeningQs((prev) => prev.map((x) => x.id === q.id ? { ...x, answer: e.target.value } : x))}
                          className="mt-2 w-full text-sm text-gray-600 border border-gray-100 rounded-md p-2 resize-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                          rows={2}
                        />
                      </div>
                      <button onClick={() => handleDeleteQuestion(q.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-1">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add manual Q&A */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Add Custom Question</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Question..." className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-300" />
                <input type="text" value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="Answer..." className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-300" />
              </div>
              <button onClick={handleAddQuestion} disabled={!newQuestion.trim()}
                className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                + Add Question
              </button>
            </div>

            {/* AI-generate answers for custom questions */}
            <div className="border-t border-gray-100 pt-4 mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Brain size={14} className="text-indigo-500" /> AI-Generate Answers
              </h3>
              <p className="text-xs text-gray-500">Paste screening questions (one per line) and AI will generate answers based on your profile.</p>
              <textarea value={customQsInput} onChange={(e) => setCustomQsInput(e.target.value)}
                placeholder={"What is your experience with React?\nAre you comfortable working in a fast-paced environment?\nDescribe a challenging project you worked on."}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-indigo-300"
                rows={4} />
              <button onClick={handleAiAnswer} disabled={aiGenerating || !customQsInput.trim()}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                {aiGenerating ? "Generating..." : "Generate Answers with AI"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Copilot Status Card */}
      {copilotConfig && (
        <div className={`rounded-xl border p-5 flex items-center justify-between flex-wrap gap-4 transition-colors ${
          copilotRunning ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              copilotRunning ? "bg-green-100" : "bg-gray-200"
            }`}>
              <Zap size={20} className={copilotRunning ? "text-green-600" : "text-gray-400"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">JobPilot Copilot</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  copilotRunning ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                }`}>
                  {copilotRunning ? "Active" : copilotConfig.onboardingComplete ? "Paused" : "Setup Required"}
                </span>
                <span className="text-xs text-gray-400 capitalize">{copilotConfig.mode.replace("-", " ")}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {lastRun
                  ? `Last run: ${new Date(lastRun.runAt).toLocaleString()} — ${lastRun.jobsFound} found, ${lastRun.jobsMatched} matched, ${lastRun.jobsApplied} applied`
                  : "No runs yet. Click Scrape Jobs to start."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!copilotConfig.onboardingComplete ? (
              <Link href="/onboarding"
                className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                <Settings size={14} /> Configure <ChevronRight size={14} />
              </Link>
            ) : (
              <>
                <button onClick={handleRunAutopilot} disabled={runningAutopilot || togglingCopilot}
                  className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {runningAutopilot ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {runningAutopilot ? "Running..." : "Run Now"}
                </button>
                <button onClick={handleToggleCopilot} disabled={togglingCopilot}
                  className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50 ${
                    copilotRunning
                      ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}>
                  {togglingCopilot ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                  {copilotRunning ? "Pause" : "Activate"}
                </button>
                <Link href="/onboarding" className="text-sm text-gray-500 hover:text-indigo-600 p-2 rounded-lg hover:bg-white">
                  <Settings size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statItems.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={16} />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <div className="text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Two-column: Jobs + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs Panel (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`text-sm px-3 py-2 rounded-md font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Job List */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="animate-spin mr-2" size={20} /> Loading jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200">
              <Filter size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">No jobs found</p>
              <p className="text-sm mt-1">
                {activeTab === "matched"
                  ? 'Click "Scrape Jobs" then "AI Analyze" to find matches.'
                  : "No jobs with this status yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} onApply={handleApply} onSkip={handleSkip} onEditCover={handleEditCover} />
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed Sidebar (1/3 width) */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Activity size={16} className="text-indigo-500" /> Recent Activity
            </h3>
            {activityLogs.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No activity yet</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {activityLogs.slice(0, 15).map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      log.status === "applied" ? "bg-green-500" : log.status === "failed" ? "bg-red-500" : "bg-gray-300"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 truncate">
                        <span className="font-medium capitalize">{log.status}</span>: {log.jobTitle}
                      </p>
                      <p className="text-xs text-gray-400">{log.company} &middot; {new Date(log.appliedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Copilot Runs */}
          {recentRuns.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Clock size={16} className="text-indigo-500" /> Copilot Runs
              </h3>
              <div className="space-y-2">
                {recentRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="text-xs text-gray-600 flex items-center justify-between">
                    <span>{new Date(run.runAt).toLocaleString()}</span>
                    <span className="text-gray-400">{run.jobsFound}F / {run.jobsMatched}M / {run.jobsApplied}A</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <Link href="/onboarding" className="text-sm text-indigo-600 hover:underline flex items-center gap-2">
              <Settings size={14} /> Copilot Configuration
            </Link>
            <Link href="/settings" className="text-sm text-indigo-600 hover:underline flex items-center gap-2">
              <Settings size={14} /> Account Settings
            </Link>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
