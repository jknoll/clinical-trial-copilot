"use client";

import { ChatMessage } from "@/lib/types";
import { IntakeWidget } from "./IntakeWidget";
import { TrialCard } from "./TrialCard";
import { Loader2, FileText } from "lucide-react";
import { useState } from "react";

interface Props {
  message: ChatMessage;
  onWidgetSubmit: (questionId: string, selections: string[]) => void;
  onTrialSelection: (trialIds: string[]) => void;
}

function renderMarkdown(text: string) {
  // Simple markdown rendering: bold, line breaks, bullet points
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-5 mb-2">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: boldify(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  const boldify = (s: string) =>
    s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inList = true;
      listItems.push(trimmed.slice(2));
    } else {
      flushList();
      if (trimmed === "") {
        if (i < lines.length - 1) {
          elements.push(<br key={`br-${i}`} />);
        }
      } else {
        elements.push(
          <p
            key={`p-${i}`}
            className="mb-1"
            dangerouslySetInnerHTML={{ __html: boldify(trimmed) }}
          />
        );
      }
    }
  }
  flushList();

  return <div className="message-content">{elements}</div>;
}

export function MessageBubble({ message, onWidgetSubmit, onTrialSelection }: Props) {
  const [selectedTrials, setSelectedTrials] = useState<Set<string>>(new Set());

  if (message.messageType === "status") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-1 px-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{message.content}</span>
      </div>
    );
  }

  if (message.messageType === "widget" && message.metadata) {
    const meta = message.metadata;
    return (
      <div className="max-w-[85%]">
        <IntakeWidget
          question={meta.question as string}
          questionId={meta.question_id as string}
          widgetType={meta.widget_type as "single_select" | "multi_select"}
          options={(meta.options as Array<{ label: string; value: string; description?: string }>) || []}
          onSubmit={onWidgetSubmit}
        />
      </div>
    );
  }

  if (message.messageType === "trial_cards" && message.metadata) {
    const trials = (message.metadata.trials as Array<Record<string, unknown>>) || [];
    const selectable = message.metadata.selectable as boolean;

    const toggleTrial = (nctId: string) => {
      setSelectedTrials((prev) => {
        const next = new Set(prev);
        if (next.has(nctId)) next.delete(nctId);
        else next.add(nctId);
        return next;
      });
    };

    return (
      <div className="max-w-[90%] space-y-3">
        {trials.map((trial) => (
          <TrialCard
            key={trial.nct_id as string}
            nctId={trial.nct_id as string}
            briefTitle={trial.brief_title as string}
            phase={trial.phase as string}
            overallStatus={trial.overall_status as string}
            fitScore={trial.fit_score as number}
            fitSummary={trial.fit_summary as string}
            nearestDistanceMiles={trial.nearest_distance_miles as number | null}
            interventions={(trial.interventions as string[]) || []}
            sponsor={trial.sponsor as string}
            selectable={selectable}
            selected={selectedTrials.has(trial.nct_id as string)}
            onToggle={() => toggleTrial(trial.nct_id as string)}
          />
        ))}
        {selectable && trials.length > 0 && (
          <button
            onClick={() => onTrialSelection(Array.from(selectedTrials))}
            disabled={selectedTrials.size === 0}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Analyze {selectedTrials.size} Selected Trial{selectedTrials.size !== 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  }

  if (message.messageType === "report_ready") {
    const url = (message.metadata?.url as string) || "#";
    return (
      <div className="chat-bubble-assistant">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-blue-600" />
          <div>
            <p className="font-medium">Your briefing report is ready!</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              View Report
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Default text messages
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="chat-bubble-user">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="chat-bubble-assistant">{renderMarkdown(message.content)}</div>
    </div>
  );
}
