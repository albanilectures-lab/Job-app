"use client";

import { useState, useEffect, useCallback } from "react";
import type { SearchConfig, JobBoard } from "@/lib/types";
import { JOB_BOARD_CONFIGS, DEFAULT_MAX_DAILY_APPLIES, DEFAULT_MIN_FIT_SCORE } from "@/lib/constants";
import { Settings, Save, Plus, X, LogIn, LogOut, CheckCircle, Loader2 } from "lucide-react";

interface SearchConfigPanelProps {
  config: SearchConfig;
  onSave: (config: SearchConfig) => Promise<void>;
}

const ALL_BOARDS = Object.keys(JOB_BOARD_CONFIGS) as JobBoard[];

export default function SearchConfigPanel({ config, onSave }: SearchConfigPanelProps) {
  const [keywords, setKeywords] = useState<string[]>(config.keywords);
  const [boards, setBoards] = useState<JobBoard[]>(config.boards);
  const [maxDaily, setMaxDaily] = useState(config.maxDailyApplies || DEFAULT_MAX_DAILY_APPLIES);
  const [minScore, setMinScore] = useState(config.minFitScore || DEFAULT_MIN_FIT_SCORE);
  const [newKeyword, setNewKeyword] = useState("");
  const [saving, setSaving] = useState(false);

  // Session state
  const [sessions, setSessions] = useState<string[]>([]);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [pendingLogin, setPendingLogin] = useState<string | null>(null);
  const [loginMsg, setLoginMsg] = useState<{ board: string; text: string; ok: boolean } | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleLogin = async (board: string) => {
    setLoggingIn(board);
    setLoginMsg(null);
    try {
      // Get the login URL from the API and open it in a new tab
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board, action: "getLoginUrl" }),
      });
      const data = await res.json();
      if (data.loginUrl) {
        window.open(data.loginUrl, "_blank");
        setPendingLogin(board);
        setLoginMsg({ board, text: "Login page opened in a new tab. Sign in there, then come back and click \"Done\".", ok: true });
      } else {
        setLoginMsg({ board, text: data.error || "No login URL for this board.", ok: false });
      }
    } catch (err: any) {
      setLoginMsg({ board, text: err.message, ok: false });
    } finally {
      setLoggingIn(null);
    }
  };

  const handleLoginDone = (board: string) => {
    setPendingLogin(null);
    setSessions((prev) => (prev.includes(board) ? prev : [...prev, board]));
    setLoginMsg({ board, text: "Marked as logged in.", ok: true });
  };

  const handleLogout = async (board: string) => {
    try {
      await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board }),
      });
      await fetchSessions();
    } catch { /* ignore */ }
  };

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const toggleBoard = (board: JobBoard) => {
    setBoards((prev) =>
      prev.includes(board) ? prev.filter((b) => b !== board) : [...prev, board]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ keywords, boards, maxDailyApplies: maxDaily, minFitScore: minScore });
    } finally {
      setSaving(false);
    }
  };

  const loginRequiredBoards = ALL_BOARDS.filter((b) => JOB_BOARD_CONFIGS[b].requiresLogin);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Settings size={20} className="text-indigo-600" />
        Search Configuration
      </h2>

      {/* Keywords */}
      <div className="mb-5">
        <label className="text-sm font-medium text-gray-700 block mb-2">Search Keywords</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {keywords.map((kw) => (
            <span key={kw} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-sm px-3 py-1 rounded-full">
              {kw}
              <button onClick={() => removeKeyword(kw)} className="hover:text-red-500">
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="e.g. senior python remote"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
          <button
            onClick={addKeyword}
            className="text-sm bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-200"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Job Boards */}
      <div className="mb-5">
        <label className="text-sm font-medium text-gray-700 block mb-2">Job Boards</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_BOARDS.map((board) => {
            const cfg = JOB_BOARD_CONFIGS[board];
            const isLoginRequired = cfg.requiresLogin;
            const hasSession = sessions.includes(board);

            return (
              <label
                key={board}
                className={`flex items-center gap-2 text-sm p-2 rounded-lg border cursor-pointer transition-colors ${
                  boards.includes(board)
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={boards.includes(board)}
                  onChange={() => toggleBoard(board)}
                  className="accent-indigo-600"
                />
                <span className="truncate flex-1">{cfg.name}</span>
                {isLoginRequired && hasSession && (
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                )}
                {isLoginRequired && !hasSession && (
                  <span className="text-[10px] text-orange-500 shrink-0">Login</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Login-Required Boards Session Management */}
      {loginRequiredBoards.length > 0 && (
        <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <label className="text-sm font-medium text-gray-700 block mb-3">
            Login Sessions (required for some sites)
          </label>
          <div className="space-y-2">
            {loginRequiredBoards.map((board) => {
              const cfg = JOB_BOARD_CONFIGS[board];
              const hasSession = sessions.includes(board);
              const isLogging = loggingIn === board;

              return (
                <div key={board} className="flex items-center gap-3 text-sm">
                  <span className="w-28 font-medium text-gray-800">{cfg.name}</span>

                  {hasSession ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle size={12} /> Logged in
                      </span>
                      <button
                        onClick={() => handleLogout(board)}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                      >
                        <LogOut size={12} /> Logout
                      </button>
                    </>
                  ) : pendingLogin === board ? (
                    <button
                      onClick={() => handleLoginDone(board)}
                      className="ml-auto inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700"
                    >
                      <CheckCircle size={12} /> Done
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLogin(board)}
                      disabled={isLogging}
                      className="ml-auto inline-flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isLogging ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Waiting for login...
                        </>
                      ) : (
                        <>
                          <LogIn size={12} /> Login
                        </>
                      )}
                    </button>
                  )}

                  {loginMsg?.board === board && (
                    <span className={`text-xs ml-2 ${loginMsg.ok ? "text-green-600" : "text-red-500"}`}>
                      {loginMsg.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Click &quot;Login&quot; to open a browser window. Log in manually, and the session will be saved automatically.
          </p>
        </div>
      )}

      {/* Limits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Max Daily Applications</label>
          <input
            type="number"
            value={maxDaily}
            onChange={(e) => setMaxDaily(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            max={500}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Min Fit Score (%)</label>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            min={0}
            max={100}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 text-sm bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        <Save size={16} /> {saving ? "Saving..." : "Save Configuration"}
      </button>
    </div>
  );
}
