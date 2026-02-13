import { FacetedFilters, StatsData, SponsorCount, EnrollmentBucket, PaginatedTrials } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

export interface ConditionCount {
  condition: string;
  count: number;
}

export async function fetchTopConditions(limit = 15): Promise<ConditionCount[]> {
  const res = await fetch(`${API_URL}/api/stats/top-conditions?limit=${limit}`);
  if (!res.ok) throw new Error(`Top conditions failed: ${res.status}`);
  return res.json();
}

export async function fetchTotalCount(): Promise<number> {
  const res = await fetch(`${API_URL}/api/stats/total`);
  if (!res.ok) throw new Error(`Stats total failed: ${res.status}`);
  const data = await res.json();
  return data.total;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ city: string; state: string; display: string }> {
  const res = await fetch(`${API_URL}/api/stats/geo/reverse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
  return res.json();
}

export async function forwardGeocode(
  location: string
): Promise<{ latitude: number; longitude: number; display: string }> {
  const res = await fetch(`${API_URL}/api/stats/geo/forward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  });
  if (!res.ok) throw new Error(`Forward geocode failed: ${res.status}`);
  return res.json();
}

export async function fetchStats(filters: FacetedFilters): Promise<StatsData> {
  const res = await fetch(`${API_URL}/api/stats/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condition: filters.condition || "",
      age: filters.age,
      sex: filters.sex || "",
      statuses: filters.statuses,
      states: filters.states,
    }),
  });
  if (!res.ok) throw new Error(`Stats query failed: ${res.status}`);
  return res.json();
}

export async function fetchSponsorDistribution(filters: FacetedFilters): Promise<SponsorCount[]> {
  const res = await fetch(`${API_URL}/api/stats/sponsors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condition: filters.condition || "",
      age: filters.age,
      sex: filters.sex || "",
      statuses: filters.statuses,
      states: filters.states,
    }),
  });
  if (!res.ok) throw new Error(`Sponsor distribution failed: ${res.status}`);
  return res.json();
}

export async function fetchEnrollmentDistribution(filters: FacetedFilters): Promise<EnrollmentBucket[]> {
  const res = await fetch(`${API_URL}/api/stats/enrollment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condition: filters.condition || "",
      age: filters.age,
      sex: filters.sex || "",
      statuses: filters.statuses,
      states: filters.states,
    }),
  });
  if (!res.ok) throw new Error(`Enrollment distribution failed: ${res.status}`);
  return res.json();
}

// --- Session-based stats endpoints (AACT database) ---

export interface NameValue {
  name: string;
  value: number;
}

/** Convert UPPER_SNAKE_CASE or ALL_CAPS labels to Title Case. */
function humanizeLabel(label: string): string {
  if (!label) return label;
  // Already looks human-readable (has lowercase letters and no underscores)
  if (/[a-z]/.test(label) && !label.includes("_")) return label;
  return label
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bNih\b/g, "NIH")
    .replace(/\bNct\b/g, "NCT");
}

function humanizeNameValues(data: NameValue[]): NameValue[] {
  return data.map((d) => ({ ...d, name: humanizeLabel(d.name) }));
}

export async function fetchStudyTypes(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/study-types?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Study types failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchGender(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/gender?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Gender distribution failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchAgeGroups(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/age-groups?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Age groups failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchInterventionTypes(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/intervention-types?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Intervention types failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchDuration(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/duration?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Duration distribution failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchStartYears(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/start-years?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Start years failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchFacilityCounts(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/facility-counts?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Facility counts failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchCountries(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/countries?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Countries failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchCompletionRate(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/completion-rate?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Completion rate failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchFunderTypes(sessionId: string): Promise<NameValue[]> {
  const res = await fetch(`${API_URL}/api/stats/funder-types?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Funder types failed: ${res.status}`);
  return res.json().then(humanizeNameValues);
}

export async function fetchMatchedTrials(filters: FacetedFilters, page = 1, perPage = 10): Promise<PaginatedTrials> {
  const res = await fetch(`${API_URL}/api/stats/matched-trials?page=${page}&per_page=${perPage}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condition: filters.condition || "",
      age: filters.age,
      sex: filters.sex || "",
      statuses: filters.statuses,
      states: filters.states,
    }),
  });
  if (!res.ok) throw new Error(`Matched trials failed: ${res.status}`);
  return res.json();
}
