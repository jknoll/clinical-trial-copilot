"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

function normalizeFitScore(score: number): number {
  return score > 0 && score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function createTrialIcon(fitScore: number, isSelected: boolean): L.DivIcon {
  const score = normalizeFitScore(fitScore);
  let color: string;
  if (score >= 70) {
    color = "#059669"; // emerald-600
  } else if (score >= 40) {
    color = "#d97706"; // amber-600
  } else {
    color = "#dc2626"; // red-600
  }

  const borderColor = isSelected ? "#2563eb" : "#ffffff";
  const size = isSelected ? 16 : 12;

  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

const patientIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 18px;
    height: 18px;
    background: #2563eb;
    border: 3px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px #2563eb, 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

const distanceCircles = [
  { miles: 50, color: "#2563eb", opacity: 0.08 },
  { miles: 100, color: "#2563eb", opacity: 0.05 },
  { miles: 200, color: "#2563eb", opacity: 0.03 },
];

export function TrialMapInner({ trials, patientLocation, selectedTrialIds = [] }: Props) {
  const selectedSet = useMemo(() => new Set(selectedTrialIds), [selectedTrialIds]);

  const center = useMemo<[number, number]>(() => {
    if (patientLocation) return [patientLocation.lat, patientLocation.lng];
    if (trials.length > 0) return [trials[0].latitude, trials[0].longitude];
    return [39.8283, -98.5795]; // center of US
  }, [patientLocation, trials]);

  const defaultZoom = patientLocation ? 7 : 5;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <MapContainer
        center={center}
        zoom={defaultZoom}
        scrollWheelZoom
        style={{ height: "400px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Distance circles around patient */}
        {patientLocation &&
          distanceCircles.map((circle) => (
            <Circle
              key={circle.miles}
              center={[patientLocation.lat, patientLocation.lng]}
              radius={milesToMeters(circle.miles)}
              pathOptions={{
                color: circle.color,
                fillColor: circle.color,
                fillOpacity: circle.opacity,
                weight: 1,
                opacity: 0.3,
              }}
            />
          ))}

        {/* Patient marker */}
        {patientLocation && (
          <Marker
            position={[patientLocation.lat, patientLocation.lng]}
            icon={patientIcon}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold text-blue-700">Your Location</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Trial markers */}
        {trials.map((trial) => {
          const isSelected = selectedSet.has(trial.nctId);
          return (
            <Marker
              key={trial.nctId}
              position={[trial.latitude, trial.longitude]}
              icon={createTrialIcon(trial.fitScore, isSelected)}
            >
              <Popup>
                <div className="text-sm max-w-[220px]">
                  <p className="font-semibold text-slate-900 mb-1">{trial.title}</p>
                  {trial.facility && (
                    <p className="text-xs text-slate-600 mb-1">{trial.facility}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{trial.nctId}</span>
                    {trial.distanceMiles != null && (
                      <span className="text-slate-500">
                        {Math.round(trial.distanceMiles)} mi
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-medium">
                    Fit: {normalizeFitScore(trial.fitScore)}%
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-t border-slate-100 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-600" />
          High fit
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-600" />
          Medium fit
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-600" />
          Low fit
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-600 ring-2 ring-blue-600 ring-offset-1" />
          Your location
        </div>
      </div>
    </div>
  );
}
