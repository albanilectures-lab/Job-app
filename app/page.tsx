"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, ArrowRight, Zap, Shield, Brain, FileSpreadsheet, LogIn, Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; displayName: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => { if (d.authenticated) setUser(d.user); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setLoginError(data.error || "Login failed");
      }
    } catch {
      setLoginError("Network error");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="text-center py-12 sm:py-20">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <Zap size={14} /> AI-Powered Job Automation
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 mb-4">
          Land Your Next <span className="text-indigo-600">Remote</span> Role
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
          Scrape top remote job boards, AI-match to your skills, auto-generate tailored cover letters,
          and apply with one click. All from a single dashboard.
        </p>

        {checking ? (
          <div className="flex justify-center"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
        ) : user ? (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-sm text-gray-500">Signed in as <strong className="text-gray-800">{user.displayName}</strong></span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
              Go to Dashboard <ArrowRight size={18} />
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 bg-white text-gray-700 px-6 py-3 rounded-xl font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Configure Settings
            </Link>
          </div>
        ) : (
          <div className="max-w-xs mx-auto">
            <form onSubmit={handleQuickLogin} className="bg-white rounded-xl shadow-md border border-gray-200 p-5 space-y-3 text-left">
              <h3 className="text-sm font-semibold text-gray-800 text-center">Sign in to get started</h3>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
              />
              {loginError && <p className="text-xs text-red-600">{loginError}</p>}
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loggingIn ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                {loggingIn ? "Signing in..." : "Sign In"}
              </button>
              <p className="text-[11px] text-gray-400 text-center">Default: admin / admin</p>
            </form>
          </div>
        )}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <FeatureCard
          icon={<Briefcase className="text-indigo-600" />}
          title="8 Job Boards"
          desc="We Work Remotely, Remote OK, NoDesk, JustRemote, DailyRemote, Remote.co, Wellfound, Contra"
        />
        <FeatureCard
          icon={<Brain className="text-purple-600" />}
          title="AI Matching"
          desc="GPT-4o-mini analyzes fit, scores jobs, and generates tailored cover letters"
        />
        <FeatureCard
          icon={<Shield className="text-green-600" />}
          title="Smart Filters"
          desc="Auto-excludes security clearance, on-site, hybrid, defense, LinkedIn & Indeed"
        />
        <FeatureCard
          icon={<FileSpreadsheet className="text-orange-600" />}
          title="Full Logging"
          desc="SQLite tracking, Excel export with all application details"
        />
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 mb-12">
        <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {[
            { step: "1", title: "Upload Resumes", desc: "Upload 2-8 targeted PDFs for different roles" },
            { step: "2", title: "Configure Search", desc: "Set keywords, select boards, define filters" },
            { step: "3", title: "AI Analyzes", desc: "Auto-scrape, filter, score, and generate covers" },
            { step: "4", title: "Apply", desc: "Review matches, click apply, browser auto-fills forms" },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{desc}</p>
    </div>
  );
}
