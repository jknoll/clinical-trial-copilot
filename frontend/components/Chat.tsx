"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { WSClient } from "@/lib/websocket";
import { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { AgentActivity } from "./AgentActivity";
import { HealthImport, ImportSummary } from "./HealthImport";

import { FacetedFilters, ActiveFilter } from "@/lib/types";

interface DetectedLocation {
  display: string;
  latitude: number;
  longitude: number;
}

interface Props {
  sessionId: string;
  onFiltersChanged?: (filters: Partial<FacetedFilters>, display: ActiveFilter[]) => void;
  detectedLocation?: DetectedLocation | null;
  zeroResults?: boolean;
  demoRef?: React.MutableRefObject<(() => void) | null>;
  onLocationConfirmed?: (lat: number, lon: number) => void;
  onLocationOverride?: (locationText: string) => void;
  onReportReady?: (htmlUrl: string, pdfUrl: string) => void;
  healthImported?: boolean;
  onHealthImported?: (summary: ImportSummary) => void;
  backendUrl?: string;
}

// Demo answer lookup — keyword-based, each entry can only be used once.
// Keywords are specific enough to avoid cross-matching.
const DEMO_ANSWERS: [string[], string][] = [
  // Diagnosis details / stage / when diagnosed
  [["diagnos", "stage", "when were you", "first", "more detail", "more about your"], "About 8 months ago, it's localized to my femur"],
  // Treatment history
  [["treatment", "tried so far", "receiving", "medication", "what therap"], "I completed 6 cycles of VDC/IE chemotherapy"],
  // Treatment effectiveness follow-up
  [["working for you", "helping", "effective", "how has the", "response to"], "There was a partial response but the tumor hasn't fully resolved"],
  // Other conditions / comorbidities
  [["other condition", "other health", "comorbid", "besides"], "No other major conditions"],
  // Location confirmation (browser detected)
  [["is this where you'd like", "near alameda", "right area", "where you'd like to search"], "Yes, that's correct"],
  // Location (no browser detection)
  [["where are you located", "city and state", "what area"], "Boston, MA"],
  // Age
  [["how old", "your age", "date of birth"], "17"],
  // Biological sex
  [["biological sex", "male or female", "assigned at birth"], "Male"],
  // Activity level (text or widget)
  [["activity level", "day-to-day", "daily activit", "describe your"], "I can do most daily activities but get tired more easily than usual"],
  // Trial types (widget)
  [["type of trial", "types of trial", "what kind of trial", "what types"], "Treatment trials"],
  // Trial phases (widget)
  [["trial phase", "phases are you", "which phase", "open to which"], "Early phase (Phase 1 or 2)"],
  // Travel distance (widget)
  [["travel", "distance", "how far", "willing to go", "miles"], "Within 500 miles"],
  // Placebo comfort (widget)
  [["placebo", "inactive treatment"], "I'm comfortable with the possibility of receiving a placebo"],
  // Profile confirmation
  [["does this look correct", "look right", "anything you.d like to change", "is there anything", "ready for me to", "shall i"], "Yes, that looks correct"],
  // Trial selection
  [["which of these", "interest you", "which trial", "more details on"], "I'm interested in all of them"],
  // Follow-up catch-all
  [["anything else", "remaining question", "additional question", "anything you'd like to"], "No, thank you — this is very helpful"],
];

const _usedDemoAnswers = new Set<number>();

function findDemoAnswer(text: string): string | null {
  const lower = text.toLowerCase();

  // Find the best matching answer that hasn't been used
  for (let i = 0; i < DEMO_ANSWERS.length; i++) {
    if (_usedDemoAnswers.has(i)) continue;
    const [keywords, answer] = DEMO_ANSWERS[i];
    if (keywords.some((kw) => lower.includes(kw))) {
      _usedDemoAnswers.add(i);
      return answer;
    }
  }

  // Generic fallback for truly unexpected questions
  return "Yes, let's continue";
}

export function Chat({ sessionId, onFiltersChanged, detectedLocation, zeroResults, demoRef, onLocationConfirmed, onLocationOverride, onReportReady, healthImported, onHealthImported, backendUrl }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isServerProcessing, setIsServerProcessing] = useState(false);
  const wsRef = useRef<WSClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTextRef = useRef<string>("");
  const pendingIdRef = useRef<string>("");
  const demoModeRef = useRef(false);
  const [currentPhase, setCurrentPhase] = useState("");
  const [deviceImportSummary, setDeviceImportSummary] = useState<ImportSummary | null>(null);
  const [currentActivity, setCurrentActivity] = useState("");
  const [activityLog, setActivityLog] = useState<Record<string, string[]>>({});
  const [isProcessingComplete, setIsProcessingComplete] = useState(false);
  const handleWidgetSubmitRef = useRef<((questionId: string, selections: string[], question?: string) => void) | null>(null);
  const handleTrialSelectionRef = useRef<((trialIds: string[]) => void) | null>(null);
  const onReportReadyRef = useRef(onReportReady);
  onReportReadyRef.current = onReportReady;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const handleMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === "text") {
      setIsTyping(true);
      // Set intake phase on first assistant text (welcome message)
      setCurrentPhase((prev) => prev || "intake");
      const content = data.content as string;
      pendingTextRef.current += content;

      // Create or update the pending assistant message
      if (!pendingIdRef.current) {
        pendingIdRef.current = `msg_${Date.now()}`;
      }

      const msgId = pendingIdRef.current;
      const text = pendingTextRef.current;

      setMessages((prev) => {
        const existing = prev.findIndex((m) => m.id === msgId);
        const msg: ChatMessage = {
          id: msgId,
          role: "assistant",
          content: text,
          messageType: "text",
          timestamp: Date.now(),
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = msg;
          return updated;
        }
        return [...prev, msg];
      });
    } else if (type === "text_done") {
      pendingTextRef.current = "";
      pendingIdRef.current = "";
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 50);

      if (demoModeRef.current) {
        // Wait then check if we need to send a text answer.
        // Skip if a widget/trial_cards arrives in the meantime (they handle themselves).
        setTimeout(() => {
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            // Skip if a widget, trial_cards, or user message appeared since text_done
            if (lastMsg && (lastMsg.messageType === "widget" || lastMsg.messageType === "trial_cards" || lastMsg.role === "user")) {
              return prev;
            }
            const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant" && m.messageType === "text");
            if (lastAssistant && lastAssistant.content.includes("?")) {
              const answer = findDemoAnswer(lastAssistant.content);
              if (answer) {
                const userMsg: ChatMessage = {
                  id: `user_${Date.now()}`,
                  role: "user",
                  content: answer,
                  messageType: "text",
                  timestamp: Date.now(),
                };
                wsRef.current?.send({ type: "message", content: answer });
                setIsTyping(true);
                setIsServerProcessing(true);
                return [...prev, userMsg];
              }
            }
            return prev;
          });
        }, 1500);
      }
    } else if (type === "widget") {
      setIsTyping(false);
      const msg: ChatMessage = {
        id: `widget_${Date.now()}`,
        role: "assistant",
        content: "",
        messageType: "widget",
        metadata: data as Record<string, unknown>,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);

      // Demo mode: auto-answer widgets
      if (demoModeRef.current) {
        const widgetQuestion = (data.question as string) || "";
        const answer = findDemoAnswer(widgetQuestion);
        if (answer) {
          setTimeout(() => {
            handleWidgetSubmitRef.current?.(
              data.questionId as string,
              [answer],
              widgetQuestion
            );
          }, 800);
        }
      }
    } else if (type === "trial_cards") {
      setIsTyping(false);
      const msg: ChatMessage = {
        id: `trials_${Date.now()}`,
        role: "assistant",
        content: "",
        messageType: "trial_cards",
        metadata: data as Record<string, unknown>,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);

      // Demo mode: auto-select all trials if selectable
      if (demoModeRef.current && data.selectable) {
        const trials = (data.trials as Array<Record<string, unknown>>) || [];
        const allIds = trials.map((t) => t.nct_id as string).filter(Boolean);
        if (allIds.length > 0) {
          setTimeout(() => {
            handleTrialSelectionRef.current?.(allIds);
          }, 1500);
        }
      }
    } else if (type === "filters_update") {
      if (onFiltersChanged) {
        const partial: Record<string, unknown> = {};
        const display: { key: string; label: string; value: string }[] = [];

        if (data.condition) {
          partial.condition = data.condition as string;
          display.push({ key: "condition", label: "Condition", value: data.condition as string });
        }
        if (data.statuses) {
          partial.statuses = data.statuses as string[];
          display.push({ key: "statuses", label: "Status", value: (data.statuses as string[]).join(", ") });
        }
        if (data.age != null) {
          partial.age = data.age as number;
          display.push({ key: "age", label: "Age", value: String(data.age) });
        }
        if (data.sex) {
          partial.sex = data.sex as string;
          display.push({ key: "sex", label: "Sex", value: data.sex as string });
        }
        if (data.location) {
          display.push({ key: "location", label: "Location", value: data.location as string });
        }
        if (data.latitude != null && data.longitude != null) {
          partial.latitude = data.latitude as number;
          partial.longitude = data.longitude as number;
        }
        if (data.distance_miles != null) {
          partial.distance_miles = data.distance_miles as number;
          display.push({ key: "distance", label: "Distance", value: `Within ${data.distance_miles} mi` });
        }

        if (display.length > 0) {
          onFiltersChanged(partial as any, display);
        }
      }
    } else if (type === "status") {
      // Status messages go to AgentActivity strip only, not into chat
      if (data.phase) {
        setCurrentPhase(data.phase as string);
      }
      setCurrentActivity(data.message as string || "");
      // Infer phase from status message keywords
      const statusMsg = ((data.message as string) || "").toLowerCase();
      if (statusMsg.includes("searching") || statusMsg.includes("querying") || statusMsg.includes("geocod")) {
        setCurrentPhase("search");
      } else if (statusMsg.includes("analyzing") || statusMsg.includes("scoring") || statusMsg.includes("fda")) {
        setCurrentPhase("matching");
      } else if (statusMsg.includes("report") || statusMsg.includes("generating")) {
        setCurrentPhase("report");
      }
      // Accumulate status messages per phase for activity log.
      // Normalize raw phase keys to canonical ones so AgentActivity can find them.
      const rawPhase = (data.phase as string) || currentPhase;
      const PHASE_MAP: Record<string, string> = {
        searching: "search", analyzing: "matching", fda_lookup: "matching",
        geocoding: "search", matching: "matching", report: "report",
        intake: "intake", search: "search", selection: "selection",
        followup: "followup",
      };
      const normalizedPhase = PHASE_MAP[rawPhase] || rawPhase;
      if (normalizedPhase && data.message) {
        setActivityLog(prev => ({
          ...prev,
          [normalizedPhase]: [...(prev[normalizedPhase] || []), data.message as string]
        }));
      }
    } else if (type === "report_ready") {
      setIsTyping(false);
      const msg: ChatMessage = {
        id: `report_${Date.now()}`,
        role: "assistant",
        content: "",
        messageType: "report_ready",
        metadata: data as Record<string, unknown>,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      // Demo mode: stop auto-answering after report is generated
      demoModeRef.current = false;
      // Notify parent to show floating report card
      if (onReportReadyRef.current) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";
        const rawUrl = (data.url as string) || "";
        const htmlUrl = rawUrl.startsWith("/") ? `${API_URL}${rawUrl}` : rawUrl;
        const rawPdfUrl = (data.pdf_url as string) || "";
        const pdfUrl = rawPdfUrl.startsWith("/") ? `${API_URL}${rawPdfUrl}` : rawPdfUrl;
        onReportReadyRef.current(htmlUrl, pdfUrl);
      }
    } else if (type === "health_imported") {
      const importSummary: ImportSummary = {
        lab_count: (data.lab_count as number) ?? 0,
        vital_count: (data.vital_count as number) ?? 0,
        medication_count: (data.medication_count as number) ?? 0,
        activity_steps_per_day: (data.activity_steps_per_day as number | null) ?? null,
        estimated_ecog: (data.estimated_ecog as number | null) ?? null,
        import_date: (data.import_date as string) ?? "",
        source_file: (data.source_file as string) ?? "",
      };
      setDeviceImportSummary(importSummary);
      onHealthImported?.(importSummary);
    } else if (type === "done") {
      setIsTyping(false);
      setIsServerProcessing(false);
      setCurrentActivity("");
      // Refocus input so user can immediately type
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (type === "error") {
      setIsTyping(false);
      setIsServerProcessing(false);
      const msg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "system",
        content: data.content as string || "An error occurred",
        messageType: "text",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
    }
  }, [onHealthImported]);

  useEffect(() => {
    // Clear any stale messages from previous connections
    setMessages([]);
    pendingTextRef.current = "";
    pendingIdRef.current = "";

    const ws = new WSClient(sessionId, handleMessage);
    ws.connect();
    wsRef.current = ws;
    return () => ws.disconnect();
  }, [sessionId, handleMessage]);

  // Send system hint when filters narrow to zero results
  const prevZeroResults = useRef(false);
  useEffect(() => {
    if (zeroResults && !prevZeroResults.current && wsRef.current && !demoModeRef.current) {
      wsRef.current.send({
        type: "system_hint",
        content:
          "IMPORTANT: The real-time database shows 0 clinical trials matching the patient's current criteria. " +
          "Stop asking narrowing questions. Inform the patient and suggest broadening their criteria.",
      });
    }
    prevZeroResults.current = !!zeroResults;
  }, [zeroResults]);

  const messageCountRef = useRef(0);

  useEffect(() => {
    if (demoRef) {
      demoRef.current = () => {
        demoModeRef.current = true;
        _usedDemoAnswers.clear();
        // Send "Ewing Sarcoma" directly via websocket
        const text = "Ewing Sarcoma";
        const msg: ChatMessage = {
          id: `user_${Date.now()}`,
          role: "user",
          content: text,
          messageType: "text",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        setIsTyping(true);
        setIsServerProcessing(true);

        const payload: {
          type: string;
          content: string;
          location_context?: { display: string; latitude: number; longitude: number };
        } = { type: "message", content: text };
        if (detectedLocation) {
          payload.location_context = {
            display: detectedLocation.display,
            latitude: detectedLocation.latitude,
            longitude: detectedLocation.longitude,
          };
        }
        wsRef.current?.send(payload);

        if (onFiltersChanged) {
          onFiltersChanged({ condition: text }, [{ key: "condition", label: "Condition", value: text }]);
        }
        messageCountRef.current++;
      };
    }
  }, [demoRef, detectedLocation, onFiltersChanged]);

  const sendMessage = useCallback(() => {
    let text = input.trim();
    if (!text || !wsRef.current) return;

    // Hidden test mode: typing "test" as first message activates automated demo
    if (text.toLowerCase() === "test" && messageCountRef.current === 0) {
      demoModeRef.current = true;
      _usedDemoAnswers.clear();
      text = "Ewing Sarcoma";
    }

    const msg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      messageType: "text",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setInput("");
    setIsTyping(true);
    setIsServerProcessing(true);
    const payload: {
      type: string;
      content: string;
      location_context?: { display: string; latitude: number; longitude: number };
    } = { type: "message", content: text };
    // Attach detected location on first message so the agent can confirm it
    if (messageCountRef.current === 0 && detectedLocation) {
      payload.location_context = {
        display: detectedLocation.display,
        latitude: detectedLocation.latitude,
        longitude: detectedLocation.longitude,
      };
    }
    wsRef.current.send(payload);
    inputRef.current?.focus();

    messageCountRef.current++;

    // First message is the condition — send it as a filter immediately
    if (onFiltersChanged && messageCountRef.current === 1) {
      onFiltersChanged({ condition: text }, [{ key: "condition", label: "Condition", value: text }]);
    }
  }, [input, onFiltersChanged, detectedLocation]);

  const handleWidgetSubmit = useCallback(
    (questionId: string, selections: string[], question?: string) => {
      if (!wsRef.current) return;
      // Show the selection as a user message
      const msg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: selections.join(", "),
        messageType: "text",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      setIsTyping(true);
      setIsServerProcessing(true);
      wsRef.current.send({
        type: "widget_response",
        questionId,
        selections,
        question,
      });

      // Extract filters from widget answers for stats panel
      if (onFiltersChanged && question) {
        const q = question.toLowerCase();
        const val = selections.join(", ");

        if (q.includes("condition") || q.includes("diagnosis") || q.includes("looking for") || q.includes("what condition") || q.includes("exploring clinical trials for")) {
          onFiltersChanged({ condition: val }, [{ key: "condition", label: "Condition", value: val }]);
        } else if (q.includes("phase")) {
          // Phases don't directly map to stats filters but we show them
          onFiltersChanged({}, [{ key: "phases", label: "Phases", value: val }]);
        } else if (q.includes("recruiting") || (q.includes("trial status") || q.includes("study status"))) {
          onFiltersChanged({ statuses: selections }, [{ key: "statuses", label: "Status", value: val }]);
        }
      }

      // Detect location confirmation or override
      if (question) {
        const q = question.toLowerCase();
        if (q.includes("location") || q.includes("near") || q.includes("area") || q.includes("correct") || q.includes("where")) {
          const affirmative = selections.some((s) => s.toLowerCase().includes("yes") || s.toLowerCase().includes("correct"));
          if (affirmative && onLocationConfirmed && detectedLocation) {
            onLocationConfirmed(detectedLocation.latitude, detectedLocation.longitude);
            // Emit location pill
            if (onFiltersChanged) {
              onFiltersChanged({}, [{ key: "location", label: "Location", value: detectedLocation.display }]);
            }
          } else if (!affirmative && onLocationOverride) {
            // User provided a different location
            const locationText = selections.join(", ");
            if (locationText.length > 2) {
              onLocationOverride(locationText);
              // Emit location pill
              if (onFiltersChanged) {
                onFiltersChanged({}, [{ key: "location", label: "Location", value: locationText }]);
              }
            }
          }
        }

        // Detect travel distance widget
        if (q.includes("travel") || q.includes("distance") || q.includes("miles") || q.includes("how far")) {
          const val = selections[0] || "";
          const milesMatch = val.match(/(\d+)\s*miles?/i) || val.match(/within\s+(\d+)/i);
          if (milesMatch && onFiltersChanged) {
            const miles = parseInt(milesMatch[1], 10);
            onFiltersChanged(
              { distance_miles: miles },
              [{ key: "distance", label: "Distance", value: `Within ${miles} mi` }]
            );
          }
        }
      }
    },
    [onFiltersChanged, onLocationConfirmed, onLocationOverride, detectedLocation]
  );

  handleWidgetSubmitRef.current = handleWidgetSubmit;

  const handleTrialSelection = useCallback(
    (trialIds: string[]) => {
      if (!wsRef.current) return;
      const msg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: `Selected ${trialIds.length} trials for detailed analysis`,
        messageType: "text",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      setIsTyping(true);
      setIsServerProcessing(true);
      wsRef.current.send({ type: "trial_selection", trialIds });
    },
    []
  );

  handleTrialSelectionRef.current = handleTrialSelection;

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm">
      {/* Health import card — shown during intake phase; component handles its own collapse/badge */}
      {currentPhase === "intake" && (
        <HealthImport sessionId={sessionId} backendUrl={backendUrl} onImported={onHealthImported} externalSummary={deviceImportSummary} />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, idx) => (
          <div key={msg.id} className={idx === messages.length - 1 ? "message-enter" : undefined}>
            <MessageBubble
              message={msg}
              onWidgetSubmit={handleWidgetSubmit}
              onTrialSelection={handleTrialSelection}
            />
          </div>
        ))}

        {(isTyping || isServerProcessing) && !pendingIdRef.current && (
          <div className="flex items-center gap-1 px-4 py-3">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Agent activity strip */}
      <AgentActivity
        currentPhase={currentPhase}
        activity={currentActivity}
        isProcessing={isServerProcessing}
        activityLog={activityLog}
        isComplete={isProcessingComplete}
      />

      {/* Input area */}
      <div className="border-t border-slate-200/60 bg-white/80 backdrop-blur-lg px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isServerProcessing}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isServerProcessing}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
