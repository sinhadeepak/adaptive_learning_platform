// Phase 1D-2 — Topic prerequisite map.
// Lightweight SVG layered layout (no react-flow dep): root in center,
// prereqs above (depth-ordered), dependents below.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/api";

interface GraphNode {
  id: string;
  title: string;
  mastery: number | null;
  isFocus: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface GraphResp {
  rootTopicId: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function PrerequisiteMap({
  topicId,
  userId,
}: {
  topicId: string;
  userId?: string;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<GraphResp | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("depth", "3");
        if (userId) params.set("userId", userId);
        const r = await auth.fetch(
          `/api/v1/catalog/topics/${topicId}/prerequisite-graph?${params}`,
        );
        if (alive && r.ok) setData((await r.json()) as GraphResp);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [topicId, userId]);

  if (!loaded) return <div style={{ padding: 12 }}>Loading prerequisite map…</div>;
  if (!data || data.nodes.length <= 1) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
        No prerequisite relationships defined for this topic yet.
      </div>
    );
  }

  // Layered layout: BFS from root upwards (prereqs).
  const adjUp: Record<string, string[]> = {};
  const adjDown: Record<string, string[]> = {};
  for (const e of data.edges) {
    (adjUp[e.from] ??= []).push(e.to);
    (adjDown[e.to] ??= []).push(e.from);
  }

  // Layer 0 = root focus. Negative layers = prereqs (above), positive = dependents (below).
  const layer: Record<string, number> = { [data.rootTopicId]: 0 };
  const queueUp = [data.rootTopicId];
  while (queueUp.length) {
    const n = queueUp.shift()!;
    for (const p of adjUp[n] ?? []) {
      if (!(p in layer)) {
        layer[p] = layer[n] - 1;
        queueUp.push(p);
      }
    }
  }
  const queueDown = [data.rootTopicId];
  while (queueDown.length) {
    const n = queueDown.shift()!;
    for (const d of adjDown[n] ?? []) {
      if (!(d in layer)) {
        layer[d] = layer[n] + 1;
        queueDown.push(d);
      }
    }
  }

  // Group nodes by layer, then assign x within layer.
  const byLayer: Record<number, GraphNode[]> = {};
  for (const node of data.nodes) {
    const ly = layer[node.id] ?? 0;
    (byLayer[ly] ??= []).push(node);
  }
  const layers = Object.keys(byLayer)
    .map(Number)
    .sort((a, b) => a - b);

  const nodeW = 160;
  const nodeH = 56;
  const colGap = 36;
  const rowGap = 60;
  const maxNodesInLayer = Math.max(...layers.map((ly) => byLayer[ly].length));
  const width = Math.max(720, maxNodesInLayer * (nodeW + colGap));
  const height = layers.length * (nodeH + rowGap) + 32;

  const positions: Record<string, { x: number; y: number }> = {};
  layers.forEach((ly, layerIdx) => {
    const nodes = byLayer[ly];
    const layerWidth = nodes.length * nodeW + (nodes.length - 1) * colGap;
    const startX = (width - layerWidth) / 2;
    nodes.forEach((node, i) => {
      positions[node.id] = {
        x: startX + i * (nodeW + colGap),
        y: 16 + layerIdx * (nodeH + rowGap),
      };
    });
  });

  function color(mastery: number | null): string {
    if (mastery === null) return "#444";
    if (mastery >= 0.7) return "var(--color-green, #10C47A)";
    if (mastery >= 0.4) return "var(--color-amber, #fbbf24)";
    return "var(--color-red, #f43f5e)";
  }

  return (
    <div
      style={{
        overflowX: "auto",
        padding: 8,
        background: "var(--bg-surface1, #ffffff)",
        border: "1px solid var(--border, rgba(15,23,42,0.08))",
        borderRadius: 8,
      }}
    >
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* Edges */}
        {data.edges.map((e, i) => {
          const a = positions[e.from];
          const b = positions[e.to];
          if (!a || !b) return null;
          const x1 = a.x + nodeW / 2;
          const y1 = a.y + nodeH;
          const x2 = b.x + nodeW / 2;
          const y2 = b.y;
          // Cubic curve
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={i}
              d={`M${x1} ${y1} C${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              stroke="var(--text-faint, #666)"
              strokeWidth={1.5}
              fill="none"
              opacity={0.55}
              markerEnd="url(#arrow)"
            />
          );
        })}
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint, #666)" />
          </marker>
        </defs>

        {/* Nodes */}
        {data.nodes.map((node) => {
          const p = positions[node.id];
          if (!p) return null;
          return (
            <g
              key={node.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ cursor: node.isFocus ? "default" : "pointer" }}
              onClick={() => {
                if (!node.isFocus) navigate(`/topics/${node.id}`);
              }}
            >
              <rect
                width={nodeW}
                height={nodeH}
                rx={8}
                // Use the design-system surface token (light → white,
                // dark → deep slate). The previous `--bg-surface` token
                // didn't exist, so SVG fell back to a hard-coded #222
                // that read as dark-on-dark in light theme.
                fill="var(--bg-surface2, #fff)"
                stroke={node.isFocus ? "var(--color-ai, #4F87F6)" : color(node.mastery)}
                strokeWidth={node.isFocus ? 3 : 2}
              />
              <text
                x={nodeW / 2}
                y={20}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary, #fff)"
              >
                {(node.title || node.id.slice(0, 8)).slice(0, 22)}
              </text>
              {node.mastery !== null ? (
                <text
                  x={nodeW / 2}
                  y={42}
                  textAnchor="middle"
                  fontSize="11"
                  fill={color(node.mastery)}
                  fontWeight="700"
                >
                  {Math.round(node.mastery * 100)}%
                </text>
              ) : (
                <text
                  x={nodeW / 2}
                  y={42}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-muted, #888)"
                >
                  not started
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          padding: "8px 12px",
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ color: "var(--color-green)" }}>●</span> ≥70%
        </span>
        <span>
          <span style={{ color: "var(--color-amber)" }}>●</span> 40-70%
        </span>
        <span>
          <span style={{ color: "var(--color-red)" }}>●</span> &lt;40%
        </span>
        <span>
          <span style={{ color: "#888" }}>●</span> not started
        </span>
        <span>Click any node to open that topic.</span>
      </div>
    </div>
  );
}
