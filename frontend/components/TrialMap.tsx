"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

interface TrialLocation {
  nctId: string;
  title: string;
  facility?: string;
  latitude: number;
  longitude: number;
  fitScore: number;
  distanceMiles?: number | null;
}

interface PatientLocation {
  lat: number;
  lng: number;
}

interface Props {
  trials: TrialLocation[];
  patientLocation?: PatientLocation;
  selectedTrialIds?: string[];
}

const TrialMapInner = dynamic(() => import("./TrialMapInner").then((mod) => mod.TrialMapInner), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-slate-200 bg-white flex items-center justify-center h-[400px]">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading map...
      </div>
    </div>
  ),
});

export function TrialMap({ trials, patientLocation, selectedTrialIds }: Props) {
  return (
    <TrialMapInner
      trials={trials}
      patientLocation={patientLocation}
      selectedTrialIds={selectedTrialIds}
    />
  );
}
