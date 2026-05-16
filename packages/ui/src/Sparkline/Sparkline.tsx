// Sparkline — tiny inline SVG trend line.
//
// Spec: docs/02-design/design-system/04_components.md §13
//
// Anatomy:
//   • 1.6px stroke path
//   • End dot 2.5r at last point
//   • Fill area at 10% opacity (toggleable via `area={false}`)
//   • Stroke color = subject color OR --accent OR --gold (caller choice)
//
// No axes, no labels, no tooltips — that's a Chart, not a Sparkline.

import React, { forwardRef, useMemo } from "react";
import { cn } from "../utils/cn";

export interface SparklineProps extends Omit<React.SVGAttributes<SVGSVGElement>, "stroke" | "fill"> {
  /** Series of numeric points. Empty array renders nothing. */
  data: number[];
  /** Display width in px. Default 96. */
  width?: number;
  /** Display height in px. Default 24. */
  height?: number;
  /** Stroke color (any CSS color or token reference). Default var(--accent). */
  stroke?: string;
  /** Render the 10% opacity area fill under the curve. Default true. */
  area?: boolean;
  /** Show the end-of-series dot. Default true. */
  endDot?: boolean;
  /** ARIA description for screen readers. */
  ariaLabel?: string;
}

export const Sparkline = forwardRef<SVGSVGElement, SparklineProps>(
  function Sparkline(
    {
      data,
      width = 96,
      height = 24,
      stroke = "var(--accent)",
      area = true,
      endDot = true,
      className,
      ariaLabel,
      ...rest
    },
    ref,
  ) {
    const { pathD, areaD, lastX, lastY, hasData } = useMemo(() => {
      if (!data.length) {
        return { pathD: "", areaD: "", lastX: 0, lastY: 0, hasData: false };
      }
      const padding = 2; // keep stroke + end-dot off the edge
      const w = width - padding * 2;
      const h = height - padding * 2;
      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min || 1;
      const step = data.length === 1 ? 0 : w / (data.length - 1);
      const pts = data.map((v, i) => {
        const x = padding + step * i;
        const y = padding + h - ((v - min) / range) * h;
        return [x, y] as const;
      });
      const segments = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
      const pathD = segments.join(" ");
      const areaD = data.length > 1
        ? `${pathD} L${pts[pts.length - 1][0].toFixed(2)} ${(height - padding).toFixed(2)} L${pts[0][0].toFixed(2)} ${(height - padding).toFixed(2)} Z`
        : "";
      const [lx, ly] = pts[pts.length - 1];
      return { pathD, areaD, lastX: lx, lastY: ly, hasData: true };
    }, [data, width, height]);

    if (!hasData) {
      // Render a transparent SVG so layout doesn't shift; absent data
      // shouldn't crash the page.
      return (
        <svg
          ref={ref}
          width={width}
          height={height}
          className={cn("sparkline", "sparkline--empty", className)}
          aria-hidden="true"
          {...rest}
        />
      );
    }

    return (
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("sparkline", className)}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        {...rest}
      >
        {area && areaD ? (
          <path d={areaD} fill={stroke} fillOpacity={0.1} stroke="none" />
        ) : null}
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {endDot ? (
          <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
        ) : null}
      </svg>
    );
  },
);
