"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { CheckSquare } from "lucide-react";

interface Trial {
  nctId: string;
  briefTitle: string;
  phase: string;
  overallStatus: string;
  fitScore: number;
  fitSummary: string;
  nearestDistanceMiles: number | null;
  interventions: string[];
  sponsor: string;
}

interface Props {
  trials: Trial[];
  onSelect: (selectedTrialIds: string[]) => void;
}

function fitScoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function fitScoreBgLight(score: number): string {
  if (score >= 70) return "bg-emerald-100";
  if (score >= 40) return "bg-amber-100";
  return "bg-red-100";
}

export function TrialSelector({ trials, onSelect }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...trials].sort((a, b) => b.fitScore - a.fitScore),
    [trials]
  );

  const toggle = (nctId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nctId)) next.delete(nctId);
      else next.add(nctId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((t) => t.nctId)));
    }
  };

  const canAnalyze = selected.size >= 5 && selected.size <= 10;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">
            Select Trials for Analysis
          </h2>
          <span className="text-xs text-slate-500">
            ({selected.size} selected, 5-10 required)
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {selected.size === sorted.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Trial list */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {sorted.map((trial, idx) => (
          <div
            key={trial.nctId}
            onClick={() => toggle(trial.nctId)}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
              selected.has(trial.nctId)
                ? "bg-blue-50"
                : "hover:bg-slate-50"
            )}
          >
            {/* Rank */}
            <span className="text-xs font-medium text-slate-400 w-5 text-right shrink-0">
              {idx + 1}
            </span>

            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected.has(trial.nctId)}
              onChange={() => toggle(trial.nctId)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Trial info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 line-clamp-1">
                {trial.briefTitle}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span>{trial.nctId}</span>
                <span className="text-slate-300">|</span>
                <span>{trial.phase.replace("PHASE", "Phase ")}</span>
                {trial.nearestDistanceMiles != null && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>{Math.round(trial.nearestDistanceMiles)} mi</span>
                  </>
                )}
              </div>
            </div>

            {/* Fit score bar */}
            <div className="flex items-center gap-2 shrink-0 w-32">
              <div className={clsx("w-20 h-2 rounded-full", fitScoreBgLight(trial.fitScore))}>
                <div
                  className={clsx("h-full rounded-full transition-all", fitScoreColor(trial.fitScore))}
                  style={{ width: `${Math.min(trial.fitScore, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700 w-8 text-right">
                {Math.round(trial.fitScore)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Action footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <button
          onClick={() => onSelect(Array.from(selected))}
          disabled={!canAnalyze}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {selected.size < 5
            ? `Select at least ${5 - selected.size} more trial${5 - selected.size !== 1 ? "s" : ""}`
            : selected.size > 10
              ? `Too many selected (max 10)`
              : `Analyze ${selected.size} Selected Trials`}
        </button>
      </div>
    </div>
  );
}
