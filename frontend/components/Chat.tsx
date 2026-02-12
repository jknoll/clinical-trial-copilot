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
}

// Demo answer lookup — keyword-based, each entry can only be used once.
// Keywords are specific enough to avoid cross-matching.
const DEMO_ANSWERS: [string[], string][] = [
  // Diagnosis details / stage / when diagnosed
  [["diagnos", "stage", "when were you", "first", "more detail", "more about your"], "About 6 months ago, it's stage IV"],
  // Treatment history
  [["treatment", "tried so far", "receiving", "medication", "what therap"], "I've been on levodopa for 3 months"],
  // Treatment effectiveness follow-up
  [["working for you", "helping", "effective", "how has the", "response to"], "It's been partially helping but I still have significant symptoms"],
  // Other conditions / comorbidities
  [["other condition", "other health", "comorbid", "besides parkinson"], "No other major conditions"],
  // Location confirmation (browser detected)
  [["is this where you'd like", "near alameda", "right area", "where you'd like to search"], "Yes, that's correct"],
  // Location (no browser detection)
  [["where are you located", "city and state", "what area"], "Boston, MA"],
  // Age
  [["how old", "your age", "date of birth"], "68"],
  // Biological sex
  [["biological sex", "male or female", "assigned at birth"], "Male"],
  // Activity level (text or widget)
  [["activity level", "day-to-day", "daily activit", "describe your"], "I can do most daily activities but get tired more easily than usual"],
  // Trial types (widget)
  [["type of trial", "types of trial", "what kind of trial", "what types"], "Treatment trials"],
  // Trial phases (widget)
  [["trial phase", "phases are you", "which phase", "open to which"], "Late phase (Phase 3)"],
  // Travel distance (widget)
  [["travel", "distance", "how far", "willing to go", "miles"], "Within 50 miles"],
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

export function Chat({ sessionId, onFiltersChanged, detectedLocation, zeroResults, demoRef, onLocationConfirmed, onLocationOverride, onReportReady, healthImported, onHealthImported }: Props) {
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
      // Accumulate status messages per phase for activity log
      const phase = (data.phase as string) || currentPhase;
      if (phase && data.message) {
        setActivityLog(prev => ({
          ...prev,
          [phase]: [...(prev[phase] || []), data.message as string]
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
  }, []);

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
        // Send "Parkinson disease" directly via websocket
        const text = "Parkinson disease";
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
      text = "Parkinson disease";
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

    // Extract filters from text responses based on the last assistant question
    if (onFiltersChanged) {
      if (messageCountRef.current === 1) {
        // First message is the condition
        onFiltersChanged({ condition: text }, [{ key: "condition", label: "Condition", value: text }]);
      } else {
        // Check the last assistant message to infer what question was asked
        const lastAssistant = [...messages].reverse().find(
          (m) => m.role === "assistant" && (m.messageType === "text" || m.messageType === "widget")
        );
        if (lastAssistant) {
          const q = lastAssistant.content.toLowerCase();
          if (q.includes("age") || q.includes("old") || q.includes("your age") || q.includes("date of birth")) {
            const ageMatch = text.match(/(\d+)/);
            if (ageMatch) {
              const age = parseInt(ageMatch[1]);
              onFiltersChanged({ age }, [{ key: "age", label: "Age", value: String(age) }]);
            }
          } else if (q.includes("sex") || q.includes("biological sex") || q.includes("male or female")) {
            const lower = text.toLowerCase();
            if (lower.includes("female") || lower.includes("woman")) {
              onFiltersChanged({ sex: "Female" }, [{ key: "sex", label: "Sex", value: "Female" }]);
            } else if (lower.includes("male") || lower.includes("man")) {
              onFiltersChanged({ sex: "Male" }, [{ key: "sex", label: "Sex", value: "Male" }]);
            }
          } else if (q.includes("location") || q.includes("located") || q.includes("where") || q.includes("near you")) {
            // User typed a location — trigger map update
            if (onLocationOverride && text.length > 2) {
              onLocationOverride(text);
            }
          }
        }
      }
    }
  }, [input, onFiltersChanged, detectedLocation, messages, onLocationOverride]);

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
        } else if (q.includes("age") || q.includes("old") || q.includes("your age") || q.includes("date of birth")) {
          const ageMatch = val.match(/(\d+)/);
          if (ageMatch) {
            const age = parseInt(ageMatch[1]);
            onFiltersChanged({ age }, [{ key: "age", label: "Age", value: String(age) }]);
          }
        } else if (q.includes("sex") || q.includes("gender") || q.includes("biological") || q.includes("male or female") || q.includes("assigned at birth")) {
          onFiltersChanged({ sex: selections[0] }, [{ key: "sex", label: "Sex", value: selections[0] }]);
        } else if (q.includes("phase")) {
          // Phases don't directly map to stats filters but we show them
          onFiltersChanged({}, [{ key: "phases", label: "Phases", value: val }]);
        } else if (q.includes("status") || q.includes("recruiting")) {
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
          } else if (!affirmative && onLocationOverride) {
            // User provided a different location
            const locationText = selections.join(", ");
            if (locationText.length > 2) {
              onLocationOverride(locationText);
            }
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
    <div className="flex flex-col h-full">
      {/* Health import card — shown during intake phase before import */}
      {currentPhase === "intake" && !healthImported && (
        <HealthImport sessionId={sessionId} onImported={onHealthImported} />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onWidgetSubmit={handleWidgetSubmit}
            onTrialSelection={handleTrialSelection}
          />
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
      <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
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
            className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
