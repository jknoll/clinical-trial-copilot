"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TrialCard } from "./TrialCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Trial {
  nctId: string;
  briefTitle: string;
  phase: string;
  overallStatus: string;
  fitScore: number;
  fitSummary: string;
  nearestDistanceMiles: number | null;
  interventions: string[];
  sponsor: string;
  latitude?: number;
  longitude?: number;
}

interface Props {
  trials: Trial[];
  onSelect: (selectedTrialIds: string[]) => void;
}

export function TrialCarousel({ trials, onSelect }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = [...trials].sort((a, b) => b.fitScore - a.fitScore);

  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, sorted.length - 1));
      setCurrentIndex(clamped);
      const container = scrollRef.current;
      if (container) {
        const slideWidth = container.offsetWidth;
        container.scrollTo({ left: slideWidth * clamped, behavior: "smooth" });
      }
    },
    [sorted.length]
  );

  const scrollPrev = useCallback(() => scrollToIndex(currentIndex - 1), [currentIndex, scrollToIndex]);
  const scrollNext = useCallback(() => scrollToIndex(currentIndex + 1), [currentIndex, scrollToIndex]);

  // Sync currentIndex when user scrolls manually (touch/trackpad)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (container.offsetWidth > 0) {
          const idx = Math.round(container.scrollLeft / container.offsetWidth);
          setCurrentIndex(Math.max(0, Math.min(idx, sorted.length - 1)));
        }
        ticking = false;
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [sorted.length]);

  const toggle = (nctId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nctId)) next.delete(nctId);
      else next.add(nctId);
      return next;
    });
  };

  const canScrollPrev = currentIndex > 0;
  const canScrollNext = currentIndex < sorted.length - 1;

  return (
    <div className="rounded-xl border-2 border-slate-300 bg-white overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-800">Select Trials for Analysis</h2>
          <span className="text-xs text-slate-500">
            ({selected.size} selected)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={scrollPrev}
            disabled={!canScrollPrev}
            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm"
            aria-label="Previous trial"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={scrollNext}
            disabled={!canScrollNext}
            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm"
            aria-label="Next trial"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {sorted.map((trial) => (
          <div key={trial.nctId} className="flex-[0_0_100%] min-w-0 snap-start p-4">
            <TrialCard
              nctId={trial.nctId}
              briefTitle={trial.briefTitle}
              phase={trial.phase}
              overallStatus={trial.overallStatus}
              fitScore={trial.fitScore}
              fitSummary={trial.fitSummary}
              nearestDistanceMiles={trial.nearestDistanceMiles}
              interventions={trial.interventions}
              sponsor={trial.sponsor}
              latitude={trial.latitude}
              longitude={trial.longitude}
              selectable={true}
              selected={selected.has(trial.nctId)}
              onToggle={() => toggle(trial.nctId)}
            />
          </div>
        ))}
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5 pb-3">
        {sorted.map((_, idx) => (
          <button
            key={idx}
            onClick={() => scrollToIndex(idx)}
            className={`w-2 h-2 rounded-full transition-colors ${
              idx === currentIndex ? "bg-blue-600" : "bg-slate-300"
            }`}
            aria-label={`Go to trial ${idx + 1}`}
          />
        ))}
      </div>

      {/* Action footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <button
          onClick={() => onSelect(Array.from(selected))}
          disabled={selected.size === 0}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {selected.size === 0
            ? "Select trials to analyze"
            : `Analyze ${selected.size} Selected Trial${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
