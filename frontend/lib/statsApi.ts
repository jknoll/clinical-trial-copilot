import { FacetedFilters, StatsData } from "./types";

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
