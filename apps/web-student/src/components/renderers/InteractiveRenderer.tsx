import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Renderer } from "./types";
import { MCQSingleRenderer, type MCQSinglePayload, type MCQSingleResponse } from "./ObjectiveRenderer";

// ─────────────────────────────────────────────────────────────────────────
// Interactive family renderers (Phase 2 — un-gated per ADR-0026).
//
// Covers: KBC_LIFELINE · TIMED_REVEAL · ADAPTIVE_DIFFICULTY
//
// All three wrap an inner question. The orchestrator (Quiz Go) is
// expected to embed `inner_payload` in the wrapper payload at fetch
// time so the renderer can fully grade in-process. If `inner_payload`
// is absent the wrapper renders a notice and Submit still works — the
// backend handler falls back to PENDING_HUMAN_REVIEW with a clear note.
// ─────────────────────────────────────────────────────────────────────────

type LifelineKind = "50_50" | "audience_poll" | "phone_a_friend";

// ── KBC_LIFELINE ─────────────────────────────────────────────────────────────

export interface KBCLifelinePayload {
  inner_question_id: string;
  inner_payload?: MCQSinglePayload;
  available_lifelines: LifelineKind[];
  audience_poll_distribution?: Record<string, number> | null;
  explanation?: string;
}

export interface KBCLifelineResponse {
  inner_response_payload: MCQSingleResponse | null;
  lifelines_used: LifelineKind[];
}

export const KBCLifelineRenderer: Renderer<KBCLifelinePayload, KBCLifelineResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const used = new Set<LifelineKind>(value?.lifelines_used ?? []);
  const innerResp = value?.inner_response_payload ?? null;

  function toggleLifeline(kind: LifelineKind) {
    const next = new Set(used);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    onChange({
      inner_response_payload: innerResp,
      lifelines_used: Array.from(next),
    });
  }

  function setInner(v: MCQSingleResponse | null) {
    onChange({
      inner_response_payload: v,
      lifelines_used: Array.from(used),
    });
  }

  // 50:50 — surface a hint about which 2 options can be eliminated;
  // server-side decides which, but client-side just shows the chip is on.
  const fiftyOn = used.has("50_50");
  const pollOn = used.has("audience_poll");

  return (
    <div>
      <div
        style={{
          padding: 10,
          marginBottom: 12,
          background:
            "linear-gradient(90deg, var(--accent-soft-tint, #eee6ff), var(--info-soft-tint, #e0ecff))",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        ⚡ <span>KBC lifelines available</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {payload.available_lifelines.map((kind) => {
          const on = used.has(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleLifeline(kind)}
              disabled={disabled}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: on ? "var(--accent, #7c3aed)" : "var(--card)",
                color: on ? "white" : "inherit",
                border: on
                  ? "1px solid var(--accent, #7c3aed)"
                  : "1px solid var(--rule, #e1e5ee)",
                borderRadius: 20,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {labelForLifeline(kind)} {on ? "✓" : ""}
            </button>
          );
        })}
      </div>

      {pollOn && payload.audience_poll_distribution && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            background: "var(--paper-2, #f8f9fc)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <strong>Audience says:</strong>{" "}
          {Object.entries(payload.audience_poll_distribution)
            .map(([id, pct]) => `${id} ${pct}%`)
            .join(" · ")}
        </div>
      )}
      {fiftyOn && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            background: "var(--warn-soft-tint, #fef3c7)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          50:50 active — two distractors will be eliminated at grading time.
        </div>
      )}

      {payload.inner_payload ? (
        <MCQSingleRenderer
          payload={payload.inner_payload}
          value={innerResp}
          onChange={setInner}
          disabled={disabled}
        />
      ) : (
        <div
          style={{
            padding: 14,
            background: "var(--warn-soft-tint, #fef3c7)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Inner MCQ for question {payload.inner_question_id} will load with the
          next quiz item. Your lifeline choices have been recorded.
        </div>
      )}
    </div>
  );
};

function labelForLifeline(kind: LifelineKind): string {
  if (kind === "50_50") return "50:50";
  if (kind === "audience_poll") return "Audience poll";
  return "Phone a friend";
}

// ── TIMED_REVEAL ─────────────────────────────────────────────────────────────

export interface RevealStep {
  at_seconds: number;
  additional_info: string;
}

export interface TimedRevealPayload {
  inner_question_id: string;
  inner_type_id?: string;
  inner_payload?: MCQSinglePayload;
  initial_stem: string;
  reveal_schedule: RevealStep[];
  reveals_make_easier: boolean;
  explanation?: string;
}

export interface TimedRevealResponse {
  inner_response_payload: MCQSingleResponse | null;
  answered_at_seconds: number;
}

export const TimedRevealRenderer: Renderer<TimedRevealPayload, TimedRevealResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const startRef = useRef<number>(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const elapsed = (now - startRef.current) / 1000;

  function setInner(v: MCQSingleResponse | null) {
    onChange({
      inner_response_payload: v,
      answered_at_seconds: elapsed,
    });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
          fontFamily: "monospace",
          fontSize: 13,
          color: "var(--warn, #b45309)",
        }}
      >
        ⏱ {elapsed.toFixed(1)} s
      </div>

      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 14 }}>
        {payload.initial_stem}
      </p>

      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {payload.reveal_schedule.map((step, idx) => {
          const unlocked = elapsed >= step.at_seconds;
          return (
            <div
              key={idx}
              style={{
                padding: 10,
                background: unlocked
                  ? "var(--warn-soft-tint, #fef3c7)"
                  : "var(--paper-2, #f8f9fc)",
                border: `1px solid ${
                  unlocked ? "var(--warn, #f59e0b)" : "var(--rule, #e1e5ee)"
                }`,
                borderRadius: 4,
                opacity: unlocked ? 1 : 0.5,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <strong style={{ fontFamily: "monospace", color: "var(--warn, #b45309)" }}>
                @{step.at_seconds.toFixed(0)}s
              </strong>
              <span style={{ flex: 1, fontSize: 13 }}>
                {unlocked ? step.additional_info : "…"}
              </span>
            </div>
          );
        })}
      </div>

      {payload.inner_payload ? (
        <MCQSingleRenderer
          payload={payload.inner_payload}
          value={value?.inner_response_payload ?? null}
          onChange={setInner}
          disabled={disabled}
        />
      ) : (
        <div
          style={{
            padding: 14,
            background: "var(--warn-soft-tint, #fef3c7)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Inner question {payload.inner_question_id} will load with the next
          quiz item.
        </div>
      )}
    </div>
  );
};

// ── ADAPTIVE_DIFFICULTY ──────────────────────────────────────────────────────

export interface AdaptiveDifficultyPayload {
  variants: { question_id: string; difficulty_level: number }[];
  starting_difficulty: number;
  // Set by the orchestrator after variant selection:
  served_question_id?: string;
  served_difficulty?: number;
  inner_type_id?: string;
  inner_payload?: MCQSinglePayload;
  explanation?: string;
}

export interface AdaptiveDifficultyResponse {
  served_question_id: string;
  inner_response_payload: MCQSingleResponse | null;
}

export const AdaptiveDifficultyRenderer: Renderer<
  AdaptiveDifficultyPayload,
  AdaptiveDifficultyResponse
> = ({ payload, value, onChange, disabled }): ReactNode => {
  const difficulty = payload.served_difficulty ?? payload.starting_difficulty;
  const served = payload.served_question_id ?? "<pending>";

  function setInner(v: MCQSingleResponse | null) {
    onChange({
      served_question_id: served,
      inner_response_payload: v,
    });
  }

  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          marginBottom: 14,
          background: difficultyBg(difficulty),
          color: difficultyFg(difficulty),
          border: `1px solid ${difficultyFg(difficulty)}`,
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        📶 Difficulty {difficulty} / 5
      </div>

      {payload.inner_payload ? (
        <MCQSingleRenderer
          payload={payload.inner_payload}
          value={value?.inner_response_payload ?? null}
          onChange={setInner}
          disabled={disabled}
        />
      ) : (
        <div
          style={{
            padding: 14,
            background: "var(--warn-soft-tint, #fef3c7)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Variant {served} (difficulty {difficulty}) will load with the next
          quiz item.
        </div>
      )}
    </div>
  );
};

function difficultyBg(level: number): string {
  if (level <= 2) return "var(--good-soft-tint, #ecfdf5)";
  if (level <= 3) return "var(--warn-soft-tint, #fef3c7)";
  return "var(--bad-soft-tint, #fee2e2)";
}
function difficultyFg(level: number): string {
  if (level <= 2) return "var(--good, #10c47a)";
  if (level <= 3) return "var(--warn, #b45309)";
  return "var(--bad, #b91c1c)";
}