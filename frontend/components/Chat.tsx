"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { WSClient } from "@/lib/websocket";
import { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { AgentActivity } from "./AgentActivity";

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
  onReportReady?: (htmlUrl: string, pdfUrl: string) => void;
}

const DEMO_ANSWERS: [string[], string[]][] = [
  [["treatment", "tried", "receiving"], ["I haven't tried any treatments yet"]],
  [["location", "near", "correct", "right area"], ["Yes, that's correct"]],
  [["age", "old", "your age", "date of birth"], ["55"]],
  [["sex", "biological", "gender", "male or female", "assigned at birth"], ["Female"]],
  [["activity", "day-to-day", "daily", "physical", "everyday"], ["I can do all my normal daily activities without any limitations"]],
  [["trial type", "type of trial", "types of trials", "interested in"], ["I am open to any type"]],
  [["phase"], ["I am open to any phase"]],
  [["travel", "distance", "miles", "far", "willing to go"], ["Within 100 miles"]],
  [["placebo"], ["I am comfortable with the possibility of receiving a placebo"]],
  [["correct", "change", "confirm", "look right", "accurate", "adjust"], ["Yes, that looks correct"]],
];

function findDemoAnswer(text: string): string[] | null {
  const lower = text.toLowerCase();
  for (const [keywords, answer] of DEMO_ANSWERS) {
    if (keywords.some((kw) => lower.includes(kw))) return answer;
  }
  return null;
}

export function Chat({ sessionId, onFiltersChanged, detectedLocation, zeroResults, demoRef, onLocationConfirmed, onReportReady }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
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
        // Check if the last assistant message contains a question
        setTimeout(() => {
          setMessages((prev) => {
            const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant" && m.messageType === "text");
            if (lastAssistant && lastAssistant.content.includes("?")) {
              const answer = findDemoAnswer(lastAssistant.content);
              if (answer) {
                // Auto-send text response
                const userMsg: ChatMessage = {
                  id: `user_${Date.now()}`,
                  role: "user",
                  content: answer[0],
                  messageType: "text",
                  timestamp: Date.now(),
                };
                // We need to send via websocket too
                wsRef.current?.send({ type: "message", content: answer[0] });
                setIsTyping(true);
                return [...prev, userMsg];
              }
            }
            return prev;
          });
        }, 1000);
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
              answer,
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
      setCurrentActivity("");
      // Auto-hide the activity bar after a brief delay
      setTimeout(() => setIsProcessingComplete(true), 2000);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (type === "error") {
      setIsTyping(false);
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
    if (zeroResults && !prevZeroResults.current && wsRef.current) {
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
        // Send "breast cancer" directly via websocket
        const text = "breast cancer";
        const msg: ChatMessage = {
          id: `user_${Date.now()}`,
          role: "user",
          content: text,
          messageType: "text",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        setIsTyping(true);

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
    const text = input.trim();
    if (!text || !wsRef.current) return;

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

    // First typed message is likely the condition
    messageCountRef.current++;
    if (messageCountRef.current === 1 && onFiltersChanged) {
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

      // Detect location confirmation
      if (onLocationConfirmed && question) {
        const q = question.toLowerCase();
        if ((q.includes("location") || q.includes("near") || q.includes("area") || q.includes("correct")) && detectedLocation) {
          const affirmative = selections.some((s) => s.toLowerCase().includes("yes") || s.toLowerCase().includes("correct"));
          if (affirmative) {
            onLocationConfirmed(detectedLocation.latitude, detectedLocation.longitude);
          }
        }
      }
    },
    [onFiltersChanged, onLocationConfirmed, detectedLocation]
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
      wsRef.current.send({ type: "trial_selection", trialIds });
    },
    []
  );

  return (
    <div className="flex flex-col h-full">
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

        {isTyping && !pendingIdRef.current && (
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
        isProcessing={isTyping}
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
            disabled={isTyping}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
