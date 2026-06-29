import { useState } from "react";
import {
  contentResources,
  type ResourceWatchProgress,
  type StudentResource,
} from "../../lib/api";
import { MarkdownMath } from "../MarkdownMath";

// ─────────────────────────────────────────────────────────────────────────
// ContentCard — one curated item, rendered by resource_type.
//
//   youtube_video / youtube_playlist → thumbnail card → opens video modal
//   document                         → file card      → opens DocumentViewer
//   url                              → external link  → opens in a new tab
//   note                            → inline expandable Markdown/LaTeX
//
// A progress badge (% complete) is shown for videos the student has begun.
// The parent owns the modals; this card just signals which to open.
// ─────────────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null | undefined): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ContentCard({
  resource,
  progress,
  onOpenVideo,
  onOpenDoc,
}: {
  resource: StudentResource;
  progress?: ResourceWatchProgress;
  onOpenVideo: (r: StudentResource) => void;
  onOpenDoc: (r: StudentResource) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const isVideo = resource.resource_type.startsWith("youtube");
  const pct = progress?.furthestPercent ?? 0;
  const watched = progress?.watched ?? false;

  const shell: React.CSSProperties = {
    background: "var(--paper-2, #162038)",
    border: "1px solid var(--rule, rgba(255,255,255,0.07))",
    borderRadius: 8,
    overflow: "hidden",
    textAlign: "left",
    width: "100%",
    color: "inherit",
    fontFamily: "inherit",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    flexDirection: "column",
  };

  const ProgressBadge = () =>
    pct > 0 ? (
      <span
        style={{
          position: "absolute",
          left: 6,
          bottom: 6,
          background: watched ? "var(--good, #22C55E)" : "rgba(0,0,0,0.8)",
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 3,
        }}
      >
        {watched ? "✓ Watched" : `${pct}%`}
      </span>
    ) : null;

  const Meta = () => (
    <div
      style={{
        fontSize: 10,
        color: "var(--ink-4, #7A8BAD)",
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 4,
      }}
    >
      {resource.channel_name && <span>{resource.channel_name}</span>}
      {resource.difficulty && (
        <span
          style={{
            color:
              resource.difficulty === "HARD"
                ? "var(--bad, #F43F5E)"
                : resource.difficulty === "MEDIUM"
                  ? "var(--warn, #F5A623)"
                  : "var(--info, #4F87F6)",
            fontWeight: 600,
          }}
        >
          · {resource.difficulty}
        </span>
      )}
    </div>
  );

  // ── Video ────────────────────────────────────────────────────────────
  if (isVideo) {
    return (
      <button type="button" style={shell} onClick={() => onOpenVideo(resource)}>
        <div style={{ position: "relative", width: "100%", height: 150, background: "#000" }}>
          {resource.thumbnail_url ? (
            <img
              src={resource.thumbnail_url}
              alt={resource.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-4, #7A8BAD)",
                fontSize: 11,
              }}
            >
              ▶ video
            </div>
          )}
          <ProgressBadge />
          {resource.duration_seconds ? (
            <span
              style={{
                position: "absolute",
                right: 6,
                bottom: 6,
                background: "rgba(0,0,0,0.8)",
                color: "white",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 3,
              }}
            >
              {formatDuration(resource.duration_seconds)}
            </span>
          ) : null}
        </div>
        <div style={{ padding: "10px 12px", flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ink, #EEF2FF)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {resource.title}
          </div>
          <Meta />
        </div>
      </button>
    );
  }

  // ── Document ──────────────────────────────────────────────────────────
  if (resource.resource_type === "document") {
    return (
      <button
        type="button"
        style={{ ...shell, padding: "12px 14px", flexDirection: "row", gap: 12, alignItems: "center" }}
        onClick={() => onOpenDoc(resource)}
      >
        <span style={{ fontSize: 26 }} aria-hidden>
          📄
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink, #EEF2FF)" }}>
            {resource.title}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-4, #7A8BAD)", marginTop: 2 }}>
            PDF{resource.doc_size_bytes ? ` · ${formatSize(resource.doc_size_bytes)}` : ""}
            {watched ? " · ✓ read" : ""}
          </div>
        </div>
      </button>
    );
  }

  // ── Note (inline Markdown/LaTeX) ───────────────────────────────────────
  if (resource.resource_type === "note") {
    return (
      <div style={{ ...shell, cursor: "default", padding: "12px 14px" }}>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink, #EEF2FF)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontFamily: "inherit",
          }}
        >
          <span aria-hidden>📝</span>
          <span>{resource.title}</span>
          <span style={{ color: "var(--ink-4, #7A8BAD)", marginLeft: "auto" }}>
            {noteOpen ? "▲" : "▼"}
          </span>
        </button>
        {noteOpen && resource.description ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2, #B8C5E0)" }}>
            <MarkdownMath text={resource.description} />
          </div>
        ) : null}
      </div>
    );
  }

  // ── URL (external link) ────────────────────────────────────────────────
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer"
      onClick={() => void contentResources.recordView(resource.id, { event_type: "started" })}
      style={{ ...shell, textDecoration: "none", padding: "12px 14px", flexDirection: "row", gap: 12, alignItems: "center" }}
    >
      <span style={{ fontSize: 22 }} aria-hidden>
        🔗
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink, #EEF2FF)" }}>
          {resource.title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--ink-4, #7A8BAD)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {resource.url}
        </div>
      </div>
    </a>
  );
}
