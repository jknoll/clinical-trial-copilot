"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, ClipboardList, Search, GitCompare, CheckSquare, FileText, MessageCircle } from "lucide-react";

const PHASES = [
  { key: "intake", label: "Intake", icon: ClipboardList },
  { key: "search", label: "Search", icon: Search },
  { key: "matching", label: "Matching", icon: GitCompare },
  { key: "selection", label: "Selection", icon: CheckSquare },
  { key: "report", label: "Report", icon: FileText },
  { key: "followup", label: "Follow-up", icon: MessageCircle },
] as const;

interface Props {
  currentPhase: string;
  activity: string;
  isProcessing: boolean;
  activityLog?: Record<string, string[]>;
  isComplete?: boolean;
}

export function AgentActivity({ currentPhase, activity, isProcessing, activityLog, isComplete }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest log entry
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activityLog, activity]);

  if (!currentPhase) return null;

  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);

  // Collect all log entries across phases in order, with phase tags
  const allLogs: { phase: string; message: string }[] = [];
  for (const phase of PHASES) {
    const entries = activityLog?.[phase.key] || [];
    for (const msg of entries) {
      allLogs.push({ phase: phase.key, message: msg });
    }
  }
  // Add current activity if not already in logs
  if (activity && (allLogs.length === 0 || allLogs[allLogs.length - 1].message !== activity)) {
    allLogs.push({ phase: currentPhase, message: activity });
  }

  // Show the most recent entries (tail)
  const visibleLogs = allLogs.slice(-6);

  return (
    <div
      className={`border-t border-slate-200/60 bg-slate-50/80 backdrop-blur-sm px-4 shrink-0 transition-all duration-500 ${
        isComplete ? "max-h-0 py-0 overflow-hidden opacity-0" : "max-h-48 opacity-100 py-2"
      }`}
    >
      {/* Phase pipeline */}
      <div className="flex items-center gap-1.5 max-w-3xl mx-auto">
        {PHASES.map((phase, i) => {
          const isActive = phase.key === currentPhase;
          const isCompleted = currentIdx > i;
          const PhaseIcon = phase.icon;

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
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 phase-pulse"
                    : isCompleted
                    ? "bg-green-50 text-green-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <PhaseIcon className="w-3.5 h-3.5" />
                )}
                {phase.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrolling activity log */}
      {visibleLogs.length > 0 && isProcessing && (
        <div className="max-w-3xl mx-auto mt-1.5 max-h-16 overflow-y-auto activity-log">
          {visibleLogs.map((entry, i) => {
            const isLatest = i === visibleLogs.length - 1;
            return (
              <div
                key={`${entry.phase}-${i}`}
                className={`flex items-center gap-1.5 text-xs leading-relaxed ${
                  isLatest ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {isLatest && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                )}
                <span className={`truncate ${isLatest ? "font-medium" : ""}`}>
                  {entry.message}
                </span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
