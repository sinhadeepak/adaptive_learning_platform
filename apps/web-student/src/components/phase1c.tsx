// Phase 1C — student-facing analytics widgets:
//   <TimeToMasteryCard userId topicId />
//   <ConfidenceGapCard userId />
//   <MistakeReplayButton userId topicId? onStarted />

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/api";

interface TimeToMasteryResponse {
  user_id: string;
  topic_id: string;
  current_ewa: number;
  target_ewa: number;
  questions_needed: number;
  hours_to_target: number;
  days_at_current_pace: number | null;
  daily_questions_30d: number;
  confidence: "low" | "medium" | "high";
  notes: string[];
}

export function TimeToMasteryCard({
  userId,
  topicId,
}: {
  userId: string;
  topicId: string;
}) {
  const [data, setData] = useState<TimeToMasteryResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/time-to-mastery/${userId}/${topicId}`,
        );
        if (!alive) return;
        if (r.ok) setData((await r.json()) as TimeToMasteryResponse);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, topicId]);

  if (!loaded || !data) return null;

  const { questions_needed, hours_to_target, days_at_current_pace, confidence, notes } = data;

  if (questions_needed === 0) {
    return (
      <div className="ttm-card" style={cardStyle}>
        <div style={titleStyle}>Time to mastery</div>
        <div style={{ ...bigStyle, color: "var(--good, #10C47A)" }}>
          Already at target ✓
        </div>
        <div style={subStyle}>
          You've passed the {Math.round(data.target_ewa * 100)}% mark on this topic.
        </div>
      </div>
    );
  }

  return (
    <div className="ttm-card" style={cardStyle}>
      <div style={titleStyle}>Time to mastery</div>
      <div style={bigStyle}>
        ~{hours_to_target}h <span style={{ fontSize: 13, color: "var(--ink-3)" }}>focused</span>
      </div>
      <div style={subStyle}>
        ~{questions_needed} questions to {Math.round(data.target_ewa * 100)}% mastery
      </div>
      {days_at_current_pace !== null && days_at_current_pace > 0 && (
        <div style={subStyle}>
          At your current pace ({data.daily_questions_30d}/day): about{" "}
          <strong>{days_at_current_pace} days</strong>.
        </div>
      )}
      <div style={{ ...subStyle, marginTop: 6, fontSize: 11 }}>
        Confidence: <code>{confidence}</code>
      </div>
      {notes.length > 0 && (
        <div style={{ ...subStyle, fontSize: 11, marginTop: 4 }}>{notes[0]}</div>
      )}
    </div>
  );
}

interface ConfidenceGapResponse {
  user_id: string;
  overall_brier: number | null;
  overall_n: number;
  overconfident: Array<{
    concept_id: string;
    n: number;
    miscalibration: number;
    avg_predicted: number;
    avg_actual: number;
  }>;
  underconfident: Array<{
    concept_id: string;
    n: number;
    miscalibration: number;
    avg_predicted: number;
    avg_actual: number;
  }>;
  calibrated: Array<{ concept_id: string; n: number; miscalibration: number }>;
  hidden_low_sample_count: number;
  notes: string[];
}

export function ConfidenceGapCard({ userId }: { userId: string }) {
  const [data, setData] = useState<ConfidenceGapResponse | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/confidence-gap/${userId}`);
        if (alive && r.ok) setData((await r.json()) as ConfidenceGapResponse);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!data) return null;

  if (data.overall_n === 0) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Confidence calibration</div>
        <div style={subStyle}>{data.notes[0] ?? "Answer some questions in confidence-rating mode to populate."}</div>
      </div>
    );
  }

  const brier = data.overall_brier ?? 0;
  const brierTone = brier < 0.10 ? "good" : brier < 0.25 ? "warn" : "bad";
  const brierColor = {
    good: "var(--good, #10C47A)",
    warn: "var(--warn, #fbbf24)",
    bad: "var(--bad, #f43f5e)",
  }[brierTone];

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Confidence calibration</div>
      <div style={{ ...bigStyle, color: brierColor }}>
        Brier {brier.toFixed(3)}
      </div>
      <div style={subStyle}>
        From {data.overall_n} rated answer{data.overall_n === 1 ? "" : "s"}.{" "}
        Lower = better calibrated.
      </div>
      {data.overconfident.length > 0 && (
        <div style={{ ...subStyle, marginTop: 8 }}>
          <strong style={{ color: "var(--bad, #f43f5e)" }}>
            Overconfident ({data.overconfident.length})
          </strong>{" "}
          — concepts where you predict correct more often than you are.
        </div>
      )}
      {data.underconfident.length > 0 && (
        <div style={subStyle}>
          <strong style={{ color: "var(--info, #4F87F6)" }}>
            Underconfident ({data.underconfident.length})
          </strong>{" "}
          — you know more than you think.
        </div>
      )}
      {data.hidden_low_sample_count > 0 && (
        <div style={{ ...subStyle, fontSize: 11, opacity: 0.6 }}>
          {data.hidden_low_sample_count} concept(s) hidden — fewer than 5 ratings.
        </div>
      )}
    </div>
  );
}

interface ReplayResponse {
  sessionId: string;
  itemCount: number;
  topicId?: string;
  replayKind: string;
}

export function MistakeReplayButton({
  userId,
  topicId,
  onStarted,
  className,
  label = "▶ Replay my mistakes",
}: {
  userId: string;
  topicId?: string;
  onStarted?: (sessionId: string) => void;
  className?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { userId };
      if (topicId) body.topicId = topicId;
      const r = await auth.fetch(`/api/v1/quiz/sessions/start-mistake-replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 422) {
        setError("No wrong-answered questions yet — answer some practice items first.");
        return;
      }
      if (!r.ok) {
        setError(`Couldn't start replay (HTTP ${r.status}).`);
        return;
      }
      const out = (await r.json()) as ReplayResponse;
      if (onStarted) onStarted(out.sessionId);
      else navigate(`/quiz/${out.sessionId}`);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={className ?? "btn btn-ghost"}
        onClick={start}
        disabled={busy}
      >
        {busy ? "Starting…" : label}
      </button>
      {error && (
        <div style={{ ...subStyle, color: "var(--warn, #fbbf24)", marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--paper-2)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
};

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-3)",
  textTransform: "uppercase",
  letterSpacing: 0.04,
  marginBottom: 4,
};

const bigStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-3)",
  marginTop: 2,
};