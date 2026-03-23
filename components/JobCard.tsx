"use client";

import { useState, useEffect, useCallback } from "react";
import type { Job } from "@/lib/types";
import { cn, truncate } from "@/lib/utils";
import { ExternalLink, Send, X, Edit3, ChevronDown, ChevronUp, ClipboardCopy, ClipboardCheck, User, Download } from "lucide-react";

interface ProfileDetails {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  skills: string[];
  yearsExperience: number;
}

interface JobCardProps {
  job: Job;
  onApply: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  onEditCover: (jobId: string, cover: string) => void;
}

export default function JobCard({ job, onApply, onSkip, onEditCover }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [coverText, setCoverText] = useState(job.coverLetter ?? "");
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const downloadCoverLetterPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Cover Letter - ${job.title}</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#222;line-height:1.7}
h1{font-size:18px;margin-bottom:4px}p.meta{color:#666;font-size:13px;margin:2px 0 20px}
.letter{white-space:pre-wrap;font-size:14px}
@media print{body{margin:0;padding:30px}}</style></head><body>
<h1>${job.title}</h1><p class="meta">${job.company} &mdash; ${new Date().toLocaleDateString()}</p>
<hr style="border:none;border-top:1px solid #ccc;margin:16px 0">
<div class="letter">${(job.coverLetter ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 400);
  };

  const fetchProfile = useCallback(async () => {
    if (profile) return;
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) setProfile(data.data.profile);
    } catch { /* ignore */ }
  }, [profile]);

  useEffect(() => {
    if (showCopyPanel) fetchProfile();
  }, [showCopyPanel, fetchProfile]);

  const copyToClipboard = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const scoreColor =
    (job.fitScore ?? 0) >= 85
      ? "text-green-600 bg-green-50 border-green-200"
      : (job.fitScore ?? 0) >= 75
        ? "text-yellow-600 bg-yellow-50 border-yellow-200"
        : "text-red-500 bg-red-50 border-red-200";

  const statusBadge: Record<string, string> = {
    new: "bg-gray-100 text-gray-700",
    matched: "bg-blue-100 text-blue-700",
    applied: "bg-green-100 text-green-700",
    skipped: "bg-gray-200 text-gray-500",
    failed: "bg-red-100 text-red-700",
    rejected: "bg-red-200 text-red-800",
    interview: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                {job.title}
              </h3>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusBadge[job.status] ?? statusBadge.new)}>
                {job.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{job.company}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{job.source}</span>
              {job.salary && <span className="text-green-600 font-medium">{job.salary}</span>}
              <span>{job.location}</span>
            </div>
          </div>

          {/* Fit Score */}
          {job.fitScore !== undefined && job.fitScore !== null && (
            <div className={cn("flex-shrink-0 rounded-lg border px-3 py-2 text-center", scoreColor)}>
              <div className="text-2xl font-bold">{job.fitScore}</div>
              <div className="text-xs">fit</div>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? "Less" : "More details"}
        </button>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 border-t border-gray-100">
          {/* Description */}
          <div className="mt-3">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
              {truncate(job.description, 800)}
            </p>
          </div>

          {/* Cover Letter */}
          {job.coverLetter && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium text-gray-700">Generated Cover Letter</h4>
                <div className="flex items-center gap-3">
                  <button
                    onClick={downloadCoverLetterPdf}
                    className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                  >
                    <Download size={12} /> PDF
                  </button>
                  <button
                    onClick={() => setEditingCover(!editingCover)}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Edit3 size={12} /> {editingCover ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>
              {editingCover ? (
                <div>
                  <textarea
                    value={coverText}
                    onChange={(e) => setCoverText(e.target.value)}
                    rows={8}
                    className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none resize-y"
                  />
                  <button
                    onClick={() => {
                      onEditCover(job.id, coverText);
                      setEditingCover(false);
                    }}
                    className="mt-2 text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700"
                  >
                    Save Cover Letter
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                  {truncate(job.coverLetter, 600)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 sm:px-5 py-3 bg-gray-50 flex items-center gap-2 flex-wrap border-t border-gray-100">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
        >
          <ExternalLink size={14} /> View
        </a>

        {(job.status === "matched" || job.status === "skipped" || job.status === "failed") && (
          <>
            <button
              onClick={() => onApply(job.id)}
              className="inline-flex items-center gap-1 text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg font-medium"
            >
              <Send size={14} /> {job.status === "matched" ? "Apply Now" : "Reapply"}
            </button>
            <button
              onClick={() => setShowCopyPanel(!showCopyPanel)}
              className={cn(
                "inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border font-medium",
                showCopyPanel
                  ? "text-indigo-700 bg-indigo-50 border-indigo-300"
                  : "text-gray-600 hover:text-indigo-600 border-gray-200 bg-white hover:bg-gray-50"
              )}
            >
              <User size={14} /> Copy Details
            </button>
            {job.status === "matched" && (
              <button
                onClick={() => onSkip(job.id)}
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-red-50"
              >
                <X size={14} /> Skip
              </button>
            )}
          </>
        )}
      </div>

      {/* Copy Details Panel */}
      {showCopyPanel && (
        <CopyDetailsPanel
          profile={profile}
          coverLetter={job.coverLetter}
          copiedField={copiedField}
          onCopy={copyToClipboard}
        />
      )}
    </div>
  );
}

function CopyRow({ label, value, field, copiedField, onCopy }: {
  label: string; value: string; field: string;
  copiedField: string | null; onCopy: (field: string, value: string) => void;
}) {
  if (!value) return null;
  const isCopied = copiedField === field;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg hover:bg-gray-50 group">
      <div className="min-w-0 flex-1">
        <span className="text-xs text-gray-400 block">{label}</span>
        <span className="text-sm text-gray-800 block truncate">{value}</span>
      </div>
      <button
        onClick={() => onCopy(field, value)}
        className={cn(
          "flex-shrink-0 p-1.5 rounded-md transition-colors",
          isCopied ? "text-green-600 bg-green-50" : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
        )}
        title={isCopied ? "Copied!" : `Copy ${label}`}
      >
        {isCopied ? <ClipboardCheck size={14} /> : <ClipboardCopy size={14} />}
      </button>
    </div>
  );
}

function CopyDetailsPanel({ profile, coverLetter, copiedField, onCopy }: {
  profile: ProfileDetails | null; coverLetter?: string;
  copiedField: string | null; onCopy: (field: string, value: string) => void;
}) {
  if (!profile) {
    return (
      <div className="px-4 sm:px-5 py-4 border-t border-indigo-100 bg-indigo-50/30 text-sm text-gray-500">
        Loading profile...
      </div>
    );
  }

  if (!profile.fullName && !profile.email) {
    return (
      <div className="px-4 sm:px-5 py-4 border-t border-indigo-100 bg-indigo-50/30 text-sm text-gray-500">
        No profile configured. Go to <a href="/settings" className="text-indigo-600 underline">Settings</a> to set up your profile.
      </div>
    );
  }

  const copyAll = () => {
    const lines = [
      profile.fullName && `Name: ${profile.fullName}`,
      profile.email && `Email: ${profile.email}`,
      profile.phone && `Phone: ${profile.phone}`,
      profile.linkedinUrl && `LinkedIn: ${profile.linkedinUrl}`,
      profile.githubUrl && `GitHub: ${profile.githubUrl}`,
      profile.portfolioUrl && `Portfolio: ${profile.portfolioUrl}`,
      profile.yearsExperience && `Experience: ${profile.yearsExperience} years`,
      profile.skills?.length && `Skills: ${profile.skills.join(", ")}`,
      coverLetter && `\nCover Letter:\n${coverLetter}`,
    ].filter(Boolean).join("\n");
    onCopy("all", lines);
  };

  return (
    <div className="px-4 sm:px-5 py-3 border-t border-indigo-100 bg-indigo-50/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Your Details — Click to Copy</h4>
        <button
          onClick={copyAll}
          className={cn(
            "text-xs px-2 py-1 rounded font-medium transition-colors",
            copiedField === "all" ? "text-green-700 bg-green-100" : "text-indigo-600 hover:bg-indigo-100"
          )}
        >
          {copiedField === "all" ? "Copied All!" : "Copy All"}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
        <CopyRow label="Full Name" value={profile.fullName} field="name" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="Email" value={profile.email} field="email" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="Phone" value={profile.phone} field="phone" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="LinkedIn" value={profile.linkedinUrl ?? ""} field="linkedin" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="GitHub" value={profile.githubUrl ?? ""} field="github" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="Portfolio" value={profile.portfolioUrl ?? ""} field="portfolio" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="Experience" value={profile.yearsExperience ? `${profile.yearsExperience} years` : ""} field="experience" copiedField={copiedField} onCopy={onCopy} />
        <CopyRow label="Skills" value={profile.skills?.join(", ") ?? ""} field="skills" copiedField={copiedField} onCopy={onCopy} />
      </div>
      {coverLetter && (
        <div className="mt-2 pt-2 border-t border-indigo-100">
          <CopyRow label="Cover Letter" value={coverLetter} field="cover" copiedField={copiedField} onCopy={onCopy} />
        </div>
      )}
    </div>
  );
}
