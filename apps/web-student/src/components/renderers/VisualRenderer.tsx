import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Renderer } from "./types";
import { LeafletMap } from "./LeafletMap";

// ─────────────────────────────────────────────────────────────────────────
// Visual & Spatial family renderers (P5-S59).
//
// Covers: DIAGRAM_HOTSPOT · DIAGRAM_LABEL · MAP_LOCATION ·
//          PICTORIAL_IDENTIFY
// ─────────────────────────────────────────────────────────────────────────

interface ImagePayload {
  stem: string;
  image_media_id: string;
  explanation?: string;
}

export interface DiagramHotspotPayload extends ImagePayload {
  hotspots?: { id: string; label: string }[]; // labels only — shapes hidden from student
}

export interface DiagramHotspotResponse {
  click_x: number;
  click_y: number;
}

export const DiagramHotspotRenderer: Renderer<
  DiagramHotspotPayload,
  DiagramHotspotResponse
> = ({ payload, value, onChange, disabled }): ReactNode => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  function handleClick(evt: React.MouseEvent<HTMLImageElement>) {
    if (disabled) return;
    if (!imgRef.current || !naturalSize) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((evt.clientX - rect.left) / rect.width) * naturalSize.w);
    const y = Math.round(((evt.clientY - rect.top) / rect.height) * naturalSize.h);
    onChange({ click_x: x, click_y: y });
  }

  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        <img
          ref={imgRef}
          src={resolveMediaUrl(payload.image_media_id)}
          alt="diagram"
          onClick={handleClick}
          onLoad={() => {
            if (imgRef.current) {
              setNaturalSize({
                w: imgRef.current.naturalWidth,
                h: imgRef.current.naturalHeight,
              });
            }
          }}
          style={{
            maxWidth: "100%",
            maxHeight: 600,
            cursor: disabled ? "not-allowed" : "crosshair",
            border: "1px solid var(--border, #e1e5ee)",
            borderRadius: 6,
          }}
        />
        {value && imgRef.current && naturalSize && (
          <div
            style={{
              position: "absolute",
              left: `${(value.click_x / naturalSize.w) * 100}%`,
              top: `${(value.click_y / naturalSize.h) * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--color-amber, #f59e0b)",
              border: "3px solid white",
              boxShadow: "0 0 0 2px var(--color-amber, #f59e0b)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {value && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Clicked at ({value.click_x}, {value.click_y})
        </div>
      )}
    </div>
  );
};

export interface DiagramLabelPayload extends ImagePayload {
  markers: { id: string; x: number; y: number }[];
  labels: { id: string; text: string }[];
}

export interface DiagramLabelResponse {
  pairs: { marker_id: string; label_id: string }[];
}

export const DiagramLabelRenderer: Renderer<
  DiagramLabelPayload,
  DiagramLabelResponse
> = ({ payload, value, onChange, disabled }): ReactNode => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const pairMap = new Map<string, string>(
    (value?.pairs ?? []).map((p) => [p.marker_id, p.label_id]),
  );
  function setPair(markerId: string, labelId: string) {
    const next = new Map(pairMap);
    if (labelId === "") next.delete(markerId);
    else next.set(markerId, labelId);
    onChange({
      pairs: Array.from(next.entries()).map(([marker_id, label_id]) => ({
        marker_id,
        label_id,
      })),
    });
  }

  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
        <img
          ref={imgRef}
          src={resolveMediaUrl(payload.image_media_id)}
          alt="diagram"
          onLoad={() => {
            if (imgRef.current) {
              setNaturalSize({
                w: imgRef.current.naturalWidth,
                h: imgRef.current.naturalHeight,
              });
            }
          }}
          style={{
            maxWidth: "100%",
            maxHeight: 500,
            border: "1px solid var(--border, #e1e5ee)",
            borderRadius: 6,
          }}
        />
        {naturalSize &&
          payload.markers.map((m) => (
            <div
              key={m.id}
              style={{
                position: "absolute",
                left: `${(m.x / naturalSize.w) * 100}%`,
                top: `${(m.y / naturalSize.h) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--color-amber, #f59e0b)",
                color: "white",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid white",
              }}
            >
              {m.id}
            </div>
          ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border, #e1e5ee)" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Marker</th>
            <th style={{ textAlign: "left", padding: 8 }}>Label</th>
          </tr>
        </thead>
        <tbody>
          {payload.markers.map((m) => (
            <tr key={m.id}>
              <td style={{ padding: 8 }}>
                <strong>{m.id}</strong>
              </td>
              <td style={{ padding: 8 }}>
                <select
                  value={pairMap.get(m.id) ?? ""}
                  onChange={(e) => setPair(m.id, e.target.value)}
                  disabled={disabled}
                  style={{
                    padding: 6,
                    border: "1px solid var(--border, #e1e5ee)",
                    borderRadius: 4,
                    minWidth: 200,
                  }}
                >
                  <option value="">— pick label —</option>
                  {payload.labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.text}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export interface MapLocationPayload {
  stem: string;
  base_map: "india" | "world" | "custom";
  custom_map_media_id?: string | null;
  explanation?: string;
}

export interface MapLocationResponse {
  click_lat: number;
  click_lng: number;
}

export const MapLocationRenderer: Renderer<MapLocationPayload, MapLocationResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  // P5-S61 — Leaflet-backed interactive map. Tiles via OpenStreetMap
  // (no API key, free for production traffic; attribution surfaces
  // inline per OSM policy). Click anywhere → emits lat/lng with full
  // precision. Initial view + bounds derived from base_map.
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <LeafletMap
        baseMap={payload.base_map}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {value && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          Clicked at lat {value.click_lat.toFixed(4)}, lng{" "}
          {value.click_lng.toFixed(4)}
        </div>
      )}
    </div>
  );
};

export interface PictorialIdentifyPayload extends ImagePayload {
  options: { id: string; text: string }[];
}

export interface PictorialIdentifyResponse {
  selected_id: string;
}

export const PictorialIdentifyRenderer: Renderer<
  PictorialIdentifyPayload,
  PictorialIdentifyResponse
> = ({ payload, value, onChange, disabled }): ReactNode => {
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ marginBottom: 16 }}>
        <img
          src={resolveMediaUrl(payload.image_media_id)}
          alt="identify"
          style={{
            maxWidth: "100%",
            maxHeight: 400,
            border: "1px solid var(--border, #e1e5ee)",
            borderRadius: 6,
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payload.options.map((opt) => {
          const selected = value?.selected_id === opt.id;
          return (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: selected
                  ? "2px solid var(--color-blue, #4f87f6)"
                  : "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
                cursor: disabled ? "not-allowed" : "pointer",
                background: selected ? "var(--color-blue-bg, #dbeafe)" : "white",
              }}
            >
              <input
                type="radio"
                name="pictorial"
                value={opt.id}
                checked={selected}
                onChange={() => onChange({ selected_id: opt.id })}
                disabled={disabled}
              />
              <span style={{ fontWeight: 600, opacity: 0.7 }}>{opt.id}.</span>
              <span style={{ flex: 1 }}>{opt.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// ── helpers ─────────────────────────────────────────────────────────────────

function resolveMediaUrl(mediaId: string): string {
  // Content service exposes /content/media/{id}/file. v1 stub —
  // the resolver will route through CDN once content_media (S37)
  // ships with S3 + CDN.
  return `/api/v1/content/media/${encodeURIComponent(mediaId)}/file`;
}

