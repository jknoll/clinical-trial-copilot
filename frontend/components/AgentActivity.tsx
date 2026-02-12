"use client";

import { CheckCircle2 } from "lucide-react";

const PHASES = [
  { key: "intake", label: "Intake" },
  { key: "search", label: "Search" },
  { key: "matching", label: "Matching" },
  { key: "selection", label: "Selection" },
  { key: "report", label: "Report" },
  { key: "followup", label: "Follow-up" },
] as const;

interface Props {
  currentPhase: string;
  activity: string;
  isProcessing: boolean;
  activityLog?: Record<string, string[]>;
  isComplete?: boolean;
}

export function AgentActivity({ currentPhase, activity, isProcessing, activityLog, isComplete }: Props) {
  if (!currentPhase) return null;

  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);
  const recentLogs = activityLog?.[currentPhase]?.slice(-3) || [];

  return (
    <div
      className={`border-t border-slate-200 bg-slate-50 px-4 py-2.5 shrink-0 transition-all duration-500 ${
        isComplete ? "max-h-0 py-0 overflow-hidden opacity-0" : "max-h-40 opacity-100"
      }`}
    >
      <div className="flex items-center gap-1.5 max-w-3xl mx-auto">
        {PHASES.map((phase, i) => {
          const isActive = phase.key === currentPhase;
          const isCompleted = currentIdx > i;

          return (
            <div key={phase.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={`w-5 h-px mx-0.5 ${
                    isCompleted ? "bg-blue-400" : "bg-slate-200"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                    : isCompleted
                    ? "bg-green-50 text-green-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                {isActive && isProcessing && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
                {phase.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* Status message stack below active phase */}
      {(activity || recentLogs.length > 0) && (
        <div className="max-w-3xl mx-auto mt-1.5 space-y-0.5">
          {recentLogs.slice(-2).map((log, i) => (
            <p key={i} className={`text-xs text-center truncate ${
              i === recentLogs.length - 1 || (recentLogs.length <= 2 && i === recentLogs.slice(-2).length - 1)
                ? "text-slate-500"
                : "text-slate-400"
            }`}>
              {log}
            </p>
          ))}
          {activity && !recentLogs.includes(activity) && (
            <p className="text-xs text-slate-500 text-center truncate">{activity}</p>
          )}
        </div>
      )}
    </div>
  );
}
