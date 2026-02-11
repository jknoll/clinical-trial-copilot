"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface Trial {
  nctId: string;
  briefTitle: string;
  phase: string;
  overallStatus: string;
  fitScore: number;
  nearestDistanceMiles: number | null;
  interventions: string[];
  enrollment?: number | null;
}

interface Props {
  trials: Trial[];
}

type SortKey = "briefTitle" | "phase" | "overallStatus" | "nearestDistanceMiles" | "fitScore" | "enrollment" | "interventions";
type SortDir = "asc" | "desc";

function fitScoreClass(score: number): string {
  if (score >= 70) return "fit-score-high";
  if (score >= 40) return "fit-score-medium";
  return "fit-score-low";
}

function formatPhase(phase: string): string {
  return phase
    .replace("PHASE", "Phase ")
    .replace(/\//g, " / ")
    .trim();
}

function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("recruiting") && !s.includes("not")) return "bg-emerald-100 text-emerald-700";
  if (s.includes("completed")) return "bg-slate-100 text-slate-600";
  if (s.includes("active")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

export function ComparisonTable({ trials }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("fitScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "fitScore" ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    return [...trials].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "briefTitle":
          cmp = a.briefTitle.localeCompare(b.briefTitle);
          break;
        case "phase":
          cmp = a.phase.localeCompare(b.phase);
          break;
        case "overallStatus":
          cmp = a.overallStatus.localeCompare(b.overallStatus);
          break;
        case "nearestDistanceMiles":
          cmp = (a.nearestDistanceMiles ?? 9999) - (b.nearestDistanceMiles ?? 9999);
          break;
        case "fitScore":
          cmp = a.fitScore - b.fitScore;
          break;
        case "enrollment":
          cmp = (a.enrollment ?? 0) - (b.enrollment ?? 0);
          break;
        case "interventions":
          cmp = (a.interventions[0] || "").localeCompare(b.interventions[0] || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [trials, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "briefTitle", label: "Trial Name", className: "min-w-[200px]" },
    { key: "phase", label: "Phase" },
    { key: "overallStatus", label: "Status" },
    { key: "nearestDistanceMiles", label: "Distance" },
    { key: "fitScore", label: "Fit Score" },
    { key: "enrollment", label: "Enrollment" },
    { key: "interventions", label: "Interventions", className: "min-w-[150px]" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={clsx(
                    "px-4 py-3 text-left font-medium text-slate-600 cursor-pointer select-none hover:text-slate-900 transition-colors whitespace-nowrap",
                    col.className
                  )}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((trial) => (
              <tr
                key={trial.nctId}
                className="hover:bg-slate-50 transition-colors"
              >
                {/* Trial Name */}
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 line-clamp-2">
                    {trial.briefTitle}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{trial.nctId}</div>
                </td>

                {/* Phase */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                    {formatPhase(trial.phase)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={clsx(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      statusBadge(trial.overallStatus)
                    )}
                  >
                    {trial.overallStatus}
                  </span>
                </td>

                {/* Distance */}
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                  {trial.nearestDistanceMiles != null
                    ? `${Math.round(trial.nearestDistanceMiles)} mi`
                    : "\u2014"}
                </td>

                {/* Fit Score */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={clsx(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
                      fitScoreClass(trial.fitScore)
                    )}
                  >
                    {Math.round(trial.fitScore)}%
                  </span>
                </td>

                {/* Enrollment */}
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                  {trial.enrollment != null ? trial.enrollment.toLocaleString() : "\u2014"}
                </td>

                {/* Interventions */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {trial.interventions.slice(0, 3).map((intervention, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"
                      >
                        {intervention}
                      </span>
                    ))}
                    {trial.interventions.length > 3 && (
                      <span className="text-xs text-slate-400">
                        +{trial.interventions.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-slate-500">
          No trials to compare. Select trials first.
        </div>
      )}
    </div>
  );
}
