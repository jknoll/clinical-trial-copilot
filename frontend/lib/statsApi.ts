import { FacetedFilters, StatsData } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

export async function fetchTotalCount(): Promise<number> {
  const res = await fetch(`${API_URL}/api/stats/total`);
  if (!res.ok) throw new Error(`Stats total failed: ${res.status}`);
  const data = await res.json();
  return data.total;
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
