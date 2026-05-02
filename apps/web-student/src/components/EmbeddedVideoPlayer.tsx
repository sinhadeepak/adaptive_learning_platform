import { useEffect, useRef, useState } from "react";
import {
  contentResources,
  type StudentResource,
  type ViewEventType,
} from "../lib/api";

// ─────────────────────────────────────────────────────────────────────────
// EmbeddedVideoPlayer (R-S2)
//
// Modal player for a curated YouTube clip. Uses youtube-nocookie.com
// to suppress cookies + tracking, modestbranding=1 to hide the YT
// chrome, and rel=0 to suppress related-video panel at the end.
//
// View tracking — fires append-only events to /content/resources/{id}/view:
//   - started   when iframe loads
//   - 25pct/50pct/75pct/completed driven by an interval polling
//     the player's currentTime via the IFrame Player API
//   - closed when the user dismisses the modal
//
// The player API loads on demand the first time the modal opens.
// session_id is optional — passed when the open is triggered from a
// QuizResult wrong-answer CTA so we can later correlate view-events
// with subsequent mastery deltas.
// ─────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: string | HTMLElement,
        options: Record<string, unknown>,
      ) => unknown;
      PlayerState: { PLAYING: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let _ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
  return _ytApiPromise;
}

export function EmbeddedVideoPlayer({
  resource,
  onClose,
  sessionId,
}: {
  resource: StudentResource;
  onClose: () => void;
  sessionId?: string;
}) {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const milestonesFiredRef = useRef<Set<ViewEventType>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function fire(event_type: ViewEventType, position_seconds?: number) {
    void contentResources.recordView(resource.id, {
      event_type,
      position_seconds,
      session_id: sessionId,
    });
  }

  useEffect(() => {
    if (!resource.external_id) {
      setError("This resource has no embeddable video ID.");
      return;
    }
    let cancelled = false;
    let pollTimer: number | null = null;

    void loadYouTubeIframeAPI().then(() => {
      if (cancelled || !window.YT || !playerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(playerRef.current, {
        videoId: resource.external_id,
        host: "https://www.youtube-nocookie.com",
        // Fill the responsive 16:9 container; without these the
        // YT API hard-codes width=640, height=360 on the iframe and
        // the player floats inside a wider modal.
        width: "100%",
        height: "100%",
        playerVars: {
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            fire("started", 0);
            pollTimer = window.setInterval(() => {
              const p = ytPlayerRef.current;
              if (!p || !p.getCurrentTime || !p.getDuration) return;
              const t = p.getCurrentTime();
              const dur = p.getDuration();
              if (!dur || dur < 1) return;
              const pct = t / dur;
              const fired = milestonesFiredRef.current;
              if (pct >= 0.25 && !fired.has("25pct")) {
                fired.add("25pct");
                fire("25pct", Math.round(t));
              }
              if (pct >= 0.5 && !fired.has("50pct")) {
                fired.add("50pct");
                fire("50pct", Math.round(t));
              }
              if (pct >= 0.75 && !fired.has("75pct")) {
                fired.add("75pct");
                fire("75pct", Math.round(t));
              }
            }, 5000);
          },
          onStateChange: (e: { data: number }) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              const fired = milestonesFiredRef.current;
              if (!fired.has("completed")) {
                fired.add("completed");
                const p = ytPlayerRef.current;
                fire(
                  "completed",
                  p?.getDuration ? Math.round(p.getDuration()) : undefined,
                );
              }
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      const p = ytPlayerRef.current;
      const ct = p?.getCurrentTime ? Math.round(p.getCurrentTime()) : undefined;
      fire("closed", ct);
      try {
        p?.destroy?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id, resource.external_id]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Watch ${resource.title}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface1, #0C1422)",
          borderRadius: 10,
          maxWidth: 1000,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border-strong, rgba(255,255,255,0.11))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom:
              "1px solid var(--border, rgba(255,255,255,0.07))",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary, #EEF2FF)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {resource.title}
            </div>
            {resource.channel_name && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-faint, #7A8BAD)",
                  marginTop: 2,
                }}
              >
                {resource.channel_name}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            style={{
              background: "transparent",
              border: "1px solid var(--border-strong, rgba(255,255,255,0.11))",
              color: "var(--text-secondary, #B8C5E0)",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
        <div
          style={{
            position: "relative",
            paddingBottom: "56.25%",
            height: 0,
            background: "#000",
          }}
        >
          {error ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-amber, #F5A623)",
                fontSize: 13,
                padding: 16,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          ) : (
            <div
              ref={playerRef}
              style={{
                position: "absolute",
                inset: 0,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
