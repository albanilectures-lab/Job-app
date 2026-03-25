"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Tag, Sparkles, BarChart3, Loader2 } from "lucide-react";
import type { Resume, UserProfile, ResumeScore } from "@/lib/types";

interface ResumeUploaderProps {
  resumes: Resume[];
  onUpload: (file: File, label: string, skills: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onProfileExtracted?: (profile: UserProfile) => void;
  maxResumes?: number;
}

export default function ResumeUploader({ resumes, onUpload, onDelete, onProfileExtracted, maxResumes = 8 }: ResumeUploaderProps) {
  const [label, setLabel] = useState("");
  const [skills, setSkills] = useState("");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [resumeScores, setResumeScores] = useState<Record<string, ResumeScore>>({});

  const scoreResume = async (resumeId: string) => {
    if (resumeScores[resumeId]) {
      // Toggle off if already shown
      setResumeScores((prev) => { const copy = { ...prev }; delete copy[resumeId]; return copy; });
      return;
    }
    setScoringId(resumeId);
    try {
      const res = await fetch(`/api/screening?what=score&resumeId=${resumeId}`);
      const data = await res.json();
      if (data.success) setResumeScores((prev) => ({ ...prev, [resumeId]: data.data }));
      else setMessage({ type: "error", text: data.error || "Scoring failed" });
    } catch (err) {
      setMessage({ type: "error", text: "Scoring error: " + String(err) });
    } finally {
      setScoringId(null);
    }
  };

  const extractProfileFromFile = async (file: File | Blob, filename: string) => {
    setExtracting(true);
    setMessage({ type: "success", text: "Extracting profile info from resume..." });
    try {
      const form = new FormData();
      form.append("file", file, filename);
      const res = await fetch("/api/resumes/parse", { method: "POST", body: form });
      const data = await res.json();
      if (data.success && data.data) {
        onProfileExtracted?.(data.data);
        setMessage({ type: "success", text: "Profile info extracted and filled!" });
        if (!skills.trim() && data.data.skills?.length) {
          setSkills(data.data.skills.join(", "));
        }
      } else {
        setMessage({ type: "error", text: data.error || "Failed to extract profile info." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Extraction failed: " + String(err) });
    } finally {
      setExtracting(false);
    }
  };

  const extractProfile = async (file: File) => {
    await extractProfileFromFile(file, file.name);
  };

  const extractFromExisting = async (resume: Resume) => {
    try {
      const res = await fetch(`/api/resumes?id=${resume.id}&file=1`);
      if (!res.ok) throw new Error("Could not fetch resume file");
      const blob = await res.blob();
      await extractProfileFromFile(blob, resume.filename);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to load resume: " + String(err) });
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      setMessage({ type: "error", text: "Only PDF files are accepted." });
      return;
    }
    if (!label.trim()) {
      setMessage({ type: "error", text: "Please enter a label (e.g. C#_AWS_Angular)" });
      return;
    }

    // Extract profile if auto-fill is on
    if (autoFill && onProfileExtracted) {
      pendingFileRef.current = file;
      await extractProfile(file);
    }

    setUploading(true);
    setMessage(null);
    try {
      await onUpload(file, label.trim(), skills.trim());
      setLabel("");
      setSkills("");
      pendingFileRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
      setMessage({ type: "success", text: "Resume uploaded successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: "Upload failed: " + String(err) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <FileText size={20} className="text-indigo-600" />
        Resumes ({resumes.length}/{maxResumes})
      </h2>

      {/* Uploaded Resumes */}
      {resumes.length > 0 && (
        <div className="space-y-2 mb-4">
          {resumes.map((r) => (
            <div key={r.id} className="bg-gray-50 rounded-lg px-4 py-2">
              <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                <p className="text-xs text-gray-500">{r.filename}</p>
                {r.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.skills.slice(0, 6).map((s) => (
                      <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {r.skills.length > 6 && (
                      <span className="text-xs text-gray-400">+{r.skills.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => scoreResume(r.id)}
                  disabled={scoringId === r.id}
                  className="text-gray-400 hover:text-blue-600 p-1 disabled:opacity-50"
                  title="Check resume quality score"
                >
                  {scoringId === r.id ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                </button>
                {onProfileExtracted && (
                  <button
                    onClick={() => extractFromExisting(r)}
                    disabled={extracting}
                    className="text-indigo-500 hover:text-indigo-700 p-1 disabled:opacity-50"
                    title="Extract profile from this resume"
                  >
                    <Sparkles size={16} />
                  </button>
                )}
                <button
                  onClick={() => onDelete(r.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="Delete resume"
                >
                  <X size={16} />
                </button>
              </div>
              </div>
              {/* Resume Quality Score Card */}
              {resumeScores[r.id] && (
                <div className="mt-2 bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`text-lg font-bold px-2 py-0.5 rounded ${
                      resumeScores[r.id].overall >= 85 ? "bg-green-100 text-green-700"
                      : resumeScores[r.id].overall >= 70 ? "bg-blue-100 text-blue-700"
                      : resumeScores[r.id].overall >= 50 ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                    }`}>{resumeScores[r.id].overall}/100</div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      resumeScores[r.id].overall >= 85 ? "bg-green-50 text-green-600"
                      : resumeScores[r.id].overall >= 70 ? "bg-blue-50 text-blue-600"
                      : resumeScores[r.id].overall >= 50 ? "bg-yellow-50 text-yellow-600"
                      : "bg-red-50 text-red-600"
                    }`}>
                      {resumeScores[r.id].overall >= 85 ? "Excellent" : resumeScores[r.id].overall >= 70 ? "Good" : resumeScores[r.id].overall >= 50 ? "Fair" : "Needs Work"}
                    </span>
                    <div className="flex gap-2 ml-auto text-xs">
                      {resumeScores[r.id].atsFriendly
                        ? <span className="text-green-600">&#10003; ATS Friendly</span>
                        : <span className="text-red-500">&#10007; ATS Issues</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs mb-2">
                    <span className={resumeScores[r.id].hasContactInfo ? "bg-green-50 text-green-600 px-2 py-0.5 rounded" : "bg-red-50 text-red-500 px-2 py-0.5 rounded"}>
                      {resumeScores[r.id].hasContactInfo ? "\u2713" : "\u2717"} Contact
                    </span>
                    <span className={resumeScores[r.id].hasSkillsSection ? "bg-green-50 text-green-600 px-2 py-0.5 rounded" : "bg-red-50 text-red-500 px-2 py-0.5 rounded"}>
                      {resumeScores[r.id].hasSkillsSection ? "\u2713" : "\u2717"} Skills
                    </span>
                    <span className={resumeScores[r.id].hasExperienceSection ? "bg-green-50 text-green-600 px-2 py-0.5 rounded" : "bg-red-50 text-red-500 px-2 py-0.5 rounded"}>
                      {resumeScores[r.id].hasExperienceSection ? "\u2713" : "\u2717"} Experience
                    </span>
                    <span className={resumeScores[r.id].hasEducationSection ? "bg-green-50 text-green-600 px-2 py-0.5 rounded" : "bg-red-50 text-red-500 px-2 py-0.5 rounded"}>
                      {resumeScores[r.id].hasEducationSection ? "\u2713" : "\u2717"} Education
                    </span>
                  </div>
                  {resumeScores[r.id].issues.length > 0 && (
                    <div className="text-xs text-red-600 space-y-0.5 mb-1">
                      {resumeScores[r.id].issues.map((issue, i) => <p key={i}>&bull; {issue}</p>)}
                    </div>
                  )}
                  {resumeScores[r.id].tips.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {resumeScores[r.id].tips.map((tip, i) => <p key={i}>&#128161; {tip}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      {resumes.length < maxResumes && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium flex items-center gap-1 mb-1">
                <Tag size={12} /> Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. C#_AWS_Angular"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">Skills (comma-separated)</label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="e.g. C#, AWS, Angular, .NET"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {onProfileExtracted && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFill}
                onChange={(e) => setAutoFill(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <Sparkles size={14} className="text-amber-500" />
              Auto-fill profile from resume (uses AI)
            </label>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400"}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleUpload(file);
            }}
          >
            <Upload size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">
              {extracting ? "Extracting profile info..." : uploading ? "Uploading..." : "Drop PDF here or click to browse"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>

          {message && (
            <p className={`text-sm font-medium ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
