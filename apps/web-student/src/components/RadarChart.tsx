import type { ReactNode } from "react";

// Pure-SVG radar chart. No external chart library — keeps the bundle
// small and the styling consistent with the rest of web-student.
//
// Used by ConceptProfile.tsx to render the 9-dimension assessment
// substrate per ADR-0017.

export interface RadarPoint {
  label: string;
  value: number; // 0-1
}

interface RadarChartProps {
  points: RadarPoint[];
  size?: number;
  primaryColor?: string;
  bgColor?: string;
}

export function RadarChart({
  points,
  size = 320,
  primaryColor = "var(--color-blue, #4f87f6)",
  bgColor = "var(--bg-subtle, #f8f9fc)",
}: RadarChartProps): ReactNode {
  const center = size / 2;
  const radius = size * 0.4;
  const n = points.length;

  if (n < 3) {
    return (
      <div style={{ fontSize: 13, opacity: 0.7 }}>
        Need ≥ 3 dimensions to render a radar chart (got {n}).
      </div>
    );
  }

  function pointAt(idx: number, value: number): [number, number] {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    return [
      center + Math.cos(angle) * radius * value,
      center + Math.sin(angle) * radius * value,
    ];
  }

  // Concentric grid (5 rings).
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Polygon for current values.
  const valuePoints = points.map((p, idx) => pointAt(idx, Math.min(1, Math.max(0, p.value))));
  const valuePolyStr = valuePoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block" }}
    >
      {/* Background rings */}
      {rings.map((r) => {
        const ringPts = Array.from({ length: n }, (_, i) => pointAt(i, r));
        return (
          <polygon
            key={r}
            points={ringPts.map(([x, y]) => `${x},${y}`).join(" ")}
            fill={r === 1.0 ? bgColor : "none"}
            stroke="var(--border, #e1e5ee)"
            strokeWidth={r === 1.0 ? 1 : 0.5}
            strokeDasharray={r === 1.0 ? "0" : "2 2"}
          />
        );
      })}

      {/* Spokes */}
      {points.map((_, idx) => {
        const [x, y] = pointAt(idx, 1.0);
        return (
          <line
            key={idx}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="var(--border, #e1e5ee)"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Value polygon */}
      <polygon
        points={valuePolyStr}
        fill={primaryColor}
        fillOpacity={0.2}
        stroke={primaryColor}
        strokeWidth={2}
      />
      {/* Value vertex dots */}
      {valuePoints.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r={3} fill={primaryColor} />
      ))}

      {/* Labels */}
      {points.map((p, idx) => {
        const [x, y] = pointAt(idx, 1.15);
        const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
        const isTop = Math.sin(angle) < -0.5;
        const isBottom = Math.sin(angle) > 0.5;
        const isRight = Math.cos(angle) > 0.3;
        const isLeft = Math.cos(angle) < -0.3;
        return (
          <g key={idx}>
            <text
              x={x}
              y={y}
              fontSize={11}
              textAnchor={isRight ? "start" : isLeft ? "end" : "middle"}
              dominantBaseline={isTop ? "auto" : isBottom ? "hanging" : "middle"}
              fill="var(--text-base, #0f172a)"
              fontWeight={500}
            >
              {p.label}
            </text>
            <text
              x={x}
              y={y + 14}
              fontSize={10}
              textAnchor={isRight ? "start" : isLeft ? "end" : "middle"}
              dominantBaseline={isTop ? "auto" : isBottom ? "hanging" : "middle"}
              fill="var(--text-muted, #64748b)"
            >
              {(p.value * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
