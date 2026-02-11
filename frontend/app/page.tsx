"use client";

import { useEffect, useState } from "react";
import { Chat } from "@/components/Chat";
import { AlertTriangle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function createSession() {
      try {
        const res = await fetch(`${API_URL}/api/sessions`, { method: "POST" });
        if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
        const data = await res.json();
        if (!ignore) setSessionId(data.session_id);
      } catch (err) {
        console.error("Failed to create session:", err);
        if (!ignore) setError("Unable to connect to the server. Please make sure the backend is running.");
      }
    }
    createSession();
    return () => { ignore = true; };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">CT</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Clinical Trial Navigator</h1>
          <p className="text-xs text-slate-500">AI-powered clinical trial guidance</p>
        </div>
      </header>

      {/* Disclaimer */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-800 shrink-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          This tool provides information only, not medical advice. Discuss all findings with your healthcare provider.
        </span>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-md">
              <div className="text-red-500 text-4xl mb-4">!</div>
              <p className="text-slate-700">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : sessionId ? (
          <Chat sessionId={sessionId} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
              <span className="ml-2">Connecting...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
