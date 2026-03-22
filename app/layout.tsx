import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Briefcase, LayoutDashboard, Settings, Download } from "lucide-react";

export const metadata: Metadata = {
  title: "Job App Automation",
  description: "Automate remote job applications with AI-powered matching",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Top Navigation */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="flex items-center gap-2 font-bold text-lg text-indigo-600">
                <Briefcase size={22} />
                <span className="hidden sm:inline">JobBot</span>
              </Link>
              <nav className="flex items-center gap-1">
                <NavLink href="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" />
                <NavLink href="/settings" icon={<Settings size={16} />} label="Settings" />
                <a
                  href="/api/export"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors"
                  title="Export to Excel"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Export</span>
                </a>
              </nav>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
          Job App Automation &copy; {new Date().getFullYear()} — For personal use only
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
