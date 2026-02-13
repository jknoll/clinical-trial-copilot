"use client";

import clsx from "clsx";
import { MapPin, Building2, FlaskConical, Check } from "lucide-react";

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
  latitude?: number;
  longitude?: number;
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
  latitude,
  longitude,
  selectable,
  selected,
  onToggle,
}: Props) {
  const hasMap = latitude != null && longitude != null;

  return (
    <div
      className={clsx(
        "trial-card relative",
        selectable && "cursor-pointer",
        selected && "ring-2 ring-blue-500"
      )}
      onClick={selectable ? onToggle : undefined}
    >
      {selectable && selected && (
        <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
      )}
      <div className={clsx("flex gap-4", hasMap && "min-h-[180px]")}>
        {/* Left: card content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm text-slate-900 line-clamp-2">{briefTitle}</h3>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5">
                <a
                  href={`https://clinicaltrials.gov/study/${nctId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >{nctId}</a>
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
                "shrink-0 px-4 py-2 rounded-full text-base font-bold shadow-sm",
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

        {/* Right: square map, full height */}
        {hasMap && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-[180px] self-stretch rounded-lg overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              title={`Map for ${nctId}`}
              width="100%"
              height="100%"
              style={{ border: 0, pointerEvents: "none" }}
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.1},${latitude - 0.1},${longitude + 0.1},${latitude + 0.1}&layer=mapnik&marker=${latitude},${longitude}`}
            />
          </a>
        )}
      </div>
    </div>
  );
}
