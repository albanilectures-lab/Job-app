"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile, SearchConfig, CopilotConfig, CopilotMode, JobType, SeniorityLevel, JobBoard, Resume } from "@/lib/types";
import { Loader2, ChevronRight, ChevronLeft, Check, MapPin, Filter, User, Zap, Plus, X, Upload, FileText, Sparkles } from "lucide-react";

const ALL_BOARDS: JobBoard[] = ["weworkremotely", "remoteok", "remotive", "jobicy", "arbeitnow", "themuse"];
const JOB_TYPES: { key: JobType; label: string }[] = [
  { key: "fulltime", label: "Fulltime" },
  { key: "part-time", label: "Part-Time" },
  { key: "contract", label: "Contract / Temp" },
  { key: "internship", label: "Internship" },
];
const SENIORITY: { key: SeniorityLevel; label: string }[] = [
  { key: "entry", label: "Entry Level" },
  { key: "associate", label: "Associate Level" },
  { key: "mid-senior", label: "Mid-to-Senior Level" },
  { key: "director", label: "Director Level and above" },
];
const TIMEZONES = ["Americas - Eastern", "Americas - Central", "Americas - Mountain", "Americas - Pacific", "Europe - Western", "Europe - Central", "Europe - Eastern", "Asia - East", "Asia - South", "Oceania"];
const AVAILABILITY: { key: string; label: string }[] = [
  { key: "immediately", label: "Immediately" },
  { key: "1week", label: "In 1 Week" },
  { key: "2weeks", label: "In 2 Weeks" },
  { key: "1month", label: "In 1 Month" },
  { key: "2months", label: "In 2 Months" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Step 1: Search Preferences
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [boards, setBoards] = useState<JobBoard[]>(ALL_BOARDS);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [jobTypes, setJobTypes] = useState<JobType[]>(["fulltime"]);

  // Step 2: Filters
  const [matchThreshold, setMatchThreshold] = useState(70);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>(["mid-senior"]);
  const [timezones, setTimezones] = useState<string[]>([]);

  // Step 3: Profile
  const [profile, setProfile] = useState<UserProfile>({
    fullName: "", email: "", phone: "", skills: [], yearsExperience: 0,
  });
  const [skillInput, setSkillInput] = useState("");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [coverLetterMode, setCoverLetterMode] = useState<"auto-generate" | "upload-own">("auto-generate");

  // Step 4: Copilot Mode
  const [copilotMode, setCopilotMode] = useState<CopilotMode>("manual-review");
  const [maxDailyApplies, setMaxDailyApplies] = useState(25);

  // Load existing data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding");
        const data = await res.json();
        if (data.success) {
          const { profile: p, searchConfig: sc, copilotConfig: cc, resumes: r } = data.data;
          if (p) {
            setProfile(p);
            setSkillInput(p.skills?.join(", ") ?? "");
          }
          if (sc) {
            setKeywords(sc.keywords ?? []);
            setBoards(sc.boards?.length ? sc.boards : ALL_BOARDS);
          }
          if (cc) {
            setRemoteOnly(cc.remoteOnly ?? true);
            setJobTypes(cc.jobTypes?.length ? cc.jobTypes : ["fulltime"]);
            setMatchThreshold(cc.matchThreshold ?? 70);
            setSeniorityLevels(cc.seniorityLevels?.length ? cc.seniorityLevels : ["mid-senior"]);
            setTimezones(cc.timezones ?? []);
            setCopilotMode(cc.mode ?? "manual-review");
            setCoverLetterMode(cc.coverLetterMode ?? "auto-generate");
            setMaxDailyApplies(cc.maxDailyApplies ?? 25);
          }
          if (r) setResumes(r);
        }
      } catch (err) {
        console.error("Failed to load onboarding data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveStep = async () => {
    setSaving(true);
    try {
      let body: any = { step };
      switch (step) {
        case 1:
          body.searchConfig = { keywords, boards, maxDailyApplies: 200, minFitScore: matchThreshold };
          body.copilotConfig = { remoteOnly, jobTypes };
          break;
        case 2:
          body.copilotConfig = { matchThreshold, seniorityLevels, timezones };
          break;
        case 3:
          body.profile = { ...profile, skills: skillInput.split(",").map(s => s.trim()).filter(Boolean) };
          break;
        case 4:
          body.copilotConfig = { mode: copilotMode, coverLetterMode, maxDailyApplies };
          break;
      }
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      console.error("Save step error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await saveStep();
    if (step < 4) setStep(step + 1);
    else router.push("/dashboard");
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setNewKeyword("");
    }
  };

  const toggleJobType = (t: JobType) => setJobTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleSeniority = (s: SeniorityLevel) => setSeniorityLevels(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleTimezone = (tz: string) => setTimezones(prev => prev.includes(tz) ? prev.filter(x => x !== tz) : [...prev, tz]);
  const toggleBoard = (b: JobBoard) => setBoards(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("label", file.name.replace(/\.[^.]+$/, ""));
    form.append("skills", "");
    try {
      const res = await fetch("/api/resumes", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) setResumes(prev => [data.data, ...prev]);
    } catch (err) {
      console.error("Upload error:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading...
      </div>
    );
  }

  const thresholdLabel = matchThreshold >= 80 ? "Highest" : matchThreshold >= 60 ? "Higher" : matchThreshold >= 40 ? "High" : "Standard";

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-full mb-3">
          <Sparkles size={12} /> Copilot Configuration
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Step {step} of 4</h1>
        <p className="text-sm text-gray-500 mt-1">
          {step === 1 && "First, select the jobs you are looking for"}
          {step === 2 && "Next, narrow your search with optional filters"}
          {step === 3 && "Great! Now let\u2019s complete your profile"}
          {step === 4 && "Final Step!"}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-1 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? "bg-indigo-600" : "bg-gray-200"}`} />
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        {/* STEP 1: Search Preferences */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
                <MapPin size={16} className="text-indigo-500" /> Work Location
              </h3>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-gray-700">Remote Jobs</span>
              </label>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Job Types</h3>
              <p className="text-xs text-gray-500 mb-2">What job types are you looking for? Select at least one.</p>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPES.map((jt) => (
                  <button key={jt.key} onClick={() => toggleJobType(jt.key)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                      jobTypes.includes(jt.key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                    }`}
                  >
                    {jobTypes.includes(jt.key) && <Check size={12} />}
                    {jt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Job Titles / Keywords</h3>
              <p className="text-xs text-gray-500 mb-2">What job titles are you looking for? Type and press Enter (up to 5).</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 text-sm bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    {kw}
                    <button onClick={() => setKeywords(keywords.filter(k => k !== kw))} className="hover:text-indigo-900"><X size={12} /></button>
                  </span>
                ))}
              </div>
              {keywords.length < 5 && (
                <div className="flex gap-2">
                  <input
                    type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                    placeholder="e.g. Software Engineer"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
                  />
                  <button onClick={addKeyword} className="text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus size={14} /></button>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Job Boards</h3>
              <p className="text-xs text-gray-500 mb-2">Select which job boards to search.</p>
              <div className="flex flex-wrap gap-2">
                {ALL_BOARDS.map((b) => (
                  <button key={b} onClick={() => toggleBoard(b)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      boards.includes(b) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Filters */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
                <Filter size={16} className="text-indigo-500" /> Job Match
              </h3>
              <p className="text-xs text-gray-500 mb-3">Your copilot will <strong>only</strong> apply to jobs where you meet <strong>most</strong> of the key requirements.</p>
              <input type="range" min={30} max={95} value={matchThreshold} onChange={(e) => setMatchThreshold(parseInt(e.target.value))}
                className="w-full accent-indigo-600" />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>High</span>
                <span className="font-medium text-indigo-600">{thresholdLabel} ({matchThreshold}%)</span>
                <span>Highest</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Seniority <span className="text-gray-400 font-normal">(optional)</span></h3>
              <p className="text-xs text-gray-500 mb-2">Filter jobs by seniority level.</p>
              <div className="flex flex-wrap gap-2">
                {SENIORITY.map((s) => (
                  <button key={s.key} onClick={() => toggleSeniority(s.key)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                      seniorityLevels.includes(s.key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                    }`}
                  >
                    {seniorityLevels.includes(s.key) && <Check size={12} />}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Time Zones <span className="text-gray-400 font-normal">(optional)</span></h3>
              <p className="text-xs text-gray-500 mb-2">Filter remote jobs by time zone.</p>
              <div className="flex flex-wrap gap-2">
                {TIMEZONES.map((tz) => (
                  <button key={tz} onClick={() => toggleTimezone(tz)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      timezones.includes(tz) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                    }`}
                  >
                    {tz}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" checked={true} readOnly className="rounded border-gray-300 text-indigo-600" />
                <span className="text-xs text-gray-600">Include jobs that are open to any time zone / flexible</span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: Profile & Resume */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Resume Upload */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                <FileText size={16} className="text-indigo-500" /> Confirm your CV/Resume
              </h3>
              {resumes.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {resumes.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <FileText size={16} className="text-indigo-500" />
                      <span className="text-sm font-medium text-gray-700 flex-1">{r.filename}</span>
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Uploaded</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-2">No resume uploaded yet.</p>
              )}
              <label className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline cursor-pointer">
                <Upload size={14} /> Upload Resume (PDF)
                <input type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} />
              </label>
            </div>

            {/* Cover Letter Mode */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Cover Letter</h3>
              <div className="flex gap-2">
                <button onClick={() => setCoverLetterMode("auto-generate")}
                  className={`text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    coverLetterMode === "auto-generate" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  <Sparkles size={14} /> Auto-generate for each job
                </button>
                <button onClick={() => setCoverLetterMode("upload-own")}
                  className={`text-sm px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    coverLetterMode === "upload-own" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  <Upload size={14} /> Upload my own
                </button>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" value={profile.fullName} onChange={(v) => setProfile({ ...profile, fullName: v })} placeholder="John Doe" />
              <Field label="Email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} placeholder="john@example.com" type="email" />
              <Field label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} placeholder="+1 234 567 8900" />
              <Field label="Current/Previous Job Title" value={profile.currentTitle ?? ""} onChange={(v) => setProfile({ ...profile, currentTitle: v })} placeholder="Senior Software Engineer" />
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Country" value={profile.country ?? ""} onChange={(v) => setProfile({ ...profile, country: v })} placeholder="United States" />
              <Field label="City" value={profile.city ?? ""} onChange={(v) => setProfile({ ...profile, city: v })} placeholder="San Francisco" />
              <Field label="State" value={profile.state ?? ""} onChange={(v) => setProfile({ ...profile, state: v })} placeholder="California" />
              <Field label="Post Code" value={profile.postCode ?? ""} onChange={(v) => setProfile({ ...profile, postCode: v })} placeholder="94102" />
            </div>

            {/* Availability */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Availability / Notice Period</h3>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY.map((a) => (
                  <button key={a.key} onClick={() => setProfile({ ...profile, availability: a.key as any })}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                      profile.availability === a.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300"
                    }`}
                  >
                    {profile.availability === a.key && <Check size={12} />}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Work Auth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Work Authorization (countries)" value={(profile.workAuthCountries ?? []).join(", ")}
                onChange={(v) => setProfile({ ...profile, workAuthCountries: v.split(",").map(s => s.trim()).filter(Boolean) })}
                placeholder="United States, Canada" />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Visa Sponsorship Required?</label>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setProfile({ ...profile, visaSponsorship: false })}
                    className={`text-sm px-4 py-1.5 rounded-lg border ${!profile.visaSponsorship ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300"}`}>No</button>
                  <button onClick={() => setProfile({ ...profile, visaSponsorship: true })}
                    className={`text-sm px-4 py-1.5 rounded-lg border ${profile.visaSponsorship ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300"}`}>Yes</button>
                </div>
              </div>
            </div>

            {/* Skills */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Skills (comma-separated)</label>
              <input type="text" value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Python, React, AWS, TypeScript"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none" />
            </div>

            {/* Years + Salary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Years Experience" value={String(profile.yearsExperience || "")} onChange={(v) => setProfile({ ...profile, yearsExperience: parseInt(v) || 0 })} placeholder="5" type="number" />
              <Field label="LinkedIn URL" value={profile.linkedinUrl ?? ""} onChange={(v) => setProfile({ ...profile, linkedinUrl: v })} placeholder="https://linkedin.com/in/..." />
              <Field label="Expected Salary ($)" value={String(profile.expectedSalary ?? "")} onChange={(v) => setProfile({ ...profile, expectedSalary: parseInt(v) || undefined })} placeholder="120000" type="number" />
              <Field label="Nationality" value={profile.nationality ?? ""} onChange={(v) => setProfile({ ...profile, nationality: v })} placeholder="American" />
            </div>

            {/* Experience Summary */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Experience Summary</label>
              <textarea value={profile.experienceSummary ?? ""} onChange={(e) => setProfile({ ...profile, experienceSummary: e.target.value })}
                rows={4} placeholder="Brief summary of your professional experience..."
                className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none resize-y" />
              <p className="text-xs text-gray-400 text-right mt-0.5">{(profile.experienceSummary ?? "").length}/500</p>
            </div>
          </div>
        )}

        {/* STEP 4: Copilot Mode */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Zap size={16} className="text-indigo-500" /> Choose how JobPilot works for you
              </h3>

              <div className="space-y-3">
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  copilotMode === "manual-review" ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                }`}>
                  <input type="radio" name="mode" checked={copilotMode === "manual-review"} onChange={() => setCopilotMode("manual-review")}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Auto-Save & Manual Review</p>
                    <p className="text-xs text-gray-500 mt-0.5">Your copilot auto-fills application forms but does not submit them. You can review jobs and answers before submitting.</p>
                    <span className="inline-block text-xs text-indigo-600 font-medium mt-1">Recommended for new users</span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  copilotMode === "full-auto" ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                }`}>
                  <input type="radio" name="mode" checked={copilotMode === "full-auto"} onChange={() => setCopilotMode("full-auto")}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Full Auto-Apply</p>
                    <p className="text-xs text-gray-500 mt-0.5">Your copilot auto-fills and automatically submits applications.</p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Maximum Daily Applications</label>
              <input type="range" min={5} max={100} value={maxDailyApplies} onChange={(e) => setMaxDailyApplies(parseInt(e.target.value))}
                className="w-full accent-indigo-600" />
              <p className="text-xs text-gray-500 mt-1">Up to <span className="font-medium text-indigo-600">{maxDailyApplies}</span> jobs auto-applied per day</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs text-gray-600 flex items-center gap-2"><Check size={14} className="text-green-500" /> Your copilot will filter live jobs that match your search criteria, then search for new jobs every 4 hours.</p>
              <p className="text-xs text-gray-600 flex items-center gap-2"><Check size={14} className="text-green-500" /> Based on your profile information, your copilot will answer screening questions on your behalf, powered by AI.</p>
              <p className="text-xs text-gray-600 flex items-center gap-2"><Check size={14} className="text-green-500" /> Your copilot will not reapply to jobs that it previously applied to.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        {step > 1 ? (
          <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50">
            <ChevronLeft size={14} /> Back
          </button>
        ) : <div />}

        <div className="flex items-center gap-3">
          <button onClick={async () => { await saveStep(); }}
            className="text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50"
            disabled={saving}
          >
            Save & Close
          </button>
          <button onClick={handleNext} disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm bg-red-500 text-white px-5 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {step === 4 ? "Save Configuration" : step === 3 ? "Next: Final Configuration" : step === 2 ? "Next: Profile Information" : "Next: Optional Filters"}
            {!saving && step < 4 && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none" />
    </div>
  );
}
