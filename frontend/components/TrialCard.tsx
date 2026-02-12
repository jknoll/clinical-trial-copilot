"use client";

import clsx from "clsx";
import { MapPin, Building2, FlaskConical } from "lucide-react";

interface Props {
  nctId: string;
  briefTitle: string;
  phase: string;
  overallStatus: string;
  fitScore: number;
  fitSummary: string;
  nearestDistanceMiles: number | null;
  interventions: string[];
  sponsor: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

function normalizeFitScore(score: number): number {
  // Claude sometimes sends 0-1 floats instead of 0-100 percentages
  return score > 0 && score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function fitScoreClass(score: number): string {
  const s = normalizeFitScore(score);
  if (s >= 70) return "fit-score-high";
  if (s >= 40) return "fit-score-medium";
  return "fit-score-low";
}

function formatPhase(phase: string): string {
  return phase
    .replace("PHASE", "Phase ")
    .replace(/\//g, " / ")
    .trim();
}

export function TrialCard({
  nctId,
  briefTitle,
  phase,
  fitScore,
  fitSummary,
  nearestDistanceMiles,
  interventions,
  sponsor,
  selectable,
  selected,
  onToggle,
}: Props) {
  return (
    <div
      className={clsx(
        "trial-card",
        selectable && "cursor-pointer",
        selected && "ring-2 ring-blue-500"
      )}
      onClick={selectable ? onToggle : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {selectable && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <h3 className="font-medium text-sm text-slate-900 line-clamp-2">{briefTitle}</h3>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5">
            <span className="text-slate-400">{nctId}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {formatPhase(phase)}
            </span>
            {nearestDistanceMiles != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {Math.round(nearestDistanceMiles)} mi
              </span>
            )}
          </div>
        </div>

        <span
          className={clsx(
            "shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold",
            fitScoreClass(fitScore)
          )}
        >
          {normalizeFitScore(fitScore)}% fit
        </span>
      </div>

      {fitSummary && (
        <p className="text-xs text-slate-600 mt-2 line-clamp-2">{fitSummary}</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {interventions.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <FlaskConical className="w-3 h-3" />
            {interventions.slice(0, 2).join(", ")}
            {interventions.length > 2 && ` +${interventions.length - 2}`}
          </span>
        )}
        {sponsor && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {sponsor}
          </span>
        )}
      </div>
    </div>
  );
}
