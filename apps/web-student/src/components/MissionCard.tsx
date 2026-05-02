import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { track } from "../lib/instrumentation";

// ─────────────────────────────────────────────────────────────────────
// Today's Mission — Phase 6 S50.
//
// Single decision-reducer card above the fold on Home. Lazy-fetches
// /missions/today; render a clear mission with one CTA + one escape.
// ─────────────────────────────────────────────────────────────────────

interface Mission {
  id: string;
  kind: string;
  concept_id: string | null;
  topic_id: string | null;
  expected_minutes: number;
  expected_questions: number;
  why_picked: string;
  why_picked_source: string;
  primary_cta: { action: string; topic_id?: string; concept_id?: string; intent?: string };
  status: string;
}

const KIND_TITLES: Record<string, string> = {
  refresh_decay: "Refresh a topic before it decays further",
  weak_concept_drill: "Drill a weak concept",
  bloom_lift: "Stretch from recall to apply",
  revision_set: "Today's revision set",
  mock_segment: "Quick mock segment",
};

export function MissionCard() {
  const navigate = useNavigate();
  const [mission, setMission] = useState<Mission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/missions/today", { method: "POST" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const m = (await r.json()) as Mission;
        setMission(m);
        track("mission.shown", { kind: m.kind, status: m.status });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load today's mission");
      }
    })();
  }, []);

  async function start() {
    if (!mission || busy) return;
    setBusy(true);
    try {
      await auth.fetch(`/api/v1/missions/${mission.id}/start`, { method: "POST" });
      track("mission.started", { id: mission.id, kind: mission.kind });
      // Route based on the primary CTA action
      const cta = mission.primary_cta;
      if (cta.action === "start_quiz" && cta.topic_id) {
        navigate(`/catalog/topic/${cta.topic_id}`);
      } else if (cta.action === "start_revision") {
        navigate("/revision");
      } else if (cta.action === "start_mock_segment") {
        navigate("/mocks");
      } else {
        navigate("/catalog");
      }
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!mission) return;
    try {
      await auth.fetch(`/api/v1/missions/${mission.id}/skip`, { method: "POST" });
      track("mission.skipped", { id: mission.id, kind: mission.kind });
      navigate("/catalog");
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <section style={{ ...cardStyle, opacity: 0.6 }}>
        <div style={eyebrow}>✦ TODAY'S MISSION</div>
        <p style={{ marginTop: 8, color: "var(--text-secondary, #B8C5E0)", fontSize: 13 }}>
          {error}. Try refreshing.
        </p>
      </section>
    );
  }

  if (!mission) {
    return (
      <section style={cardStyle}>
        <div style={eyebrow}>✦ TODAY'S MISSION</div>
        <div style={{ marginTop: 12, height: 16, width: "60%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
        <div style={{ marginTop: 8, height: 12, width: "40%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
      </section>
    );
  }

  const isCompleted = mission.status === "completed";
  const isSkipped = mission.status === "skipped";

  return (
    <section style={cardStyle} aria-label="Today's Mission">
      <div style={eyebrow}>✦ TODAY'S MISSION</div>
      <h2 style={titleStyle}>{KIND_TITLES[mission.kind] || mission.kind}</h2>
      <p style={metaStyle}>
        {mission.expected_minutes} min · {mission.expected_questions} questions
        {mission.primary_cta?.intent && (
          <>
            {" · "}
            <span style={{ color: "var(--color-blue, #4F87F6)" }}>
              {mission.primary_cta.intent === "match" ? "Match your level"
                : mission.primary_cta.intent === "push" ? "Push yourself"
                : "Build confidence"}
            </span>
          </>
        )}
      </p>
      <div style={whyBlockStyle}>
        <div style={whyEyebrow}>Why picked</div>
        <p style={whyText}>{mission.why_picked}</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {!isCompleted && !isSkipped && (
          <>
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="btn btn-primary"
              style={{ minWidth: 140 }}
            >
              {busy ? "Starting…" : "Start mission →"}
            </button>
            <button
              type="button"
              onClick={skip}
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
            >
              Not today — pick yourself
            </button>
          </>
        )}
        {isCompleted && (
          <span style={{ color: "var(--color-green, #10C47A)", fontSize: 13 }}>
            ✓ Mission complete — see you tomorrow.
          </span>
        )}
        {isSkipped && (
          <span style={{ color: "var(--text-faint, #7A8BAD)", fontSize: 13 }}>
            Skipped for today. New mission tomorrow.
          </span>
        )}
      </div>
      {mission.why_picked_source === "ai" && (
        <div
          style={{
            marginTop: 12, fontSize: 10,
            color: "var(--text-faint, #7A8BAD)",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          ✨ AI-personalised
        </div>
      )}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 20,
  background:
    "linear-gradient(135deg, rgba(34,212,238,0.08), rgba(79,135,246,0.04))",
  border: "1px solid rgba(34,212,238,0.25)",
  borderRadius: 12,
  marginBottom: 20,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
  color: "var(--color-ai, #22D4EE)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600,
  color: "var(--text-primary, #EEF2FF)",
  margin: "8px 0 4px",
  lineHeight: 1.35,
};

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary, #B8C5E0)",
  margin: 0,
};

const whyBlockStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "rgba(0,0,0,0.2)",
  borderRadius: 6,
  borderLeft: "2px solid var(--color-ai, #22D4EE)",
};

const whyEyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
  color: "var(--text-faint, #7A8BAD)",
  marginBottom: 4,
};

const whyText: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5,
  color: "var(--text-secondary, #B8C5E0)",
  margin: 0,
};
