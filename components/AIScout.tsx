"use client";

import { useState } from "react";
import { Search, Loader2, ExternalLink, Copy, Check, ChevronDown, ChevronUp, Download, Sparkles } from "lucide-react";

interface SearchLink {
  site: string;
  url: string;
  description: string;
}

interface AnalyzeResult {
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  requirements: string[];
  coverLetter: string;
  summary: string;
}

export default function AIScout() {
  // Scout state
  const [scoutLoading, setScoutLoading] = useState(false);
  const [searchLinks, setSearchLinks] = useState<SearchLink[]>([]);
  const [tips, setTips] = useState<string[]>([]);

  // Analyzer state
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [jobDesc, setJobDesc] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");

  const [copied, setCopied] = useState(false);
  const [showCover, setShowCover] = useState(false);

  const handleScout = async () => {
    setScoutLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scout" }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchLinks(data.data.searchLinks ?? []);
        setTips(data.data.tips ?? []);
      }
    } catch (err) {
      console.error("Scout error:", err);
    } finally {
      setScoutLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!jobDesc.trim()) return;
    setAnalyzeLoading(true);
    setAnalyzeError("");
    setAnalyzeResult(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyzeDescription", jobDescription: jobDesc, jobTitle, company }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalyzeResult(data.data);
        setShowCover(false);
      } else {
        setAnalyzeError(data.error ?? "Analysis failed");
      }
    } catch (err) {
      setAnalyzeError(String(err));
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCoverPdf = (title: string, comp: string, letter: string) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const safe = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!DOCTYPE html><html><head><title>Cover Letter - ${safe(title)}</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#222;line-height:1.7}
h1{font-size:18px;margin-bottom:4px}p.meta{color:#666;font-size:13px;margin:2px 0 20px}
.letter{white-space:pre-wrap;font-size:14px}
@media print{body{margin:0;padding:30px}}</style></head><body>
<h1>${safe(title)}</h1><p class="meta">${safe(comp)} &mdash; ${new Date().toLocaleDateString()}</p>
<hr style="border:none;border-top:1px solid #ccc;margin:16px 0">
<div class="letter">${safe(letter)}</div>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const scoreColor = (s: number) =>
    s >= 75 ? "text-green-600 bg-green-50 border-green-200"
    : s >= 50 ? "text-yellow-600 bg-yellow-50 border-yellow-200"
    : "text-red-600 bg-red-50 border-red-200";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Smart Search Links */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-500" /> Smart Job Search
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              AI generates personalized search links for major job sites based on your profile.
            </p>
          </div>
          <button
            onClick={handleScout}
            disabled={scoutLoading}
            className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {scoutLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {scoutLoading ? "Generating..." : searchLinks.length ? "Regenerate" : "Generate Links"}
          </button>
        </div>

        {searchLinks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {searchLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors group"
              >
                <ExternalLink size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">{link.site}</p>
                  <p className="text-xs text-gray-500 truncate">{link.description}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {tips.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-medium text-amber-700 mb-1">Tips</p>
            <ul className="text-xs text-amber-600 space-y-0.5">
              {tips.map((tip, i) => <li key={i}>• {tip}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* Job Description Analyzer */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Job Description Analyzer</h2>
        <p className="text-sm text-gray-500 mb-4">
          Paste a job description to get AI-powered fit analysis, skill matching, and a cover letter.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <input
            type="text"
            placeholder="Job Title (optional)"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
          <input
            type="text"
            placeholder="Company (optional)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
        </div>
        <textarea
          placeholder="Paste the full job description here..."
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
          rows={8}
          className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none resize-y mb-3"
        />
        <button
          onClick={handleAnalyze}
          disabled={analyzeLoading || !jobDesc.trim()}
          className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {analyzeLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {analyzeLoading ? "Analyzing..." : "Analyze Fit"}
        </button>

        {analyzeError && (
          <p className="mt-3 text-sm text-red-600">{analyzeError}</p>
        )}

        {analyzeResult && (
          <div className="mt-5 space-y-4">
            {/* Score + Summary */}
            <div className="flex items-start gap-4">
              <div className={`text-2xl font-bold px-4 py-2 rounded-lg border ${scoreColor(analyzeResult.fitScore)}`}>
                {analyzeResult.fitScore}%
              </div>
              <p className="text-sm text-gray-700 leading-relaxed flex-1">{analyzeResult.summary}</p>
            </div>

            {/* Skills */}
            <div className="grid gap-4 sm:grid-cols-2">
              {analyzeResult.matchedSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Matched Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analyzeResult.matchedSkills.map((s) => (
                      <span key={s} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {analyzeResult.missingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Missing Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analyzeResult.missingSkills.map((s) => (
                      <span key={s} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Requirements */}
            {analyzeResult.requirements.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Key Requirements</p>
                <ul className="text-sm text-gray-600 space-y-0.5">
                  {analyzeResult.requirements.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            )}

            {/* Cover Letter */}
            {analyzeResult.coverLetter && (
              <div>
                <button
                  onClick={() => setShowCover(!showCover)}
                  className="text-sm font-medium text-indigo-600 hover:underline flex items-center gap-1"
                >
                  {showCover ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showCover ? "Hide Cover Letter" : "Show Cover Letter"}
                </button>
                {showCover && (
                  <div className="mt-2 bg-gray-50 rounded-lg p-4 relative">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {analyzeResult.coverLetter}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => copyText(analyzeResult.coverLetter)}
                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                      <button
                        onClick={() => downloadCoverPdf(jobTitle || "Position", company || "Company", analyzeResult.coverLetter)}
                        className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <Download size={12} /> PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
