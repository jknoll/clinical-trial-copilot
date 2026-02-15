"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FacetedFilters, MatchedTrialRow } from "@/lib/types";
import { fetchMatchedTrials } from "@/lib/statsApi";

interface Props {
  filters: FacetedFilters;
}

const PAGE_SIZE = 50;

export function TrialTable({ filters }: Props) {
  const [trials, setTrials] = useState<MatchedTrialRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const filtersRef = useRef(filters);

  // Reset when filters change
  useEffect(() => {
    filtersRef.current = filters;
    setTrials([]);
    setPage(1);
    setHasMore(true);
    setInitialLoading(true);
  }, [filters]);

  // Load data for current page
  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const result = await fetchMatchedTrials(filtersRef.current, page, PAGE_SIZE);
        if (!ignore) {
          if (page === 1) {
            setTrials(result.trials);
          } else {
            setTrials(prev => [...prev, ...result.trials]);
          }
          setHasMore(page < result.total_pages);
        }
      } catch {
        if (!ignore && page === 1) setTrials([]);
      } finally {
        if (!ignore) {
          setLoading(false);
          setInitialLoading(false);
        }
      }
    }
    load();
    return () => { ignore = true; };
  }, [filters, page]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 50 && hasMore && !loading) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, loading]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          Loading trials...
        </div>
      </div>
    );
  }

  if (trials.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400">
        No trials found
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-100 overflow-hidden max-h-[240px] overflow-y-auto"
      onScroll={handleScroll}
    >
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-xs font-medium text-slate-500 sticky top-0">
            <th className="text-left px-3 py-2">NCT ID</th>
            <th className="text-left px-3 py-2">Brief Title</th>
            <th className="text-left px-3 py-2">Condition</th>
          </tr>
        </thead>
        <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
          {trials.map((t, i) => (
            <tr key={t.nct_id} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "bg-slate-100" : ""}`}>
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

      {loading && (
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            Loading more...
          </div>
        </div>
      )}
    </div>
  );
}
