"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "@/components/Chat";
import { StatsPanel } from "@/components/StatsPanel";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { FacetedFilters, ActiveFilter, StatsData } from "@/lib/types";
import { fetchStats } from "@/lib/statsApi";
import { requestGeolocation, UserLocation } from "@/lib/geolocation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

const EMPTY_FILTERS: FacetedFilters = {
  condition: "",
  age: null,
  sex: "",
  statuses: null,
  states: null,
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stats panel state
  const [showStats, setShowStats] = useState(true);
  const [filters, setFilters] = useState<FacetedFilters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  // Track ongoing fetch to debounce
  const fetchAbortRef = useRef<AbortController | null>(null);

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

  // Request geolocation on mount
  useEffect(() => {
    requestGeolocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  // Fetch initial stats on mount
  useEffect(() => {
    let ignore = false;
    async function loadInitialStats() {
      try {
        setStatsLoading(true);
        const data = await fetchStats(EMPTY_FILTERS);
        if (!ignore) {
          setStats(data);
          setStatsError(null);
        }
      } catch (e) {
        if (!ignore) setStatsError("AACT database not connected. See database-connections.md for setup.");
      } finally {
        if (!ignore) setStatsLoading(false);
      }
    }
    loadInitialStats();
    return () => { ignore = true; };
  }, []);

  const doFetchStats = useCallback(async (newFilters: FacetedFilters) => {
    // Cancel any in-flight request
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    try {
      setStatsLoading(true);
      const data = await fetchStats(newFilters);
      if (!controller.signal.aborted) {
        setStats(data);
        setStatsError(null);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        // Don't overwrite existing stats on error — just stop loading
        console.error("Stats fetch error:", e);
      }
    } finally {
      if (!controller.signal.aborted) setStatsLoading(false);
    }
  }, []);

  const handleFiltersChanged = useCallback(
    (partial: Partial<FacetedFilters>, display: ActiveFilter[]) => {
      setFilters((prev) => {
        const merged = { ...prev, ...partial };
        // Trigger async fetch
        doFetchStats(merged);
        return merged;
      });
      setActiveFilters((prev) => {
        // Merge by key: replace existing or add new
        const map = new Map(prev.map((f) => [f.key, f]));
        for (const d of display) {
          map.set(d.key, d);
        }
        return Array.from(map.values());
      });
    },
    [doFetchStats]
  );

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">CT</span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Clinical Trial Navigator</h1>
          <p className="text-xs text-slate-500">AI-powered clinical trial guidance</p>
        </div>
        <button
          onClick={() => setShowStats((s) => !s)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showStats
              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {showStats ? "Hide Stats" : "Show Stats"}
        </button>
      </header>

      {/* Disclaimer */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-800 shrink-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          This tool provides information only, not medical advice. Discuss all findings with your healthcare provider.
        </span>
      </div>

      {/* Main content — split layout */}
      <main className="flex-1 overflow-hidden flex">
        {/* Stats panel (left) */}
        {showStats && (
          <div className="w-[440px] shrink-0 border-r border-slate-200 bg-slate-50 overflow-hidden">
            <StatsPanel
              stats={stats}
              activeFilters={activeFilters}
              loading={statsLoading}
              error={statsError}
              userLocation={userLocation}
            />
          </div>
        )}

        {/* Chat (right) */}
        <div className="flex-1 overflow-hidden">
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
            <Chat sessionId={sessionId} onFiltersChanged={handleFiltersChanged} />
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
        </div>
      </main>
    </div>
  );
}
