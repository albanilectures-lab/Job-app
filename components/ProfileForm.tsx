"use client";

import { useState, useEffect } from "react";
import type { UserProfile } from "@/lib/types";
import { User, Save } from "lucide-react";

interface ProfileFormProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => Promise<void>;
}

export default function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const [form, setForm] = useState<UserProfile>(profile);
  const [skillInput, setSkillInput] = useState(profile.skills.join(", "));
  const [saving, setSaving] = useState(false);

  // Sync form when profile prop changes (e.g. after resume extraction)
  useEffect(() => {
    setForm(profile);
    setSkillInput(profile.skills.join(", "));
  }, [profile]);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const skills = skillInput.split(",").map((s) => s.trim()).filter(Boolean);
      await onSave({ ...form, skills });
      setMessage({ type: "success", text: "Profile saved successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to save: " + String(err) });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof UserProfile, placeholder: string, type = "text") => (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key] ?? "")}
        onChange={(e) => setForm({ ...form, [key]: type === "number" ? parseInt(e.target.value) || 0 : e.target.value })}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <User size={20} className="text-indigo-600" />
        Your Profile
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {field("Full Name", "fullName", "John Doe")}
        {field("Email", "email", "john@example.com", "email")}
        {field("Phone", "phone", "+1 555-0123")}
        {field("Years of Experience", "yearsExperience", "10", "number")}
        {field("LinkedIn URL", "linkedinUrl", "https://linkedin.com/in/...")}
        {field("GitHub URL", "githubUrl", "https://github.com/...")}
        {field("Portfolio URL", "portfolioUrl", "https://...")}
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-1">Skills (comma-separated)</label>
        <textarea
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          rows={3}
          placeholder="Python, React, AWS, TypeScript, Node.js, C#, Angular..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none resize-y"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 text-sm bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? "Saving..." : "Save Profile"}
        </button>
        {message && (
          <span className={`text-sm font-medium ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
