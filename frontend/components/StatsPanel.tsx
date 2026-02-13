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
  fetchCountries,
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
import { CountryChart } from "./charts/CountryChart";
import { CompletionRateChart } from "./charts/CompletionRateChart";
import { FunderTypeChart } from "./charts/FunderTypeChart";
import { Database, X, Filter, Activity, Building2, Users, List, FlaskConical, Globe, Calendar, Clock, MapPin, CheckCircle, Wallet, Beaker, UserCheck } from "lucide-react";

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
  const [countries, setCountries] = useState<NameValue[]>([]);
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

    fetchCountries(sessionId)
      .then((data) => { if (!ignore) setCountries(data); })
      .catch(() => { if (!ignore) setCountries([]); });

    fetchCompletionRate(sessionId)
      .then((data) => { if (!ignore) setCompletionRate(data); })
      .catch(() => { if (!ignore) setCompletionRate([]); });

    fetchFunderTypes(sessionId)
      .then((data) => { if (!ignore) setFunderTypes(data); })
      .catch(() => { if (!ignore) setFunderTypes([]); });

    return () => { ignore = true; };
  }, [sessionId]);

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

        {/* Status breakdown */}
        {Object.keys(stats.status_distribution).length > 0 && (
          <Section title="Status Breakdown">
            <StatusBar data={stats.status_distribution} allData={stats.all_status_distribution} />
          </Section>
        )}

        {/* Phase distribution */}
        {Object.keys(stats.phase_distribution).length > 0 && (
          <Section title="Phase Distribution">
            <PhaseDonut data={stats.phase_distribution} />
          </Section>
        )}

        {/* Trial Table */}
        {filters && (
          <Section title="Matching Trials" icon={<List className="w-3.5 h-3.5" />}>
            <TrialTable filters={filters} />
          </Section>
        )}

        {/* Top Sponsors */}
        {sponsors.length > 0 && (
          <Section title="Top Sponsors" icon={<Building2 className="w-3.5 h-3.5" />}>
            <SponsorBar data={sponsors} />
          </Section>
        )}

        {/* Enrollment Distribution */}
        {enrollment.length > 0 && (
          <Section title="Enrollment Size" icon={<Users className="w-3.5 h-3.5" />}>
            <EnrollmentHistogram data={enrollment} />
          </Section>
        )}

        {/* Study Types */}
        {studyTypes.length > 0 && (
          <Section title="Study Types" icon={<Beaker className="w-3.5 h-3.5" />}>
            <StudyTypeChart data={studyTypes} />
          </Section>
        )}

        {/* Intervention Types */}
        {interventionTypes.length > 0 && (
          <Section title="Intervention Types" icon={<FlaskConical className="w-3.5 h-3.5" />}>
            <InterventionTypeChart data={interventionTypes} />
          </Section>
        )}

        {/* Gender Eligibility */}
        {gender.length > 0 && (
          <Section title="Gender Eligibility" icon={<UserCheck className="w-3.5 h-3.5" />}>
            <GenderChart data={gender} />
          </Section>
        )}

        {/* Age Groups */}
        {ageGroups.length > 0 && (
          <Section title="Age Groups" icon={<Users className="w-3.5 h-3.5" />}>
            <AgeGroupChart data={ageGroups} />
          </Section>
        )}

        {/* Funder Types */}
        {funderTypes.length > 0 && (
          <Section title="Funder Types" icon={<Wallet className="w-3.5 h-3.5" />}>
            <FunderTypeChart data={funderTypes} />
          </Section>
        )}

        {/* Countries */}
        {countries.length > 0 && (
          <Section title="Countries" icon={<Globe className="w-3.5 h-3.5" />}>
            <CountryChart data={countries} />
          </Section>
        )}

        {/* Start Years */}
        {startYears.length > 0 && (
          <Section title="Start Years" icon={<Calendar className="w-3.5 h-3.5" />}>
            <StartYearChart data={startYears} />
          </Section>
        )}

        {/* Study Duration */}
        {duration.length > 0 && (
          <Section title="Study Duration" icon={<Clock className="w-3.5 h-3.5" />}>
            <DurationChart data={duration} />
          </Section>
        )}

        {/* Facility Counts */}
        {facilityCounts.length > 0 && (
          <Section title="Facility Counts" icon={<MapPin className="w-3.5 h-3.5" />}>
            <FacilityCountChart data={facilityCounts} />
          </Section>
        )}

        {/* Completion Rate */}
        {completionRate.length > 0 && (
          <Section title="Completion Rate" icon={<CheckCircle className="w-3.5 h-3.5" />}>
            <CompletionRateChart data={completionRate} />
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
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-2">{children}</div>
    </div>
  );
}
