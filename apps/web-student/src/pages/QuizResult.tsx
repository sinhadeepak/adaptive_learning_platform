import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────────
// Practice Results — React port of
// docs/ui/01_StudentPortal_Web/09_practice-results.html.
//
// Six zones (top to bottom):
//   1. AI score hero — gradient panel with topic link, status pill,
//      AI-generated headline, sub-text contextual to the score, primary
//      "Practice again" CTA, and a big readiness-style score ring.
//   2. Stat tiles row — Correct (N/M) · Mode · Strategy · Accuracy.
//   3. AI breakdown card — numbered insight items derived from results.
//   4. Mastery delta card — pre→post EWA bump for this topic.
//   5. AI recommends-next banner — only when there's a clear suggestion.
//   6. Item review grid — each Q as a compact card (color-coded).
//   7. Footer action row.
// ─────────────────────────────────────────────────────────────────────────

interface ItemSummary {
  itemIdx: number;
  questionId: string;
  answerIdx?: number;
  isCorrect?: boolean;
  answered: boolean;
}

interface SessionDetail {
  sessionId: string;
  userId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  strategy: "irt" | "binary_search";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  targetCount: number;
  servedCount: number;
  correctCount: number;
  items: ItemSummary[];
}

interface Topic {
  id: string;
  title: string;
  subjectId: string;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

export function QuizResult() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [mastery, setMastery] = useState<{ ewa: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
        if (!r.ok) {
          setError(
            r.status === 404 ? "Session not found." : "We couldn't load your results.",
          );
          return;
        }
        const body = (await r.json()) as SessionDetail;
        setSession(body);
        try {
          const t = await auth.fetch(`/api/v1/catalog/topics/${body.topicId}`);
          if (t.ok) setTopic((await t.json()) as Topic);
        } catch {
          /* swallow */
        }
      } catch {
        setError("We couldn't load your results.");
      }
    })();
  }, [sessionId]);

  // Fetch user's current per-topic mastery for the delta card.
  useEffect(() => {
    if (!user || !session) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) return;
        const body = (await r.json()) as MasteryListResponse;
        const m = body.topics.find((t) => t.topicId === session.topicId);
        if (m) setMastery({ ewa: m.ewa, n: m.n });
      } catch {
        /* swallow */
      }
    })();
  }, [user, session]);

  if (error) {
    return (
      <AppShell title="Practice result">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate("/catalog")}
        >
          Back to catalog
        </button>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Practice result">
        <SkeletonRows count={2} />
      </AppShell>
    );
  }

  const total = session.servedCount;
  const correct = session.correctCount;
  const wrong = session.items.filter((i) => i.answered && !i.isCorrect).length;
  const skipped = session.items.filter((i) => !i.answered).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const bucket = pct >= 80 ? "strong" : pct >= 50 ? "developing" : "weak";
  const isExpired = session.status === "EXPIRED";

  const headline = isExpired
    ? "Session expired"
    : pct >= 80
      ? "Strong run."
      : pct >= 50
        ? "Decent — room to push."
        : "Keep going — these will click.";

  const sub = isExpired
    ? "The session timed out. Your answered items are still recorded."
    : pct >= 80
      ? `You answered ${correct} of ${total} correctly. Lock it in with a mock test.`
      : pct >= 50
        ? `You answered ${correct} of ${total} correctly. Drill the misses below to push to the strong band.`
        : `You answered ${correct} of ${total} correctly. Short focused rounds on the weak items below will move readiness most.`;

  // Mastery delta: synthesise the "before" using a small adjustment so
  // the post value matches the live mastery EWA pulled from analytics.
  const masteryNowPct = mastery ? Math.round(mastery.ewa * 100) : null;
  // Approximate the pre-session value: assume this session's accuracy
  // shifts mastery by EWA's α (~0.4) — so before = (now − α*sessionPct) / (1−α).
  // Bounded to [0, 100]. If we have no current mastery yet, no delta.
  const masteryWasPct =
    masteryNowPct !== null && total > 0
      ? Math.max(0, Math.min(100, Math.round((masteryNowPct - 0.4 * pct) / 0.6)))
      : null;
  const masteryDelta =
    masteryNowPct !== null && masteryWasPct !== null
      ? masteryNowPct - masteryWasPct
      : null;

  // Build AI-breakdown insights from the items array.
  const insights = buildInsights({
    correct,
    wrong,
    skipped,
    total,
    pct,
    isExpired,
    items: session.items,
    topicTitle: topic?.title,
  });

  // Time-to-result: synth — Quiz Service doesn't surface elapsed yet.
  const minsPerQ = total > 0 ? Math.max(1, Math.round((total * 35) / 60)) : null;

  return (
    <AppShell
      title="Practice result"
      actions={
        <Link to="/catalog" className="topbar-back">
          ← Catalog
        </Link>
      }
    >
      {/* ── Zone 1: AI score hero ───────────────────────────────── */}
      <section className="ai-header" aria-label="Practice result">
        <div className="ai-header-left">
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <span className="ai-pill">◈ AI PRACTICE RESULT</span>
            {topic ? (
              <Link
                to={`/catalog/topic/${topic.id}`}
                className="auth-link"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {topic.title}
              </Link>
            ) : null}
            <Pill tone={isExpired ? "danger" : pct >= 80 ? "success" : pct >= 50 ? "warning" : "info"}>
              {isExpired ? "Expired" : "Submitted"}
            </Pill>
          </div>
          <h1 className="ai-header-name">{headline}</h1>
          <p className="ai-header-sub">{sub}</p>
          <div className="ai-header-btns">
            <button
              type="button"
              className="btn-ai"
              onClick={() => topic && navigate(`/catalog/topic/${topic.id}`)}
              disabled={!topic}
            >
              ◈ Practice this topic again
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate("/catalog")}
            >
              Back to catalog →
            </button>
          </div>
        </div>
        <div className="ai-header-stats" style={{ alignItems: "center" }}>
          <ScoreRing pct={pct} bucket={bucket} />
        </div>
      </section>

      {/* ── Zone 2: Stat tiles ──────────────────────────────────── */}
      <section
        className="topic-stats"
        aria-label="Result stats"
        style={{ marginTop: "var(--sp-4)" }}
      >
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-green)" }}>
            {correct}
            <span style={{ color: "var(--text-faint)", fontSize: 14, fontWeight: 500 }}>
              /{total}
            </span>
          </div>
          <div className="topic-stat-lbl">Correct</div>
          <div className="topic-stat-foot">
            {wrong > 0 ? `${wrong} wrong` : "perfect run"}
            {skipped > 0 ? ` · ${skipped} skipped` : ""}
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{
              color:
                bucket === "strong"
                  ? "var(--color-green)"
                  : bucket === "developing"
                    ? "var(--color-amber)"
                    : "var(--color-red)",
            }}
          >
            {pct}%
          </div>
          <div className="topic-stat-lbl">Score</div>
          <div className="topic-stat-foot">
            {bucket === "strong"
              ? "Strong band"
              : bucket === "developing"
                ? "Developing band"
                : "Weak band"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-blue)" }}>
            {session.mode === "MOCK" ? "Mock" : "Practice"}
          </div>
          <div className="topic-stat-lbl">Mode</div>
          <div className="topic-stat-foot">
            {session.strategy === "irt" ? "Adaptive (IRT)" : "Linear"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-ai)" }}>
            ~{minsPerQ ?? "—"}m
          </div>
          <div className="topic-stat-lbl">Time taken</div>
          <div className="topic-stat-foot">
            est. ~35s per question
          </div>
        </div>
      </section>

      {/* ── Zones 3 + 4: AI breakdown + Mastery delta (2-col below 1100px) ── */}
      <div
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)" }}
      >
        {/* Zone 3: AI breakdown */}
        {insights.length > 0 ? (
          <div className="insight-card">
            <div className="ins-eyebrow">
              <span>◈</span> AI BREAKDOWN · this session
            </div>
            {insights.map((text, i) => (
              <div key={i} className="ins-item">
                <div className="ins-num">{i + 1}</div>
                <div
                  className="ins-text"
                  dangerouslySetInnerHTML={{ __html: text }}
                />
              </div>
            ))}
          </div>
        ) : null}

        {/* Zone 4: Mastery delta */}
        {masteryNowPct !== null && masteryWasPct !== null ? (
          <div className="mastery-delta-card">
            <div style={{ flex: "0 0 auto", minWidth: 180 }}>
              <div className="md-label">{topic?.title ?? "Topic"} mastery</div>
              <div className="md-pair" style={{ marginTop: 6 }}>
                <span className="md-was">{masteryWasPct}%</span>
                <span className="md-arrow">→</span>
                <span
                  className="md-now"
                  style={{
                    color:
                      masteryDelta && masteryDelta > 0
                        ? "var(--color-green)"
                        : masteryDelta && masteryDelta < 0
                          ? "var(--color-red)"
                          : "var(--text-muted)",
                  }}
                >
                  {masteryNowPct}%
                </span>
                {masteryDelta !== null ? (
                  <span
                    className={`md-delta-badge ${
                      masteryDelta > 0
                        ? "md-delta-up"
                        : masteryDelta < 0
                          ? "md-delta-down"
                          : "md-delta-flat"
                    }`}
                  >
                    {masteryDelta > 0 ? "▲" : masteryDelta < 0 ? "▼" : "•"} {Math.abs(masteryDelta)} pts
                  </span>
                ) : null}
              </div>
            </div>
            <p className="md-text">
              {masteryDelta !== null && masteryDelta > 0 ? (
                <>
                  Your <strong>{topic?.title ?? "topic"}</strong> mastery moved from{" "}
                  <strong>{masteryWasPct}%</strong> to <strong>{masteryNowPct}%</strong>.
                  Keep this cadence — short rounds compound.
                </>
              ) : masteryDelta !== null && masteryDelta < 0 ? (
                <>
                  Mastery dipped this session — every learner has these. The IRT
                  engine will pick easier items next time to rebuild signal.
                </>
              ) : (
                <>
                  Mastery held steady this session. The next session will pick
                  items closer to your edge to push the score up.
                </>
              )}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Zone 5: AI recommends next ──────────────────────────── */}
      {!isExpired && pct < 80 && topic ? (
        <Link
          to={`/catalog/topic/${topic.id}`}
          className="reco-banner"
          style={{ marginTop: "var(--sp-4)" }}
        >
          <div className="reco-icon">⚡</div>
          <div className="reco-body">
            <div className="reco-eyebrow">◈ AI RECOMMENDS · NEXT</div>
            <div className="reco-title">
              Run another round on {topic.title} — focus on the misses below
            </div>
            <div className="reco-sub">
              You hit {pct}% this session. The IRT engine will pick items at
              your edge of difficulty so you stretch without thrashing.
            </div>
            <div className="reco-impact">
              ▲ Est. +{Math.max(2, Math.round((100 - pct) / 20))} readiness pts ·
              ~10 minutes
            </div>
          </div>
          <span className="btn-ai" style={{ flexShrink: 0 }}>
            Practice again →
          </span>
        </Link>
      ) : null}

      {/* ── Zone 6: Item review grid ────────────────────────────── */}
      <section style={{ marginTop: "var(--sp-5)" }}>
        <div className="sec-row">
          <h2 className="section-heading">Item review</h2>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            tap any item to revisit (when content lands)
          </span>
        </div>
        <ol className="item-review-grid">
          {session.items.map((it) => {
            const cls = it.answered
              ? it.isCorrect
                ? "item-review-card item-review-card-correct"
                : "item-review-card item-review-card-wrong"
              : "item-review-card item-review-card-skipped";
            return (
              <li key={it.itemIdx} className={cls}>
                <span className="item-review-num">Q{it.itemIdx + 1}</span>
                <div className="item-review-body">
                  <div className="item-review-title">
                    {it.answered ? (
                      it.isCorrect ? (
                        <Pill tone="success">Correct</Pill>
                      ) : (
                        <Pill tone="danger">Incorrect</Pill>
                      )
                    ) : (
                      <Pill tone="muted">Skipped</Pill>
                    )}
                  </div>
                  <div className="item-review-meta">
                    {it.answered && it.answerIdx !== undefined
                      ? `Picked ${String.fromCharCode(65 + it.answerIdx)} · `
                      : ""}
                    #{it.questionId.slice(0, 8)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </AppShell>
  );
}

// Big score ring (right side of hero).
function ScoreRing({ pct, bucket }: { pct: number; bucket: "strong" | "developing" | "weak" }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const stroke =
    bucket === "strong" ? "#10C47A" : bucket === "developing" ? "#F5A623" : "#F43F5E";
  return (
    <div
      style={{
        position: "relative",
        width: 110,
        height: 110,
        flexShrink: 0,
      }}
      role="img"
      aria-label={`Score ${pct}%`}
    >
      <svg viewBox="0 0 100 100" width="110" height="110">
        <defs>
          <linearGradient id="result-rg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} />
            <stop offset="100%" stopColor="#22D4EE" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#result-rg)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: stroke,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {pct}%
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--text-faint)",
            letterSpacing: 0.4,
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          score
        </div>
      </div>
    </div>
  );
}

function buildInsights(args: {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  pct: number;
  isExpired: boolean;
  items: ItemSummary[];
  topicTitle?: string;
}): string[] {
  const out: string[] = [];
  const { correct, wrong, skipped, total, pct, isExpired, items, topicTitle } = args;

  if (isExpired) {
    out.push(
      `<strong>Session expired</strong> with ${correct}/${total} answered. Start a fresh session to keep momentum — the IRT engine still has all your prior data.`,
    );
    return out;
  }

  // Streak detection — longest correct run.
  let curStreak = 0;
  let maxStreak = 0;
  let curWrongStreak = 0;
  let maxWrongStreak = 0;
  items.forEach((it) => {
    if (it.answered && it.isCorrect) {
      curStreak++;
      curWrongStreak = 0;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else if (it.answered && !it.isCorrect) {
      curWrongStreak++;
      curStreak = 0;
      if (curWrongStreak > maxWrongStreak) maxWrongStreak = curWrongStreak;
    } else {
      curStreak = 0;
      curWrongStreak = 0;
    }
  });

  if (pct >= 80) {
    out.push(
      `<strong>Strong run on ${topicTitle ?? "this topic"}.</strong> You're in the top band — try a mock test to lock it in.`,
    );
  } else if (pct >= 50) {
    out.push(
      `<strong>${pct}% — developing band.</strong> A few focused rounds on the misses below will push you to the strong band.`,
    );
  } else {
    out.push(
      `<strong>${pct}% on ${topicTitle ?? "this topic"}.</strong> The misses below are the highest-leverage items right now.`,
    );
  }

  if (maxStreak >= 3) {
    out.push(
      `<strong>${maxStreak}-question correct streak</strong> — your concept recall is sticky. Keep cadence to push mastery.`,
    );
  }

  if (maxWrongStreak >= 3) {
    out.push(
      `<strong>${maxWrongStreak} wrong in a row</strong> — usually a concept gap, not noise. Worth a quick review of that section.`,
    );
  }

  if (skipped > 0) {
    out.push(
      `<strong>${skipped} skipped item${skipped === 1 ? "" : "s"}</strong> — partial sessions don't build mastery as fast. Aim to finish the next round.`,
    );
  }

  if (wrong > 0 && pct < 80) {
    out.push(
      `<strong>Practice again with the IRT engine</strong> — items at your edge of difficulty move readiness most per minute.`,
    );
  }

  return out.slice(0, 4);
}
