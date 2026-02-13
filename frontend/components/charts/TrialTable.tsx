"use client";

import { useEffect, useState } from "react";
import { FacetedFilters, PaginatedTrials } from "@/lib/types";
import { fetchMatchedTrials } from "@/lib/statsApi";

interface Props {
  filters: FacetedFilters;
}

export function TrialTable({ filters }: Props) {
  const [data, setData] = useState<PaginatedTrials | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const result = await fetchMatchedTrials(filters, page, 10);
        if (!ignore) setData(result);
      } catch {
        if (!ignore) setData(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [filters, page]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          Loading trials...
        </div>
      </div>
    );
  }

  if (!data || data.trials.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400">
        No trials found
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-xs font-medium text-slate-500">
            <th className="text-left px-3 py-2">NCT ID</th>
            <th className="text-left px-3 py-2">Brief Title</th>
            <th className="text-left px-3 py-2">Condition</th>
          </tr>
        </thead>
        <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
          {data.trials.map((t) => (
            <tr key={t.nct_id} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2 whitespace-nowrap">
                <a
                  href={`https://clinicaltrials.gov/study/${t.nct_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-mono text-xs"
                >
                  {t.nct_id}
                </a>
              </td>
              <td className="px-3 py-2 max-w-[180px]">
                <span className="line-clamp-1">{t.brief_title}</span>
              </td>
              <td className="px-3 py-2 max-w-[140px]">
                <span className="line-clamp-1">{t.condition || "\u2014"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex justify-between items-center px-3 py-2 border-t border-slate-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400">
            Page {data.page} of {data.total_pages.toLocaleString()}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
            disabled={page >= data.total_pages}
            className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
