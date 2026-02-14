"use client";

import { useEffect, useState } from "react";
import { ActiveFilter, FacetedFilters, StatsData, SponsorCount, EnrollmentBucket } from "@/lib/types";
import {
  fetchSponsorDistribution,
  fetchEnrollmentDistribution,
  fetchStudyTypes,
  fetchGender,
  fetchAgeGroups,
  fetchInterventionTypes,
  fetchDuration,
  fetchStartYears,
  fetchFacilityCounts,
  fetchCompletionRate,
  fetchFunderTypes,
  NameValue,
} from "@/lib/statsApi";
import { PhaseDonut } from "./charts/PhaseDonut";
import { StatusBar } from "./charts/StatusBar";
import { StatsMap } from "./charts/StatsMap";
import { DiseaseBar } from "./charts/DiseaseBar";
import { SponsorBar } from "./charts/SponsorBar";
import { EnrollmentHistogram } from "./charts/EnrollmentHistogram";
import { TrialTable } from "./charts/TrialTable";
import { StudyTypeChart } from "./charts/StudyTypeChart";
import { GenderChart } from "./charts/GenderChart";
import { AgeGroupChart } from "./charts/AgeGroupChart";
import { InterventionTypeChart } from "./charts/InterventionTypeChart";
import { DurationChart } from "./charts/DurationChart";
import { StartYearChart } from "./charts/StartYearChart";
import { FacilityCountChart } from "./charts/FacilityCountChart";
import { CompletionRateChart } from "./charts/CompletionRateChart";
import { FunderTypeChart } from "./charts/FunderTypeChart";
import { FunnelChart } from "./charts/FunnelChart";
import { Database, X, Filter, Activity, Building2, Users, List, FlaskConical, Calendar, Clock, MapPin, CheckCircle, Wallet, Beaker, UserCheck, TrendingDown, ChevronDown } from "lucide-react";
import clsx from "clsx";

function filterColor(key: string): { bg: string; text: string; label: string } {
  switch (key) {
    case "condition":
      return { bg: "bg-purple-50", text: "text-purple-700", label: "text-purple-400" };
    case "age":
      return { bg: "bg-amber-50", text: "text-amber-700", label: "text-amber-400" };
    case "sex":
      return { bg: "bg-pink-50", text: "text-pink-700", label: "text-pink-400" };
    case "location":
      return { bg: "bg-emerald-50", text: "text-emerald-700", label: "text-emerald-400" };
    case "distance":
      return { bg: "bg-teal-50", text: "text-teal-700", label: "text-teal-400" };
    case "statuses":
      return { bg: "bg-blue-50", text: "text-blue-700", label: "text-blue-400" };
    default:
      return { bg: "bg-slate-50", text: "text-slate-700", label: "text-slate-400" };
  }
}

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
  filters?: FacetedFilters;
  sessionId?: string | null;
}

export function StatsPanel({ stats, activeFilters, loading, error, userLocation, topConditions, activeCondition, mapFlyTo, travelDistance, filters, sessionId }: Props) {
  const [sponsors, setSponsors] = useState<SponsorCount[]>([]);
  const [enrollment, setEnrollment] = useState<EnrollmentBucket[]>([]);

  // Session-based AACT stats
  const [studyTypes, setStudyTypes] = useState<NameValue[]>([]);
  const [gender, setGender] = useState<NameValue[]>([]);
  const [ageGroups, setAgeGroups] = useState<NameValue[]>([]);
  const [interventionTypes, setInterventionTypes] = useState<NameValue[]>([]);
  const [duration, setDuration] = useState<NameValue[]>([]);
  const [startYears, setStartYears] = useState<NameValue[]>([]);
  const [facilityCounts, setFacilityCounts] = useState<NameValue[]>([]);
  const [completionRate, setCompletionRate] = useState<NameValue[]>([]);
  const [funderTypes, setFunderTypes] = useState<NameValue[]>([]);

  useEffect(() => {
    if (!filters) return;
    let ignore = false;

    fetchSponsorDistribution(filters)
      .then((data) => { if (!ignore) setSponsors(data); })
      .catch(() => { if (!ignore) setSponsors([]); });

    fetchEnrollmentDistribution(filters)
      .then((data) => { if (!ignore) setEnrollment(data); })
      .catch(() => { if (!ignore) setEnrollment([]); });

    return () => { ignore = true; };
  }, [filters]);

  // Fetch session-based AACT stats when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    let ignore = false;

    fetchStudyTypes(sessionId)
      .then((data) => { if (!ignore) setStudyTypes(data); })
      .catch(() => { if (!ignore) setStudyTypes([]); });

    fetchGender(sessionId)
      .then((data) => { if (!ignore) setGender(data); })
      .catch(() => { if (!ignore) setGender([]); });

    fetchAgeGroups(sessionId)
      .then((data) => { if (!ignore) setAgeGroups(data); })
      .catch(() => { if (!ignore) setAgeGroups([]); });

    fetchInterventionTypes(sessionId)
      .then((data) => { if (!ignore) setInterventionTypes(data); })
      .catch(() => { if (!ignore) setInterventionTypes([]); });

    fetchDuration(sessionId)
      .then((data) => { if (!ignore) setDuration(data); })
      .catch(() => { if (!ignore) setDuration([]); });

    fetchStartYears(sessionId)
      .then((data) => { if (!ignore) setStartYears(data); })
      .catch(() => { if (!ignore) setStartYears([]); });

    fetchFacilityCounts(sessionId)
      .then((data) => { if (!ignore) setFacilityCounts(data); })
      .catch(() => { if (!ignore) setFacilityCounts([]); });

    fetchCompletionRate(sessionId)
      .then((data) => { if (!ignore) setCompletionRate(data); })
      .catch(() => { if (!ignore) setCompletionRate([]); });

    fetchFunderTypes(sessionId)
      .then((data) => { if (!ignore) setFunderTypes(data); })
      .catch(() => { if (!ignore) setFunderTypes([]); });

    return () => { ignore = true; };
  }, [sessionId, stats?.matched]);

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
          {loading && (
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-stats-shimmer" />
            </div>
          )}
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
              <Filter className="w-3 h-3" />
              Active Filters
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map((f) => {
                const colors = filterColor(f.key);
                return (
                  <span
                    key={f.key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 ${colors.bg} ${colors.text} rounded-full text-xs`}
                  >
                    <span className={`${colors.label} font-medium`}>{f.label}:</span>
                    {f.value}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className={loading ? "opacity-60 transition-opacity duration-300" : ""}>
        {/* 1. Trial Locations (map) */}
        {Object.keys(stats.geo_distribution).length > 0 && (
          <Section title="Trial Locations" defaultExpanded>
            <StatsMap data={stats.geo_distribution} stateData={stats.geo_distribution_states} userLocation={userLocation} flyTo={mapFlyTo} travelDistance={travelDistance} />
          </Section>
        )}

        {/* 2. Matching Trials (table) */}
        {filters && (
          <Section title="Matching Trials" icon={<List className="w-3.5 h-3.5" />} defaultExpanded>
            <TrialTable filters={filters} />
          </Section>
        )}

        {/* 3. Search Funnel */}
        {stats.funnel && stats.funnel.length > 0 && (
          <Section title="Search Funnel" icon={<TrendingDown className="w-3.5 h-3.5" />} defaultExpanded>
            <FunnelChart data={stats.funnel} />
          </Section>
        )}

        {/* 4. Top Conditions */}
        {topConditions && topConditions.length > 0 && (
          <Section title="Top Conditions" icon={<Activity className="w-3.5 h-3.5" />} defaultExpanded>
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

        {/* 5. Status Breakdown */}
        {Object.keys(stats.status_distribution).length > 0 && (
          <Section title="Status Breakdown">
            <StatusBar data={stats.status_distribution} allData={stats.all_status_distribution} />
          </Section>
        )}

        {/* 6. Phase Distribution */}
        {Object.keys(stats.phase_distribution).length > 0 && (
          <Section title="Phase Distribution">
            <PhaseDonut data={stats.phase_distribution} />
          </Section>
        )}

        {/* 7. Top Sponsors */}
        {sponsors.length > 0 && (
          <Section title="Top Sponsors" icon={<Building2 className="w-3.5 h-3.5" />}>
            <SponsorBar data={sponsors} />
          </Section>
        )}

        {/* 8. Enrollment Size */}
        {enrollment.length > 0 && (
          <Section title="Enrollment Size" icon={<Users className="w-3.5 h-3.5" />}>
            <EnrollmentHistogram data={enrollment} />
          </Section>
        )}

        {/* 9. Study Types */}
        {studyTypes.length > 0 && (
          <Section title="Study Types" icon={<Beaker className="w-3.5 h-3.5" />}>
            <StudyTypeChart data={studyTypes} />
          </Section>
        )}

        {/* 10. Intervention Types */}
        {interventionTypes.length > 0 && (
          <Section title="Intervention Types" icon={<FlaskConical className="w-3.5 h-3.5" />}>
            <InterventionTypeChart data={interventionTypes} />
          </Section>
        )}

        {/* 11. Gender Eligibility */}
        {gender.length > 0 && (
          <Section title="Gender Eligibility" icon={<UserCheck className="w-3.5 h-3.5" />}>
            <GenderChart data={gender} />
          </Section>
        )}

        {/* 12. Age Groups */}
        {ageGroups.length > 0 && (
          <Section title="Age Groups" icon={<Users className="w-3.5 h-3.5" />}>
            <AgeGroupChart data={ageGroups} />
          </Section>
        )}

        {/* 13. Funder Types */}
        {funderTypes.length > 0 && (
          <Section title="Funder Types" icon={<Wallet className="w-3.5 h-3.5" />}>
            <FunderTypeChart data={funderTypes} />
          </Section>
        )}

        {/* 14. Start Years */}
        {startYears.length > 0 && (
          <Section title="Start Years" icon={<Calendar className="w-3.5 h-3.5" />}>
            <StartYearChart data={startYears} />
          </Section>
        )}

        {/* 16. Study Duration */}
        {duration.length > 0 && (
          <Section title="Study Duration" icon={<Clock className="w-3.5 h-3.5" />}>
            <DurationChart data={duration} />
          </Section>
        )}

        {/* 17. Facility Counts */}
        {facilityCounts.length > 0 && (
          <Section title="Facility Counts" icon={<MapPin className="w-3.5 h-3.5" />}>
            <FacilityCountChart data={facilityCounts} />
          </Section>
        )}

        {/* 18. Completion Rate */}
        {completionRate.length > 0 && (
          <Section title="Completion Rate" icon={<CheckCircle className="w-3.5 h-3.5" />}>
            <CompletionRateChart data={completionRate} />
          </Section>
        )}

        </div>{/* end dimming wrapper */}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  defaultExpanded = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2 w-full hover:text-slate-700 transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-2">
          {children}
        </div>
      )}
    </div>
  );
}
