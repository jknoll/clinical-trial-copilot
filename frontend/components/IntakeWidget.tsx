"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";

interface Option {
  label: string;
  value: string;
  description?: string;
}

interface Props {
  question: string;
  questionId: string;
  widgetType: "single_select" | "multi_select";
  options: Option[];
  onSubmit: (questionId: string, selections: string[], question?: string) => void;
}

export function IntakeWidget({ question, questionId, widgetType, options, onSubmit }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const toggle = (value: string) => {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (widgetType === "single_select") {
        next.clear();
        next.add(value);
      } else {
        if (next.has(value)) next.delete(value);
        else next.add(value);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0) return;
    setSubmitted(true);
    const selections = options
      .filter((o) => selected.has(o.value))
      .map((o) => o.label);
    onSubmit(questionId, selections, question);
  };

  // For single select, auto-submit on selection
  const handleSelect = (value: string) => {
    if (submitted) return;
    if (widgetType === "single_select") {
      setSelected(new Set([value]));
      setSubmitted(true);
      const opt = options.find((o) => o.value === value);
      if (opt) onSubmit(questionId, [opt.label], question);
    } else {
      toggle(value);
    }
  };

  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-white/90 backdrop-blur-sm p-4", submitted && "opacity-75")}>
      <p className="font-medium text-slate-800 mb-3">{question}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            disabled={submitted}
            className={clsx(
              "w-full text-left rounded-lg border-2 px-4 py-3 transition-all",
              selected.has(option.value)
                ? "border-blue-500 bg-blue-50 scale-[1.01]"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:-translate-y-0.5",
              submitted && "cursor-default"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm text-slate-800">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
                )}
              </div>
              {selected.has(option.value) && (
                <Check className="w-5 h-5 text-blue-600 shrink-0" />
              )}
            </div>
          </button>
        ))}
      </div>

      {widgetType === "multi_select" && !submitted && (
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="mt-3 w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Continue ({selected.size} selected)
        </button>
      )}

      {submitted && (
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
          <Check className="w-3 h-3" /> Submitted
        </div>
      )}
    </div>
  );
}
