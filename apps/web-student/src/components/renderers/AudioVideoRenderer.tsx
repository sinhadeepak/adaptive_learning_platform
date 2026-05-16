import type { ReactNode } from "react";
import { useState } from "react";
import type { Renderer } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Audio/Video family renderers (Phase 2 — un-gated per ADR-0026).
//
// Covers: LISTENING_COMP · VIDEO_QUESTION
//
// Both types compose around a media artifact + a list of child
// questions answered downstream as their own quiz items. The parent
// renderer owns the media player + transcript reveal; child Q&A is
// surfaced as a guidance note since Quiz orchestration submits each
// child individually (same convention as COMPREHENSION_LONG).
// ─────────────────────────────────────────────────────────────────────────

function resolveMediaUrl(mediaId: string): string {
  return `/api/v1/content/media/${encodeURIComponent(mediaId)}/file`;
}

interface AVChildRef {
  question_id: string;
  ordinal: number;
  timestamp_seconds?: number | null;
}

interface AVResponse {
  children: { question_id: string; response_payload: Record<string, unknown> }[];
  media_played?: boolean;
}

// ── LISTENING_COMP ───────────────────────────────────────────────────────────

export interface ListeningCompPayload {
  audio_media_id: string;
  transcript: string;
  transcript_language?: string;
  child_questions: AVChildRef[];
  explanation?: string;
}

export const ListeningCompRenderer: Renderer<ListeningCompPayload, AVResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  return (
    <MediaQuestion
      kind="audio"
      mediaSrc={resolveMediaUrl(payload.audio_media_id)}
      transcript={payload.transcript}
      children_={payload.child_questions}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

// ── VIDEO_QUESTION ───────────────────────────────────────────────────────────

export interface VideoQuestionPayload {
  video_media_id: string;
  transcript?: string | null;
  transcript_language?: string;
  child_questions: AVChildRef[];
  explanation?: string;
}

export const VideoQuestionRenderer: Renderer<VideoQuestionPayload, AVResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  return (
    <MediaQuestion
      kind="video"
      mediaSrc={resolveMediaUrl(payload.video_media_id)}
      transcript={payload.transcript ?? null}
      children_={payload.child_questions}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

// ── Shared media-wrapping component ──────────────────────────────────────────

interface MediaQuestionProps {
  kind: "audio" | "video";
  mediaSrc: string;
  transcript: string | null;
  children_: AVChildRef[];
  value: AVResponse | null;
  onChange: (v: AVResponse | null) => void;
  disabled?: boolean;
}

function MediaQuestion({
  kind,
  mediaSrc,
  transcript,
  children_,
  value,
  onChange,
  disabled,
}: MediaQuestionProps): ReactNode {
  const [showTranscript, setShowTranscript] = useState(false);
  // Defensive: a missing `children` in the payload should render the
  // Phase-2 "limited support" banner instead of crashing. Older seeds
  // (and the Phase-2 banner test) don't include a children array.
  const childCount = (children_ ?? []).length;

  function markPlayed() {
    onChange({
      ...(value ?? { children: [] }),
      media_played: true,
    });
  }

  return (
    <div>
      <div
        style={{
          padding: 14,
          marginBottom: 14,
          background: "var(--paper-2, #f8f9fc)",
          border: "1px solid var(--rule, #e1e5ee)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 28 }}>{kind === "audio" ? "🎧" : "▶️"}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {kind === "audio" ? "Listening comprehension" : "Video question"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Play the {kind}, then answer the {childCount} sub-question
            {childCount === 1 ? "" : "s"} that follow.
          </div>
        </div>
      </div>

      {kind === "audio" ? (
        <audio
          controls
          src={mediaSrc}
          onPlay={markPlayed}
          style={{ width: "100%", marginBottom: 12 }}
        />
      ) : (
        <video
          controls
          src={mediaSrc}
          onPlay={markPlayed}
          style={{ width: "100%", maxHeight: 480, marginBottom: 12 }}
        />
      )}

      {transcript && transcript.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowTranscript((s) => !s)}
            disabled={disabled}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--rule, #e1e5ee)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: "var(--card, #f0f2f6)",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "inherit",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {transcript}
            </pre>
          )}
        </div>
      )}

      <div
        style={{
          padding: 10,
          background: "var(--paper-2, #f8f9fc)",
          borderRadius: 4,
          fontSize: 13,
          color: "var(--ink-3, #5a6378)",
        }}
      >
        Sub-questions are answered one-by-one in the steps that follow.
      </div>
    </div>
  );
}