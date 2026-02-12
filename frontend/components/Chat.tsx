"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { WSClient } from "@/lib/websocket";
import { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

import { FacetedFilters, ActiveFilter } from "@/lib/types";

interface Props {
  sessionId: string;
  onFiltersChanged?: (filters: Partial<FacetedFilters>, display: ActiveFilter[]) => void;
}

export function Chat({ sessionId, onFiltersChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef<WSClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTextRef = useRef<string>("");
  const pendingIdRef = useRef<string>("");

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
      const msg: ChatMessage = {
        id: `status_${Date.now()}`,
        role: "system",
        content: data.message as string,
        messageType: "status",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
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
    } else if (type === "done") {
      setIsTyping(false);
      // Refocus input so user can immediately type
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

  const messageCountRef = useRef(0);

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
    wsRef.current.send({ type: "message", content: text });
    inputRef.current?.focus();

    // First typed message is likely the condition
    messageCountRef.current++;
    if (messageCountRef.current === 1 && onFiltersChanged) {
      onFiltersChanged({ condition: text }, [{ key: "condition", label: "Condition", value: text }]);
    }
  }, [input, onFiltersChanged]);

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

        if (q.includes("condition") || q.includes("diagnosis") || q.includes("looking for")) {
          onFiltersChanged({ condition: val }, [{ key: "condition", label: "Condition", value: val }]);
        } else if (q.includes("age") || q.includes("old")) {
          const ageMatch = val.match(/(\d+)/);
          if (ageMatch) {
            const age = parseInt(ageMatch[1]);
            onFiltersChanged({ age }, [{ key: "age", label: "Age", value: String(age) }]);
          }
        } else if (q.includes("sex") || q.includes("gender") || q.includes("biological")) {
          onFiltersChanged({ sex: selections[0] }, [{ key: "sex", label: "Sex", value: selections[0] }]);
        } else if (q.includes("phase")) {
          // Phases don't directly map to stats filters but we show them
          onFiltersChanged({}, [{ key: "phases", label: "Phases", value: val }]);
        } else if (q.includes("status") || q.includes("recruiting")) {
          onFiltersChanged({ statuses: selections }, [{ key: "statuses", label: "Status", value: val }]);
        }
      }
    },
    [onFiltersChanged]
  );

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
