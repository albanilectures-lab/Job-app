"use client";

import { useState, useEffect } from "react";
import { Mail, Check, Loader2, ExternalLink } from "lucide-react";

export default function GmailConnect() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<any[]>([]);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const res = await fetch("/api/gmail");
      const data = await res.json();
      setConnected(data.data?.connected ?? false);
      setEmail(data.data?.email ?? null);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/gmail?action=authUrl");
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch (err) {
      alert("Failed to generate auth URL: " + String(err));
    }
  };

  const handleCheckReplies = async () => {
    try {
      const res = await fetch("/api/gmail?action=replies");
      const data = await res.json();
      setReplies(data.data ?? []);
    } catch (err) {
      alert("Failed to check replies: " + String(err));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Mail size={20} className="text-indigo-600" />
        Gmail Connection
      </h2>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="animate-spin" size={16} /> Checking...
        </div>
      ) : connected ? (
        <div>
          <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
            <Check size={16} /> Connected to Gmail
          </div>
          {email && (
            <p className="text-sm text-gray-500 mb-3 ml-6">{email}</p>
          )}
          <button
            onClick={handleCheckReplies}
            className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-100"
          >
            Check Application Replies
          </button>

          {replies.length > 0 && (
            <div className="mt-4 space-y-2">
              {replies.map((r: any) => (
                <div key={r.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800">{r.subject}</p>
                  <p className="text-xs text-gray-500 mt-1">From: {r.from}</p>
                  <p className="text-xs text-gray-500">{r.date}</p>
                  <p className="text-xs text-gray-600 mt-1">{r.snippet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Connect your Gmail to monitor application replies and track interview invitations.
          </p>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            <Mail size={16} /> Connect Gmail
          </button>
        </div>
      )}
    </div>
  );
}
