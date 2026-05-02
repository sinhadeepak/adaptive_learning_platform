import { useEffect, useState } from "react";
import { contentResources, type StudentResource } from "../lib/api";
import { EmbeddedVideoPlayer } from "./EmbeddedVideoPlayer";

// ─────────────────────────────────────────────────────────────────────────
// ResourceShelf (R-S2)
//
// Horizontal carousel of curated YouTube clips for a topic, concept,
// or specific question. Hidden when the scope has zero PUBLISHED
// resources so the page doesn't show an empty section.
//
// Click a card → opens EmbeddedVideoPlayer in a modal that fires
// view-tracking events. The session_id prop is forwarded to the
// player so we can correlate "watched X" with "subsequent quiz
// performance on Y."
// ─────────────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null | undefined): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface ResourceShelfProps {
  topicId?: string;
  conceptId?: string;
  questionId?: string;
  language?: string;
  /** Heading shown above the carousel. */
  title?: string;
  /** Sub-line shown below the heading. */
  subtitle?: string;
  /** Forwarded to the player so view-events can be correlated to a
   *  specific quiz session (e.g. when opened from QuizResult). */
  sessionId?: string;
  /** Maximum cards to show. Default 12. */
  limit?: number;
  /** When true, the shelf renders nothing if zero resources are found. */
  hideWhenEmpty?: boolean;
  /** Compact mode — shorter cards (used inline next to wrong-answer rows). */
  compact?: boolean;
}

export function ResourceShelf({
  topicId,
  conceptId,
  questionId,
  language,
  title = "Watch & Learn",
  subtitle,
  sessionId,
  limit = 12,
  hideWhenEmpty = true,
  compact = false,
}: ResourceShelfProps) {
  const [resources, setResources] = useState<StudentResource[] | null>(null);
  const [openResource, setOpenResource] = useState<StudentResource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResources(null);
    (async () => {
      try {
        const items = await contentResources.list({
          topic_id: topicId,
          concept_id: conceptId,
          question_id: questionId,
          language,
          limit,
        });
        if (!cancelled) setResources(items);
      } catch {
        if (!cancelled) setResources([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, conceptId, questionId, language, limit]);

  if (resources === null) {
    return null; // skeleton kept simple — shelf is decorative not blocking
  }
  if (resources.length === 0 && hideWhenEmpty) {
    return null;
  }

  const cardWidth = compact ? 220 : 280;
  const thumbHeight = compact ? 124 : 158;

  return (
    <section
      aria-label={title}
      style={{
        margin: compact ? "8px 0" : "0 0 24px",
        padding: compact ? "0" : "16px 18px",
        background: compact
          ? "transparent"
          : "linear-gradient(135deg, rgba(34,212,238,0.06), rgba(79,135,246,0.04))",
        border: compact
          ? "none"
          : "1px solid rgba(34,212,238,0.18)",
        borderRadius: compact ? 0 : 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: compact ? 6 : 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: compact ? 10 : 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--color-ai, #22D4EE)",
            }}
          >
            🎬 {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #B8C5E0)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-faint, #7A8BAD)",
          }}
        >
          {resources.length} clip{resources.length === 1 ? "" : "s"} · curated by your teachers
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {resources.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => setOpenResource(r)}
            style={{
              background: "var(--bg-surface3, #162038)",
              border: "1px solid var(--border, rgba(255,255,255,0.07))",
              borderRadius: 8,
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
              width: cardWidth,
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              fontFamily: "inherit",
              color: "inherit",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: thumbHeight,
                background: "#000",
              }}
            >
              {r.thumbnail_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.thumbnail_url}
                  alt={r.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-faint, #7A8BAD)",
                    fontSize: 11,
                  }}
                >
                  no preview
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.25)",
                  opacity: 0,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.opacity = "1")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.opacity = "0")
                }
              >
                <span
                  style={{
                    fontSize: 30,
                    color: "white",
                    textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  }}
                >
                  ▶
                </span>
              </div>
              {r.duration_seconds ? (
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
                  {formatDuration(r.duration_seconds)}
                </span>
              ) : null}
            </div>
            <div
              style={{
                padding: compact ? "8px 10px" : "10px 12px",
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: compact ? 12 : 13,
                  fontWeight: 500,
                  color: "var(--text-primary, #EEF2FF)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  marginBottom: 4,
                }}
              >
                {r.title}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-faint, #7A8BAD)",
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                {r.channel_name && <span>{r.channel_name}</span>}
                {r.difficulty && (
                  <span
                    style={{
                      color:
                        r.difficulty === "HARD"
                          ? "var(--color-red, #F43F5E)"
                          : r.difficulty === "MEDIUM"
                            ? "var(--color-amber, #F5A623)"
                            : "var(--color-blue, #4F87F6)",
                      fontWeight: 600,
                    }}
                  >
                    · {r.difficulty}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {openResource && (
        <EmbeddedVideoPlayer
          resource={openResource}
          sessionId={sessionId}
          onClose={() => setOpenResource(null)}
        />
      )}
    </section>
  );
}
