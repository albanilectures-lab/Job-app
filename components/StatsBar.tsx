"use client";

import { Briefcase, BarChart3, Clock, CheckCircle, XCircle } from "lucide-react";

interface StatsBarProps {
  totalJobs: number;
  matched: number;
  applied: number;
  skipped: number;
  failed: number;
}

export default function StatsBar({ totalJobs, matched, applied, skipped, failed }: StatsBarProps) {
  const stats = [
    { label: "Total Jobs", value: totalJobs, icon: Briefcase, color: "text-gray-700 bg-gray-100" },
    { label: "Matched", value: matched, icon: BarChart3, color: "text-blue-700 bg-blue-100" },
    { label: "Applied", value: applied, icon: CheckCircle, color: "text-green-700 bg-green-100" },
    { label: "Skipped", value: skipped, icon: Clock, color: "text-yellow-700 bg-yellow-100" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-red-700 bg-red-100" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
          <div className="flex items-center gap-2 mb-1">
            <s.icon size={16} />
            <span className="text-xs font-medium">{s.label}</span>
          </div>
          <div className="text-2xl font-bold">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
