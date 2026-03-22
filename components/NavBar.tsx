"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase, LayoutDashboard, Settings, Download, LogOut, User } from "lucide-react";

export default function NavBar() {
  const [user, setUser] = useState<{ username: string; displayName: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = "/";
  }

  return (
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

            {user && (
              <>
                <span className="ml-2 inline-flex items-center gap-1 text-sm text-gray-500 px-2">
                  <User size={14} />
                  <span className="hidden sm:inline">{user.displayName}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
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
