import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "JobPilot — AI Job Application Automation",
  description: "Your AI copilot for automated job searching, matching, and applications",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <NavBar />

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
