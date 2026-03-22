"use client";

import { useState, useEffect } from "react";
import ProfileForm from "@/components/ProfileForm";
import ResumeUploader from "@/components/ResumeUploader";
import SearchConfigPanel from "@/components/SearchConfigPanel";
import GmailConnect from "@/components/GmailConnect";
import type { UserProfile, Resume, SearchConfig } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [searchConfig, setSearchConfig] = useState<SearchConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profileRes, resumeRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/resumes"),
      ]);
      const profileData = await profileRes.json();
      const resumeData = await resumeRes.json();

      setProfile(profileData.data?.profile ?? { fullName: "", email: "", phone: "", skills: [], yearsExperience: 0 });
      setSearchConfig(profileData.data?.searchConfig ?? { keywords: [], boards: [], maxDailyApplies: 200, minFitScore: 75 });
      setResumes(resumeData.data ?? []);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (p: UserProfile) => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveProfile", profile: p }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to save profile");
    setProfile(p);
  };

  const handleSaveConfig = async (c: SearchConfig) => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveConfig", config: c }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to save config");
    setSearchConfig(c);
  };

  const handleUploadResume = async (file: File, label: string, skills: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("label", label);
    form.append("skills", skills);
    const res = await fetch("/api/resumes", { method: "POST", body: form });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    setResumes((prev) => [data.data, ...prev]);
  };

  const handleDeleteResume = async (id: string) => {
    await fetch("/api/resumes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setResumes((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {profile && <ProfileForm profile={profile} onSave={handleSaveProfile} />}
      <ResumeUploader resumes={resumes} onUpload={handleUploadResume} onDelete={handleDeleteResume} />
      {searchConfig && <SearchConfigPanel config={searchConfig} onSave={handleSaveConfig} />}
      <GmailConnect />
    </div>
  );
}
