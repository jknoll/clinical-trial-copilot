"use client";

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature } from "geojson";
import "leaflet/dist/leaflet.css";

// Fix GeoJSON polygons that cross the antimeridian (±180° longitude).
// Leaflet draws from lon 170→-170 the "long way" (340°) instead of the
// short way (20°), creating horizontal band artifacts.  Unwrapping makes
// coordinates continuous (e.g. 170→190) so the path stays short.
function fixAntimeridian(fc: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") return f;

      const polys: number[][][][] =
        g.type === "Polygon" ? [g.coordinates] : g.coordinates;

      // Quick check: does any ring cross the antimeridian?
      let crosses = false;
      outer: for (const poly of polys) {
        for (const ring of poly) {
          for (let i = 1; i < ring.length; i++) {
            if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) {
              crosses = true;
              break outer;
            }
          }
        }
      }
      if (!crosses) return f;

      // Unwrap each ring so longitudes are continuous
      const fixed = polys.map((poly) =>
        poly.map((ring) => {
          let offset = 0;
          return ring.map((coord, i) => {
            if (i > 0) {
              const delta = coord[0] - ring[i - 1][0];
              if (delta > 180) offset -= 360;
              else if (delta < -180) offset += 360;
            }
            return [coord[0] + offset, coord[1]];
          });
        }),
      );

      return {
        ...f,
        geometry:
          g.type === "Polygon"
            ? { type: "Polygon" as const, coordinates: fixed[0] }
            : { type: "MultiPolygon" as const, coordinates: fixed },
      } as Feature;
    }),
  };
}

// AACT country name → Natural Earth country name
const COUNTRY_NAME_MAP: Record<string, string> = {
  "United States": "United States of America",
  "Korea, Republic of": "South Korea",
  "Russian Federation": "Russia",
  "Taiwan": "Taiwan",
  "Czechia": "Czech Republic",
  "Côte D'Ivoire": "Ivory Coast",
  "Congo, The Democratic Republic of the": "Dem. Rep. Congo",
  "Tanzania, United Republic of": "United Republic of Tanzania",
  "Viet Nam": "Vietnam",
  "Iran, Islamic Republic of": "Iran",
  "Moldova, Republic of": "Moldova",
  "Syrian Arab Republic": "Syria",
  "Lao People's Democratic Republic": "Laos",
  "Bolivia, Plurinational State of": "Bolivia",
  "Venezuela, Bolivarian Republic of": "Venezuela",
  "Palestine, State of": "Palestine",
  "North Macedonia": "Macedonia",
  "Brunei Darussalam": "Brunei",
  "Eswatini": "eSwatini",
};

// Reverse lookup: Natural Earth name → AACT name
const REVERSE_NAME_MAP: Record<string, string> = {};
for (const [aact, ne] of Object.entries(COUNTRY_NAME_MAP)) {
  REVERSE_NAME_MAP[ne] = aact;
}

// Module-level cache for countries GeoJSON
let cachedCountries: FeatureCollection | null = null;
let fetchPromise: Promise<FeatureCollection | null> | null = null;

async function loadCountries(): Promise<FeatureCollection | null> {
  if (cachedCountries) return cachedCountries;
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/countries-110m.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    })
    .then((topo: Topology) => {
      const raw = topojson.feature(topo, topo.objects.countries as GeometryCollection) as FeatureCollection;
      const fc = fixAntimeridian(raw);
      cachedCountries = fc;
      return fc;
    })
    .catch((err) => {
      console.error("Failed to load countries TopoJSON:", err);
      fetchPromise = null;
      return null;
    });
  return fetchPromise;
}

// Module-level cache for US states GeoJSON
let cachedStates: FeatureCollection | null = null;
let statesFetchPromise: Promise<FeatureCollection | null> | null = null;

async function loadStates(): Promise<FeatureCollection | null> {
  if (cachedStates) return cachedStates;
  if (statesFetchPromise) return statesFetchPromise;
  statesFetchPromise = fetch("/counties-10m.json")
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
      console.error("Failed to load US states TopoJSON:", err);
      statesFetchPromise = null;
      return null;
    });
  return statesFetchPromise;
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

// FIPS code → state name for US TopoJSON matching
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
  "60": "American Samoa", "66": "Guam", "69": "Northern Mariana Islands",
  "72": "Puerto Rico", "78": "Virgin Islands",
};

function fipsToState(fipsId: string): string {
  // TopoJSON counties-10m uses numeric string IDs; first 2 digits = state FIPS
  const code = fipsId.padStart(2, "0");
  return FIPS_TO_STATE[code] || "";
}

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

function getCountryCount(data: Record<string, number>, countryName: string): number {
  // Try direct match first
  if (data[countryName] != null) return data[countryName];
  // Try reverse mapping (Natural Earth → AACT)
  const aactName = REVERSE_NAME_MAP[countryName];
  if (aactName && data[aactName] != null) return data[aactName];
  return 0;
}

function getStateCount(data: Record<string, number>, stateName: string): number {
  if (data[stateName] != null) return data[stateName];
  return 0;
}

interface Props {
  data: Record<string, number>;
  stateData?: Record<string, number>;
  userLocation?: { latitude: number; longitude: number } | null;
  flyTo?: { lat: number; lon: number } | null;
  travelDistance?: number | null;
}

function MapFlyTo({ target }: { target: { lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 4, { duration: 1.5 });
  }, [target, map]);
  return null;
}

// Center map on user's detected location while keeping world zoom level.
// Uses setView (instant) on first center so tiles load for the right area
// from the start, then flyTo for subsequent location changes.
function MapCenterOnUser({ location, mode }: { location: { latitude: number; longitude: number } | null; mode: string }) {
  const map = useMap();
  const hasCentered = useRef(false);
  useEffect(() => {
    if (location && mode === "countries" && !hasCentered.current) {
      hasCentered.current = true;
      map.setView([location.latitude, location.longitude], 2, { animate: false });
    }
  }, [location, mode, map]);
  return null;
}


function createStyleFn(data: Record<string, number>, maxCount: number) {
  return (feature: Feature | undefined) => {
    if (!feature) return {};
    const countryName = feature.properties?.name ?? "";
    const count = getCountryCount(data, countryName);
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
    const countryName = feature.properties?.name ?? "";
    const count = getCountryCount(data, countryName);

    layer.bindTooltip(
      `<div style="font-size:12px;font-weight:600">${countryName}</div><div style="font-size:11px;color:#64748b">${count.toLocaleString()} trials</div>`,
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

function createStateStyleFn(data: Record<string, number>, maxCount: number) {
  return (feature: Feature | undefined) => {
    if (!feature) return {};
    const stateName = FIPS_TO_STATE[String(feature.id).padStart(2, "0")] ?? "";
    const count = getStateCount(data, stateName);
    return {
      fillColor: getColor(count, maxCount),
      weight: 0.8,
      color: "#94a3b8",
      fillOpacity: 0.75,
    };
  };
}

function createStateOnEachFeature(data: Record<string, number>, maxCount: number) {
  return (feature: Feature, layer: L.Layer) => {
    const stateName = FIPS_TO_STATE[String(feature.id).padStart(2, "0")] ?? "";
    const count = getStateCount(data, stateName);

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

export function StatsMapInner({ data, stateData, userLocation, flyTo, travelDistance }: Props) {
  const [countries, setCountries] = useState<FeatureCollection | null>(cachedCountries);
  const [states, setStates] = useState<FeatureCollection | null>(cachedStates);

  // Show state-level data once we know the user's location (finest grain)
  // TODO: Multi-country region queries needed for cross-border radius
  const mode = userLocation ? "states" : "countries";

  useEffect(() => {
    if (!countries) {
      loadCountries().then((d) => { if (d) setCountries(d); });
    }
  }, [countries]);

  useEffect(() => {
    if (mode === "states" && !states) {
      loadStates().then((d) => { if (d) setStates(d); });
    }
  }, [mode, states]);

  const activeData = mode === "states" && stateData ? stateData : data;

  const maxCount = useMemo(() => {
    const vals = Object.values(activeData);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [activeData]);

  const dataKey = useMemo(() => {
    const vals = Object.values(activeData);
    return `${mode}-${vals.length}-${vals.reduce((a, b) => a + b, 0)}`;
  }, [activeData, mode]);

  const styleFn = useMemo(
    () => mode === "states" && stateData
      ? createStateStyleFn(stateData, maxCount)
      : createStyleFn(data, maxCount),
    [mode, data, stateData, maxCount]
  );
  const onEachFeature = useMemo(
    () => mode === "states" && stateData
      ? createStateOnEachFeature(stateData, maxCount)
      : createOnEachFeature(data, maxCount),
    [mode, data, stateData, maxCount]
  );

  const geoData = mode === "states" ? states : countries;
  const center: [number, number] = mode === "states" ? [39, -96] : [20, 0];
  const zoom = mode === "states" ? 4 : 2;

  // Hide map until both GeoJSON and tiles have fully rendered
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const handleTilesLoaded = useCallback(() => setTilesLoaded(true), []);
  const mapReady = !!geoData && tilesLoaded;

  // Use user location as initial center so tiles load for the right area
  const initialCenter: [number, number] = useMemo(() => {
    if (mode === "states") return [39, -96];
    if (userLocation) return [userLocation.latitude, userLocation.longitude];
    return [20, 0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]); // Only compute once per mode (userLocation at mount time)

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden" style={{
      visibility: mapReady ? "visible" : "hidden",
      height: "380px",
    }}>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: "380px", width: "100%" }}
        zoomControl={true}
        attributionControl={false}
        minZoom={2}
        maxZoom={8}
      >
        <MapFlyTo target={flyTo ?? null} />
        <MapCenterOnUser location={userLocation ?? null} mode={mode} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          eventHandlers={{ load: handleTilesLoaded }}
        />

        {geoData && (
          <GeoJSON key={dataKey} data={geoData} style={styleFn} onEachFeature={onEachFeature} />
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
