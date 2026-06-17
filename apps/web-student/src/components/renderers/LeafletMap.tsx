import { useEffect } from "react";
import type { ReactNode } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icons resolve relative paths that Vite
// doesn't fingerprint by default. Re-bind to public CDN URLs so the
// bundled build doesn't 404 on the marker image.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─────────────────────────────────────────────────────────────────────────
// Leaflet-backed interactive map for MAP_LOCATION (P5-S61).
//
// OpenStreetMap tiles. No API key required. Attribution surfaces
// inline per OSM's tile usage policy.
//
// `baseMap` controls the initial view + zoom:
//   india → centred on India bounding box, zoom 5
//   world → world view, zoom 2
//   custom → world view (caller would normally bring their own
//            tile layer; v1 falls back to OSM)
// ─────────────────────────────────────────────────────────────────────────

interface LeafletMapProps {
  baseMap: "india" | "world" | "custom";
  value: { click_lat: number; click_lng: number } | null;
  onChange: (v: { click_lat: number; click_lng: number } | null) => void;
  disabled?: boolean;
}

interface ViewConfig {
  center: [number, number];
  zoom: number;
  minZoom: number;
}

const VIEWS: Record<string, ViewConfig> = {
  india: { center: [22.0, 79.0], zoom: 5, minZoom: 4 },
  world: { center: [20.0, 0.0], zoom: 2, minZoom: 2 },
  custom: { center: [0.0, 0.0], zoom: 2, minZoom: 2 },
};

function ClickCapture({
  onChange,
  disabled,
}: {
  onChange: LeafletMapProps["onChange"];
  disabled?: boolean;
}): null {
  useMapEvents({
    click(evt) {
      if (disabled) return;
      onChange({
        click_lat: Math.round(evt.latlng.lat * 10000) / 10000,
        click_lng: Math.round(evt.latlng.lng * 10000) / 10000,
      });
    },
  });
  return null;
}

export function LeafletMap({
  baseMap,
  value,
  onChange,
  disabled,
}: LeafletMapProps): ReactNode {
  const view = VIEWS[baseMap] ?? VIEWS.india;

  // Re-render the map when the base_map changes — Leaflet's
  // MapContainer is uncontrolled by default; key forces remount.
  useEffect(() => {
    // No-op; the key prop on MapContainer handles remount.
  }, [baseMap]);

  return (
    <div
      style={{
        width: "100%",
        height: 480,
        border: "1px solid var(--rule, #e1e5ee)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <MapContainer
        key={baseMap}
        center={view.center}
        zoom={view.zoom}
        minZoom={view.minZoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom
      >
        {/* Label-free basemap (CARTO Positron "no labels"): place names
            are intentionally hidden so a MAP_LOCATION question can't be
            answered by simply reading the city name off the tile. Free,
            no API key. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <ClickCapture onChange={onChange} disabled={disabled} />
        {value && (
          <Marker
            position={[value.click_lat, value.click_lng]}
            interactive={false}
          />
        )}
      </MapContainer>
    </div>
  );
}