"use client";

import { ChatMessage } from "@/lib/types";
import { IntakeWidget } from "./IntakeWidget";
import { TrialCard } from "./TrialCard";
import { TrialCarousel } from "./TrialCarousel";
import { Loader2, FileText } from "lucide-react";
import { useState } from "react";

interface Props {
  message: ChatMessage;
  onWidgetSubmit: (questionId: string, selections: string[], question?: string) => void;
  onTrialSelection: (trialIds: string[]) => void;
  knownDrugs?: string[];
}

/** Auto-link known drug/intervention names to DailyMed. Only links the first
 *  occurrence of each name and skips text already inside an <a> tag. */
function linkifyDrugs(html: string, drugs: string[]): string {
  if (drugs.length === 0) return html;
  // Sort longest-first so "lenalidomide capsules" matches before "lenalidomide"
  const sorted = [...drugs].sort((a, b) => b.length - a.length);
  for (const drug of sorted) {
    if (drug.length < 4) continue;
    const escaped = drug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary match, skip if inside an existing <a>…</a>
    const regex = new RegExp(`\\b(${escaped})\\b(?![^<]*<\\/a>)`, "gi");
    const url = `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(drug.toLowerCase())}`;
    let linked = false;
    html = html.replace(regex, (match) => {
      if (linked) return match;
      linked = true;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${match}</a>`;
    });
  }
  return html;
}

function renderMarkdown(text: string, knownDrugs: string[] = []) {
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
    linkifyDrugs(
      s
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>'
        )
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(
          /\b(NCT\d{7,8})\b/g,
          '<a href="https://clinicaltrials.gov/study/$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>'
        ),
      knownDrugs,
    );

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

export function MessageBubble({ message, onWidgetSubmit, onTrialSelection, knownDrugs = [] }: Props) {
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

    // Convert raw trial data to the format components expect
    const trialData = trials.map((trial) => ({
      nctId: trial.nct_id as string,
      briefTitle: trial.brief_title as string,
      phase: trial.phase as string,
      overallStatus: trial.overall_status as string,
      fitScore: trial.fit_score as number,
      fitSummary: trial.fit_summary as string,
      nearestDistanceMiles: trial.nearest_distance_miles as number | null,
      interventions: (trial.interventions as string[]) || [],
      sponsor: trial.sponsor as string,
      latitude: trial.latitude as number | undefined,
      longitude: trial.longitude as number | undefined,
    }));

    if (selectable) {
      return (
        <div className="max-w-[90%]">
          <TrialCarousel trials={trialData} onSelect={onTrialSelection} />
        </div>
      );
    }

    // Non-selectable: show cards in a list
    return (
      <div className="max-w-[90%] space-y-3">
        {trialData.map((trial) => (
          <TrialCard
            key={trial.nctId}
            {...trial}
          />
        ))}
      </div>
    );
  }

  if (message.messageType === "report_ready") {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";
    const rawUrl = (message.metadata?.url as string) || "";
    const url = rawUrl.startsWith("/") ? `${API_URL}${rawUrl}` : rawUrl || "#";
    const rawPdfUrl = (message.metadata?.pdf_url as string) || "";
    const pdfUrl = rawPdfUrl ? (rawPdfUrl.startsWith("/") ? `${API_URL}${rawPdfUrl}` : rawPdfUrl) : "";
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
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm ml-3"
              >
                Download PDF
              </a>
            )}
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
      <div className="chat-bubble-assistant">{renderMarkdown(message.content, knownDrugs)}</div>
    </div>
  );
}
