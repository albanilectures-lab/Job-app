import Link from "next/link";
import { Briefcase, ArrowRight, Zap, Shield, Brain, FileSpreadsheet } from "lucide-react";

export default function HomePage() {
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
        <div className="flex items-center justify-center gap-4 flex-wrap">
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
