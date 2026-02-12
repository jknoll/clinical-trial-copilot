"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "@/components/Chat";
import { StatsPanel } from "@/components/StatsPanel";
import { SplitHandle } from "@/components/SplitHandle";
import { ImportSummary } from "@/components/HealthImport";
import { BarChart3, FileText, Shield } from "lucide-react";
import { FacetedFilters, ActiveFilter, StatsData } from "@/lib/types";
import { fetchStats, reverseGeocode, forwardGeocode, fetchTopConditions, ConditionCount } from "@/lib/statsApi";
import { requestGeolocation, UserLocation } from "@/lib/geolocation";

interface DetectedLocation {
  display: string;
  latitude: number;
  longitude: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

const EMPTY_FILTERS: FacetedFilters = {
  condition: "",
  age: null,
  sex: "",
  statuses: null,
  states: null,
  latitude: null,
  longitude: null,
  distance_miles: null,
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stats panel state
  const [showStats, setShowStats] = useState(true);
  const [panelWidth, setPanelWidth] = useState(440);
  const [filters, setFilters] = useState<FacetedFilters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null);
  const [zeroResults, setZeroResults] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [topConditions, setTopConditions] = useState<ConditionCount[]>([]);
  const [mapFlyTo, setMapFlyTo] = useState<{ lat: number; lon: number } | null>(null);
  const demoRef = useRef<(() => void) | null>(null);
  const [reportUrls, setReportUrls] = useState<{ html: string; pdf: string } | null>(null);
  const [healthImported, setHealthImported] = useState(false);
  const [healthSummary, setHealthSummary] = useState<ImportSummary | null>(null);

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

  useEffect(() => {
    fetchTopConditions().then(setTopConditions).catch(() => {});
  }, []);

  // Request geolocation AFTER consent — browser prompt is more visible and intentional
  useEffect(() => {
    if (!consentGiven) return;
    requestGeolocation().then(async (loc) => {
      if (loc) {
        setUserLocation(loc);
        // Reverse geocode directly from the browser to avoid server rate limits
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${loc.latitude}&lon=${loc.longitude}&format=json&zoom=10`,
            { headers: { "Accept": "application/json" } }
          );
          const data = await res.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || "";
          const state = addr.state || "";
          const display = [city, state].filter(Boolean).join(", ") || `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;
          setDetectedLocation({ display, latitude: loc.latitude, longitude: loc.longitude });
        } catch {
          setDetectedLocation({
            display: `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`,
            latitude: loc.latitude,
            longitude: loc.longitude,
          });
        }
      }
    });
  }, [consentGiven]);

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
        // Detect zero results when filters are active
        setZeroResults(data.matched === 0 && data.total > 0);
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

  const handleConsent = useCallback(() => {
    setConsentGiven(true);
  }, []);

  const handleHealthImported = useCallback((summary: ImportSummary) => {
    setHealthImported(true);
    setHealthSummary(summary);
  }, []);

  const handleLocationConfirmed = useCallback((lat: number, lon: number) => {
    setMapFlyTo({ lat, lon });
    setUserLocation({ latitude: lat, longitude: lon });
    setFilters((prev) => ({ ...prev, latitude: lat, longitude: lon }));
  }, []);

  const handleLocationOverride = useCallback((locationText: string) => {
    forwardGeocode(locationText).then((result) => {
      if (result.latitude && result.longitude) {
        setUserLocation({ latitude: result.latitude, longitude: result.longitude });
        setDetectedLocation({
          display: result.display || locationText,
          latitude: result.latitude,
          longitude: result.longitude,
        });
        setFilters((prev) => ({ ...prev, latitude: result.latitude, longitude: result.longitude }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        demoRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-hide stats panel on narrow viewports
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setShowStats(false);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/60 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-sm">CT</span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Clinical Trial Navigator</h1>
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

      {/* Main content — split layout */}
      <main className="flex-1 overflow-hidden flex">
        {/* Stats panel (left) */}
        {showStats && (
          <>
            <div className="shrink-0 border-r border-slate-200/60 bg-white/60 backdrop-blur-xl overflow-hidden" style={{ width: panelWidth }}>
              <StatsPanel
                stats={stats}
                activeFilters={activeFilters}
                loading={statsLoading}
                error={statsError}
                userLocation={userLocation}
                topConditions={topConditions}
                activeCondition={filters.condition}
                mapFlyTo={mapFlyTo}
                travelDistance={filters.distance_miles}
              />
            </div>
            <SplitHandle currentWidth={panelWidth} onResize={setPanelWidth} />
          </>
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
            <Chat
              sessionId={sessionId}
              onFiltersChanged={handleFiltersChanged}
              detectedLocation={detectedLocation}
              zeroResults={zeroResults}
              demoRef={demoRef}
              onLocationConfirmed={handleLocationConfirmed}
              onLocationOverride={handleLocationOverride}
              onReportReady={(html, pdf) => setReportUrls({ html, pdf: pdf || "" })}
              healthImported={healthImported}
              onHealthImported={handleHealthImported}
            />
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

      {reportUrls && (
        <div className="fixed bottom-4 right-4 z-40 bg-white rounded-xl shadow-lg border border-slate-200 p-4 flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <div>
            <p className="text-sm font-medium">Your Report</p>
            <div className="flex gap-2 mt-1">
              <a href={reportUrls.html} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Report</a>
              {reportUrls.pdf && (
                <a href={reportUrls.pdf} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Download PDF</a>
              )}
            </div>
          </div>
        </div>
      )}

      {!consentGiven && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden modal-enter">
            <div className="h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
            <div className="p-8 text-center">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Before We Begin</h2>
            <p className="text-sm text-slate-700 mb-4 leading-relaxed">
              Clinical Trial Navigator helps you find relevant clinical trials from the massive
              ClinicalTrials.gov database of 500,000+ studies. Through a guided conversation,
              we&apos;ll narrow down trials that match your condition, location, and preferences
              — turning an overwhelming search into a manageable shortlist you can discuss with
              your doctor.
            </p>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              This is an <strong>AI-powered research tool</strong> that helps you explore clinical trial options.
              It does <strong>not</strong> provide medical advice, diagnoses, or treatment recommendations.
              All information is for educational purposes only. Always consult your healthcare provider
              before making any decisions about clinical trials or treatment changes.
            </p>
            <button
              onClick={handleConsent}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              I Understand and Agree
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
