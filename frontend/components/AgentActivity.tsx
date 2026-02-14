"use client";

import React, { useEffect, useRef } from "react";
import { CheckCircle2, ClipboardList, Search, GitCompare, CheckSquare, FileText, MessageCircle, Check } from "lucide-react";

const PHASES = [
  { key: "intake", label: "Intake", icon: ClipboardList },
  { key: "search", label: "Search", icon: Search },
  { key: "matching", label: "Matching", icon: GitCompare },
  { key: "selection", label: "Selection", icon: CheckSquare },
  { key: "report", label: "Report", icon: FileText },
  { key: "followup", label: "Follow-up", icon: MessageCircle },
] as const;

export interface LogEntry {
  message: string;
  done: boolean;
}

interface Props {
  currentPhase: string;
  activity: string;
  isProcessing: boolean;
  activityLog?: Record<string, LogEntry[]>;
  isComplete?: boolean;
  onPhaseClick?: (phaseKey: string) => void;
}

const NCT_REGEX = /NCT\d{8}/g;

function renderLogMessage(message: string): React.ReactNode {
  // Linkify FDA drug lookups: "Looking up FDA data for {drug}..." or "Looking up FDA data for {drug} (NCT...)..."
  const fdaMatch = message.match(/^Looking up FDA data for (.+?)(?:\s*\(NCT\d{8}\))?\.\.\.$/);
  if (fdaMatch) {
    const drug = fdaMatch[1].trim();
    const url = `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug)}`;
    // Check for NCT ID in the parenthetical
    const nctMatch = message.match(/\((NCT\d{8})\)/);
    return (
      <>
        Looking up FDA data for{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {drug}
        </a>
        {nctMatch && (
          <>
            {" ("}
            <a
              href={`https://clinicaltrials.gov/study/${nctMatch[1]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {nctMatch[1]}
            </a>
            {")"}
          </>
        )}
        ...
      </>
    );
  }

  // Linkify NCT IDs (e.g., NCT12345678) to ClinicalTrials.gov in any message
  if (NCT_REGEX.test(message)) {
    NCT_REGEX.lastIndex = 0; // Reset regex state
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NCT_REGEX.exec(message)) !== null) {
      if (match.index > lastIndex) {
        parts.push(message.slice(lastIndex, match.index));
      }
      const nctId = match[0];
      parts.push(
        <a
          key={`${nctId}-${match.index}`}
          href={`https://clinicaltrials.gov/study/${nctId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {nctId}
        </a>
      );
      lastIndex = match.index + nctId.length;
    }
    if (lastIndex < message.length) {
      parts.push(message.slice(lastIndex));
    }
    return <>{parts}</>;
  }

  return message;
}

export function AgentActivity({ currentPhase, activity, isProcessing, activityLog, isComplete, onPhaseClick }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest log entry
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activityLog, activity]);

  if (!currentPhase) return null;

  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);

  // Collect all log entries across phases in order, with phase tags and done state
  const allLogs: { phase: string; message: string; done: boolean }[] = [];
  for (const phase of PHASES) {
    const entries = activityLog?.[phase.key] || [];
    for (const entry of entries) {
      allLogs.push({ phase: phase.key, message: entry.message, done: entry.done });
    }
  }
  // Add current activity if not already in logs
  if (activity && (allLogs.length === 0 || allLogs[allLogs.length - 1].message !== activity)) {
    allLogs.push({ phase: currentPhase, message: activity, done: false });
  }

  // Show the most recent entries (tail)
  const visibleLogs = allLogs.slice(-10);

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
              {(() => {
                const isClickable = (isActive || isCompleted) && onPhaseClick;
                const Tag = isClickable ? "button" : "div";
                return (
                  <Tag
                    {...(isClickable ? { onClick: () => onPhaseClick(phase.key) } : {})}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 phase-pulse"
                        : isCompleted
                        ? "bg-green-50 text-green-600"
                        : "bg-slate-100 text-slate-400"
                    } ${isClickable ? "cursor-pointer hover:ring-1 hover:ring-blue-300" : ""}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <PhaseIcon className="w-3.5 h-3.5" />
                    )}
                    {phase.label}
                  </Tag>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Scrolling activity log */}
      {visibleLogs.length > 0 && (
        <div className="max-w-3xl mx-auto mt-1.5 max-h-24 overflow-y-auto activity-log">
          {visibleLogs.map((entry, i) => {
            const isLatest = i === visibleLogs.length - 1;
            return (
              <div
                key={`${entry.phase}-${i}`}
                className={`flex items-center gap-1.5 text-xs leading-relaxed ${
                  isLatest && !entry.done ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {entry.done ? (
                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : isProcessing ? (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                ) : null}
                <span className={`truncate ${isLatest && !entry.done ? "font-medium" : ""}`}>
                  {renderLogMessage(entry.message)}
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
