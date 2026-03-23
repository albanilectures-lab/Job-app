"use client";

import { useState, useEffect, useCallback } from "react";
import JobCard from "@/components/JobCard";
import StatsBar from "@/components/StatsBar";
import type { Job, JobStatus } from "@/lib/types";
import { Search, Brain, Loader2, Filter, CheckCircle2, AlertCircle, X } from "lucide-react";

type FilterTab = "all" | "matched" | "applied" | "skipped" | "failed";

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

  // Separate counts fetched from DB (all statuses)
  const [allCounts, setAllCounts] = useState({ total: 0, matched: 0, applied: 0, skipped: 0, failed: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?counts=true");
      const data = await res.json();
      if (data.counts) setAllCounts(data.counts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchCounts();
  }, [fetchJobs, fetchCounts]);

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
      const timeout = setTimeout(() => controller.abort(), 55000);
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

  // Stats from all-status counts
  const stats = {
    totalJobs: allCounts.total,
    matched: allCounts.matched,
    applied: allCounts.applied,
    skipped: allCounts.skipped,
    failed: allCounts.failed,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "matched", label: "Matched" },
    { key: "all", label: "All" },
    { key: "applied", label: "Applied" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScrape}
            disabled={scraping || analyzing}
            className="inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
          >
            {scraping ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {scraping ? "Scraping..." : "Scrape Jobs"}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || scraping}
            className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            {analyzing ? "Analyzing..." : "AI Analyze"}
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {status && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-start gap-3 transition-all ${
            status.type === "info"
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : status.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
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
            <button onClick={clearStatus} className="flex-shrink-0 opacity-60 hover:opacity-100">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <StatsBar {...stats} />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-sm px-4 py-2 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "bg-indigo-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Job List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Filter size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">No jobs found</p>
          <p className="text-sm mt-1">
            {activeTab === "matched"
              ? 'Click "Scrape Jobs" then "AI Analyze" to find matches.'
              : "No jobs with this status yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onApply={handleApply}
              onSkip={handleSkip}
              onEditCover={handleEditCover}
            />
          ))}
        </div>
      )}
    </div>
  );
}
