"use client";

import { useMemo, useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, CircleMarker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";

// State FIPS code → state name lookup
const FIPS_TO_STATE: Record<string, string> = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas",
  "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware",
  "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
  "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa",
  "20": "Kansas", "21": "Kentucky", "22": "Louisiana", "23": "Maine",
  "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota",
  "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska",
  "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico",
  "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio",
  "40": "Oklahoma", "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island",
  "45": "South Carolina", "46": "South Dakota", "47": "Tennessee", "48": "Texas",
  "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
  "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
  "72": "Puerto Rico",
};

// Module-level cache for states GeoJSON
let cachedStates: FeatureCollection | null = null;
let fetchPromise: Promise<FeatureCollection | null> | null = null;

async function loadStates(): Promise<FeatureCollection | null> {
  if (cachedStates) return cachedStates;
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/counties-10m.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    })
    .then((topo: Topology) => {
      const fc = topojson.feature(topo, topo.objects.states as GeometryCollection) as FeatureCollection;
      cachedStates = fc;
      return fc;
    })
    .catch((err) => {
      console.error("Failed to load states TopoJSON:", err);
      fetchPromise = null;
      return null;
    });
  return fetchPromise;
}

// Blue gradient color scale (design system)
const CHOROPLETH_COLORS = [
  "#dbeafe", // blue-100
  "#bfdbfe", // blue-200
  "#93c5fd", // blue-300
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
];
const ZERO_COLOR = "#f1f5f9"; // slate-100

function getColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return ZERO_COLOR;
  const ratio = Math.log(count + 1) / Math.log(maxCount + 1);
  const idx = Math.min(Math.floor(ratio * CHOROPLETH_COLORS.length), CHOROPLETH_COLORS.length - 1);
  return CHOROPLETH_COLORS[idx];
}

// Pulsing user location icon
const userLocationIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 12px; height: 12px;
    background: #ef4444;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 0 rgba(239,68,68,0.4);
    animation: user-pulse 2s ease-out infinite;
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

interface Props {
  data: Record<string, number>;
  userLocation?: { latitude: number; longitude: number } | null;
  flyTo?: { lat: number; lon: number } | null;
  travelDistance?: number | null;
}

// Continental US bounds
const US_BOUNDS: L.LatLngBoundsExpression = [[24.0, -125.5], [50.0, -66.0]];

function FitUS() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(US_BOUNDS, { padding: [5, 5] });
  }, [map]);
  return null;
}

function MapFlyTo({ target }: { target: { lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 6, { duration: 1.5 });
  }, [target, map]);
  return null;
}

function fipsToState(fips: string): string {
  // State FIPS are 2-digit, zero-padded
  return FIPS_TO_STATE[fips.padStart(2, "0")] ?? "";
}

function createStyleFn(data: Record<string, number>, maxCount: number) {
  return (feature: Feature | undefined) => {
    if (!feature) return {};
    const fips = String(feature.id ?? "");
    const stateName = fipsToState(fips);
    const count = data[stateName] ?? 0;
    return {
      fillColor: getColor(count, maxCount),
      weight: 0.8,
      color: "#94a3b8",
      fillOpacity: 0.75,
    };
  };
}

function createOnEachFeature(data: Record<string, number>, maxCount: number) {
  return (feature: Feature, layer: L.Layer) => {
    const fips = String(feature.id ?? "");
    const stateName = fipsToState(fips);
    const count = data[stateName] ?? 0;

    layer.bindTooltip(
      `<div style="font-size:12px;font-weight:600">${stateName}</div><div style="font-size:11px;color:#64748b">${count.toLocaleString()} trials</div>`,
      { sticky: true, direction: "top", offset: [0, -10] }
    );

    layer.on({
      mouseover: () => {
        (layer as L.Path).setStyle({ weight: 2, color: "#1e40af", fillOpacity: 0.9 });
        (layer as L.Path).bringToFront();
      },
      mouseout: () => {
        (layer as L.Path).setStyle({
          weight: 0.8,
          color: "#94a3b8",
          fillOpacity: 0.75,
          fillColor: getColor(count, maxCount),
        });
      },
    });
  };
}

// Fallback state centroids if TopoJSON fails to load
const STATE_COORDS: Record<string, [number, number]> = {
  "Alabama": [32.806671, -86.791130], "Alaska": [61.370716, -152.404419],
  "Arizona": [33.729759, -111.431221], "Arkansas": [34.969704, -92.373123],
  "California": [36.116203, -119.681564], "Colorado": [39.059811, -105.311104],
  "Connecticut": [41.597782, -72.755371], "Delaware": [39.318523, -75.507141],
  "District of Columbia": [38.897438, -77.026817], "Florida": [27.766279, -81.686783],
  "Georgia": [33.040619, -83.643074], "Hawaii": [21.094318, -157.498337],
  "Idaho": [44.240459, -114.478828], "Illinois": [40.349457, -88.986137],
  "Indiana": [39.849426, -86.258278], "Iowa": [42.011539, -93.210526],
  "Kansas": [38.526600, -96.726486], "Kentucky": [37.668140, -84.670067],
  "Louisiana": [31.169546, -91.867805], "Maine": [44.693947, -69.381927],
  "Maryland": [39.063946, -76.802101], "Massachusetts": [42.230171, -71.530106],
  "Michigan": [43.326618, -84.536095], "Minnesota": [45.694454, -93.900192],
  "Mississippi": [32.741646, -89.678696], "Missouri": [38.456085, -92.288368],
  "Montana": [46.921925, -110.454353], "Nebraska": [41.125370, -98.268082],
  "Nevada": [38.313515, -117.055374], "New Hampshire": [43.452492, -71.563896],
  "New Jersey": [40.298904, -74.521011], "New Mexico": [34.840515, -106.248482],
  "New York": [42.165726, -74.948051], "North Carolina": [35.630066, -79.806419],
  "North Dakota": [47.528912, -99.784012], "Ohio": [40.388783, -82.764915],
  "Oklahoma": [35.565342, -96.928917], "Oregon": [44.572021, -122.070938],
  "Pennsylvania": [40.590752, -77.209755], "Rhode Island": [41.680893, -71.511780],
  "South Carolina": [33.856892, -80.945007], "South Dakota": [44.299782, -99.438828],
  "Tennessee": [35.747845, -86.692345], "Texas": [31.054487, -97.563461],
  "Utah": [40.150032, -111.862434], "Vermont": [44.045876, -72.710686],
  "Virginia": [37.769337, -78.169968], "Washington": [47.400902, -121.490494],
  "West Virginia": [38.491226, -80.954453], "Wisconsin": [44.268543, -89.616508],
  "Wyoming": [42.755966, -107.302490],
};

export function StatsMapInner({ data, userLocation, flyTo, travelDistance }: Props) {
  const [states, setStates] = useState<FeatureCollection | null>(cachedStates);

  useEffect(() => {
    if (!states) {
      loadStates().then((d) => { if (d) setStates(d); });
    }
  }, [states]);

  const maxCount = useMemo(() => {
    const vals = Object.values(data);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [data]);

  const dataKey = useMemo(() => {
    const vals = Object.values(data);
    return `${vals.length}-${vals.reduce((a, b) => a + b, 0)}`;
  }, [data]);

  const styleFn = useMemo(() => createStyleFn(data, maxCount), [data, maxCount]);
  const onEachFeature = useMemo(() => createOnEachFeature(data, maxCount), [data, maxCount]);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        scrollWheelZoom={true}
        style={{ height: "280px", width: "100%" }}
        zoomControl={true}
        attributionControl={false}
      >
        <FitUS />
        <MapFlyTo target={flyTo ?? null} />
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />

        {states && (
          <GeoJSON key={dataKey} data={states} style={styleFn} onEachFeature={onEachFeature} />
        )}

        {!states && (
          <>
            {Object.entries(data)
              .filter(([state]) => STATE_COORDS[state])
              .sort(([, a], [, b]) => b - a)
              .map(([state, count]) => {
                const radius = 5 + (count / maxCount) * 20;
                return (
                  <CircleMarker key={state} center={STATE_COORDS[state]} radius={radius}
                    pathOptions={{ fillColor: "#2563eb", fillOpacity: 0.5, color: "#1e40af", weight: 1 }}>
                    <Tooltip direction="top" offset={[0, -5]}>
                      <span className="text-xs font-medium">{state}: {count.toLocaleString()} trials</span>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
          </>
        )}

        {userLocation && (
          <Marker
            position={[userLocation.latitude, userLocation.longitude]}
            icon={userLocationIcon}
            zIndexOffset={1000}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="text-xs font-medium">Your Location</span>
            </Tooltip>
          </Marker>
        )}

        {userLocation && travelDistance && (
          <Circle
            center={[userLocation.latitude, userLocation.longitude]}
            radius={travelDistance * 1609.34}
            pathOptions={{
              color: "#2563eb",
              fillColor: "#dbeafe",
              fillOpacity: 0.15,
              weight: 1.5,
              dashArray: "6 4",
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
