"use client";

import dynamic from "next/dynamic";

const StatsMapInner = dynamic(
  () => import("./StatsMapInner").then((mod) => mod.StatsMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center h-[200px]">
        <span className="text-xs text-slate-400">Loading map...</span>
      </div>
    ),
  }
);

interface Props {
  data: Record<string, number>;
  userLocation?: { latitude: number; longitude: number } | null;
}

export function StatsMap({ data, userLocation }: Props) {
  return <StatsMapInner data={data} userLocation={userLocation} />;
}
