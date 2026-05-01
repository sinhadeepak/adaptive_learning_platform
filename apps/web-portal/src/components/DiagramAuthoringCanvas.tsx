import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// CE-208 — shared Diagram Authoring Canvas.
//
// Single React component used by HOTSPOT / LABEL / MAP_LOCATION (and
// PICTORIAL_IDENTIFY for image upload only) authoring. Per Cat §4.6
// + UserStory CE-208:
//
//   • image upload (4 MB max; PNG/JPG/SVG)
//   • toolbar: select | circle | rect | polygon | marker
//   • click-and-drag draws shapes
//   • polygon: click to add vertex, double-click to close
//   • selected shape moveable / resizeable / deletable
//   • coords persisted in image-pixel space, viewport-zoom-independent
//   • preview mode hides overlays
//
// Coordinate model: every shape's coordinates are stored in the
// **natural image** pixel space (not viewport pixels). The canvas
// computes the scale at render time and re-projects on click/drag so
// device pixel ratio + zoom don't corrupt persisted coords.
// ─────────────────────────────────────────────────────────────────────────

export type ShapeKind = "circle" | "rect" | "polygon";

export interface CircleShape {
  kind: "circle";
  id: string;
  cx: number;
  cy: number;
  r: number;
  tolerance_px?: number;
}

export interface RectShape {
  kind: "rect";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tolerance_px?: number;
}

export interface PolygonShape {
  kind: "polygon";
  id: string;
  points: Array<[number, number]>;
  tolerance_px?: number;
}

export interface Marker {
  id: string;
  x: number;
  y: number;
}

export type Shape = CircleShape | RectShape | PolygonShape;

type Tool = "select" | ShapeKind | "marker";

interface DiagramAuthoringCanvasProps {
  imageUrl?: string;
  onImageUpload?: (file: File) => void;
  shapes?: Shape[];
  markers?: Marker[];
  onShapesChange?: (shapes: Shape[]) => void;
  onMarkersChange?: (markers: Marker[]) => void;
  preview?: boolean;
  width?: number;
  height?: number;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function nextId(prefix: string, taken: Set<string>): string {
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

export function DiagramAuthoringCanvas({
  imageUrl,
  onImageUpload,
  shapes = [],
  markers = [],
  onShapesChange,
  onMarkersChange,
  preview = false,
  width = 800,
  height = 600,
}: DiagramAuthoringCanvasProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [polygonInProgress, setPolygonInProgress] =
    useState<Array<[number, number]> | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  useEffect(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const onLoad = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [imageUrl]);

  function handleFile(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 4 MB).`);
      return;
    }
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      setImageError("Unsupported image type. Use PNG, JPG, or SVG.");
      return;
    }
    setImageError(null);
    onImageUpload?.(file);
  }

  function viewportToImage(evt: React.MouseEvent): { x: number; y: number } | null {
    if (!naturalSize || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const xRatio = naturalSize.w / rect.width;
    const yRatio = naturalSize.h / rect.height;
    return {
      x: Math.round((evt.clientX - rect.left) * xRatio),
      y: Math.round((evt.clientY - rect.top) * yRatio),
    };
  }

  function startDraw(evt: React.MouseEvent) {
    if (preview) return;
    if (tool === "select") return;

    const pt = viewportToImage(evt);
    if (!pt) return;

    if (tool === "marker") {
      const taken = new Set(markers.map((m) => m.id));
      const id = nextId("m", taken);
      onMarkersChange?.([...markers, { id, x: pt.x, y: pt.y }]);
      return;
    }

    if (tool === "polygon") {
      setPolygonInProgress([...(polygonInProgress ?? []), [pt.x, pt.y]]);
      return;
    }

    const taken = new Set(shapes.map((s) => s.id));
    const id = nextId(tool === "circle" ? "c" : "r", taken);
    if (tool === "circle") {
      setDrawing({ kind: "circle", id, cx: pt.x, cy: pt.y, r: 0 });
    } else if (tool === "rect") {
      setDrawing({ kind: "rect", id, x: pt.x, y: pt.y, width: 0, height: 0 });
    }
  }

  function continueDraw(evt: React.MouseEvent) {
    if (preview) return;
    if (!drawing) return;
    const pt = viewportToImage(evt);
    if (!pt) return;
    if (drawing.kind === "circle") {
      const dx = pt.x - drawing.cx;
      const dy = pt.y - drawing.cy;
      setDrawing({ ...drawing, r: Math.round(Math.sqrt(dx * dx + dy * dy)) });
    } else if (drawing.kind === "rect") {
      setDrawing({
        ...drawing,
        width: Math.max(0, pt.x - drawing.x),
        height: Math.max(0, pt.y - drawing.y),
      });
    }
  }

  function endDraw() {
    if (!drawing) return;
    if (
      (drawing.kind === "circle" && drawing.r > 5) ||
      (drawing.kind === "rect" && drawing.width > 10 && drawing.height > 10)
    ) {
      onShapesChange?.([...shapes, drawing]);
    }
    setDrawing(null);
  }

  function closePolygon() {
    if (!polygonInProgress || polygonInProgress.length < 3) {
      setPolygonInProgress(null);
      return;
    }
    const taken = new Set(shapes.map((s) => s.id));
    const id = nextId("p", taken);
    onShapesChange?.([
      ...shapes,
      { kind: "polygon", id, points: polygonInProgress },
    ]);
    setPolygonInProgress(null);
  }

  function deleteSelected() {
    if (selectedShapeId) {
      onShapesChange?.(shapes.filter((s) => s.id !== selectedShapeId));
      setSelectedShapeId(null);
    }
  }

  const renderScale = naturalSize
    ? { x: width / naturalSize.w, y: height / naturalSize.h }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!preview && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 8,
            background: "var(--bg-subtle, #f8f9fc)",
            borderRadius: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "6px 12px",
              background: "var(--color-blue, #4f87f6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            📷 Upload image
          </button>

          <span style={{ fontSize: 12, opacity: 0.6 }}>|</span>

          {(["select", "circle", "rect", "polygon", "marker"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTool(t);
                if (t !== "polygon") closePolygon();
              }}
              style={{
                padding: "6px 12px",
                background: tool === t ? "var(--color-blue, #4f87f6)" : "white",
                color: tool === t ? "white" : "inherit",
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t}
            </button>
          ))}

          {tool === "polygon" &&
            polygonInProgress &&
            polygonInProgress.length >= 3 && (
              <button
                type="button"
                onClick={closePolygon}
                style={{
                  padding: "6px 12px",
                  background: "var(--color-green, #10c47a)",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Close polygon ({polygonInProgress.length} pts)
              </button>
            )}

          {selectedShapeId && (
            <button
              type="button"
              onClick={deleteSelected}
              style={{
                padding: "6px 12px",
                background: "var(--color-red, #f43f5e)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Delete {selectedShapeId}
            </button>
          )}
        </div>
      )}

      {imageError && (
        <div
          style={{
            padding: 8,
            background: "var(--color-red-bg, #fee)",
            color: "var(--color-red, #f43f5e)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          {imageError}
        </div>
      )}

      <div
        ref={containerRef}
        onMouseDown={startDraw}
        onMouseMove={continueDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        style={{
          width,
          height,
          position: "relative",
          background: imageUrl ? "transparent" : "#f0f2f6",
          border: "1px solid var(--border, #e1e5ee)",
          borderRadius: 6,
          overflow: "hidden",
          cursor: preview ? "default" : tool === "select" ? "default" : "crosshair",
        }}
      >
        {imageUrl ? (
          <img
            ref={imgRef}
            src={imageUrl}
            alt="diagram"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              opacity: 0.5,
              fontSize: 14,
            }}
          >
            Upload an image to begin
          </div>
        )}

        {renderScale && (
          <svg
            viewBox={`0 0 ${naturalSize!.w} ${naturalSize!.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {shapes.map((s) => {
              const fill =
                s.id === selectedShapeId
                  ? "rgba(79, 135, 246, 0.3)"
                  : "rgba(79, 135, 246, 0.18)";
              const stroke =
                s.id === selectedShapeId ? "var(--color-blue, #4f87f6)" : "#4f87f6";
              const strokeWidth = Math.max(1, naturalSize!.w / 250);
              if (s.kind === "circle") {
                return (
                  <g key={s.id}>
                    <circle
                      cx={s.cx}
                      cy={s.cy}
                      r={s.r}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      style={{ pointerEvents: preview ? "none" : "all", cursor: "pointer" }}
                      onClick={() => setSelectedShapeId(s.id)}
                    />
                    <text
                      x={s.cx}
                      y={s.cy}
                      fontSize={Math.max(10, naturalSize!.w / 60)}
                      fill={stroke}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {s.id}
                    </text>
                  </g>
                );
              }
              if (s.kind === "rect") {
                return (
                  <g key={s.id}>
                    <rect
                      x={s.x}
                      y={s.y}
                      width={s.width}
                      height={s.height}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      style={{ pointerEvents: preview ? "none" : "all", cursor: "pointer" }}
                      onClick={() => setSelectedShapeId(s.id)}
                    />
                    <text
                      x={s.x + s.width / 2}
                      y={s.y + s.height / 2}
                      fontSize={Math.max(10, naturalSize!.w / 60)}
                      fill={stroke}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {s.id}
                    </text>
                  </g>
                );
              }
              if (s.kind === "polygon") {
                return (
                  <g key={s.id}>
                    <polygon
                      points={s.points.map((p) => p.join(",")).join(" ")}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      style={{ pointerEvents: preview ? "none" : "all", cursor: "pointer" }}
                      onClick={() => setSelectedShapeId(s.id)}
                    />
                  </g>
                );
              }
              return null;
            })}

            {drawing && drawing.kind === "circle" && (
              <circle
                cx={drawing.cx}
                cy={drawing.cy}
                r={drawing.r}
                fill="rgba(79, 135, 246, 0.18)"
                stroke="#4f87f6"
                strokeDasharray="6 4"
                strokeWidth={Math.max(1, naturalSize!.w / 250)}
              />
            )}
            {drawing && drawing.kind === "rect" && (
              <rect
                x={drawing.x}
                y={drawing.y}
                width={drawing.width}
                height={drawing.height}
                fill="rgba(79, 135, 246, 0.18)"
                stroke="#4f87f6"
                strokeDasharray="6 4"
                strokeWidth={Math.max(1, naturalSize!.w / 250)}
              />
            )}

            {polygonInProgress && polygonInProgress.length > 0 && (
              <polyline
                points={polygonInProgress.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="#4f87f6"
                strokeDasharray="6 4"
                strokeWidth={Math.max(1, naturalSize!.w / 250)}
              />
            )}

            {markers.map((m) => (
              <g key={m.id}>
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={Math.max(6, naturalSize!.w / 120)}
                  fill="var(--color-amber, #f59e0b)"
                  stroke="white"
                  strokeWidth={Math.max(1, naturalSize!.w / 200)}
                />
                <text
                  x={m.x}
                  y={m.y}
                  fontSize={Math.max(8, naturalSize!.w / 80)}
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                >
                  {m.id}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {!preview && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {shapes.length} shape{shapes.length === 1 ? "" : "s"} ·{" "}
          {markers.length} marker{markers.length === 1 ? "" : "s"} · coords in
          image-pixel space ({naturalSize ? `${naturalSize.w}×${naturalSize.h}` : "no image"})
        </div>
      )}
    </div>
  );
}
