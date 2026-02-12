"use client";

import { ActiveFilter, StatsData } from "@/lib/types";
import { FunnelChart } from "./charts/FunnelChart";
import { PhaseDonut } from "./charts/PhaseDonut";
import { StatusBar } from "./charts/StatusBar";
import { StatsMap } from "./charts/StatsMap";
import { DiseaseBar } from "./charts/DiseaseBar";
import { Database, X, Filter, TrendingDown, Activity } from "lucide-react";

interface Props {
  stats: StatsData | null;
  activeFilters: ActiveFilter[];
  loading: boolean;
  error: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  topConditions?: { condition: string; count: number }[];
  activeCondition?: string;
  mapFlyTo?: { lat: number; lon: number } | null;
  travelDistance?: number | null;
}

export function StatsPanel({ stats, activeFilters, loading, error, userLocation, topConditions, activeCondition, mapFlyTo, travelDistance }: Props) {
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Database className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500 mb-1">Stats panel unavailable</p>
        <p className="text-xs text-slate-400">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Shimmer hero card */}
          <div className="rounded-xl p-4 shimmer h-[120px]" />
          {/* Shimmer filter chips */}
          <div className="flex gap-2">
            <div className="shimmer h-6 w-20 rounded-full" />
            <div className="shimmer h-6 w-24 rounded-full" />
          </div>
          {/* Shimmer chart sections */}
          <div className="shimmer h-[160px] rounded-lg" />
          <div className="shimmer h-[120px] rounded-lg" />
          <div className="shimmer h-[100px] rounded-lg" />
        </div>
      </div>
    );
  }

  const pct = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header metric */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 rounded-xl p-4 text-white relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold tabular-nums">
                {stats.matched.toLocaleString()}
              </span>
              <span className="text-blue-200 text-sm">
                of {stats.total.toLocaleString()}
              </span>
            </div>
            <p className="text-blue-100 text-sm">active clinical trials match your criteria</p>
            <div className="mt-3 h-2 bg-blue-800/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/90 rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                style={{ width: `${Math.max(parseFloat(pct), 0.5)}%` }}
              />
            </div>
            <p className="text-blue-200 text-xs mt-1 tabular-nums">{pct}% of all trials</p>
          </div>
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
              <Filter className="w-3 h-3" />
              Active Filters
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
                >
                  <span className="text-blue-400 font-medium">{f.label}:</span>
                  {f.value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Geographic map */}
        {Object.keys(stats.geo_distribution).length > 0 && (
          <Section title="US Trial Locations">
            <StatsMap data={stats.geo_distribution} userLocation={userLocation} flyTo={mapFlyTo} travelDistance={travelDistance} />
          </Section>
        )}

        {/* Top conditions */}
        {topConditions && topConditions.length > 0 && (
          <Section title="Top Conditions" icon={<Activity className="w-3.5 h-3.5" />}>
            <DiseaseBar
              data={(() => {
                if (!activeCondition || !stats) return topConditions;
                const needle = activeCondition.toLowerCase();
                const found = topConditions.some(c => c.condition.toLowerCase().includes(needle));
                if (!found && stats.matched > 0) {
                  return [...topConditions, { condition: activeCondition, count: stats.matched, isUserCondition: true }];
                }
                return topConditions;
              })()}
              activeCondition={activeCondition}
              userCondition={activeCondition}
            />
          </Section>
        )}

        {/* Search funnel */}
        {stats.funnel.length > 1 && (
          <Section title="Search Funnel" icon={<TrendingDown className="w-3.5 h-3.5" />}>
            <FunnelChart data={stats.funnel} />
          </Section>
        )}

        {/* Phase distribution */}
        {Object.keys(stats.phase_distribution).length > 0 && (
          <Section title="Phase Distribution">
            <PhaseDonut data={stats.phase_distribution} />
          </Section>
        )}

        {/* Status breakdown */}
        {Object.keys(stats.status_distribution).length > 0 && (
          <Section title="Status Breakdown">
            <StatusBar data={stats.status_distribution} allData={stats.all_status_distribution} />
          </Section>
        )}

        {loading && (
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              Updating...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
        {icon}
        {title}
      </div>
      <div className="bg-white/80 rounded-lg border border-slate-100 p-2">{children}</div>
    </div>
  );
}
