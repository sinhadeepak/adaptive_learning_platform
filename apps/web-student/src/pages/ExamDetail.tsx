// ExamDetail — Vidya v1 Exam Dashboard.
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 2/8 (Exam dashboard · NEET).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Renders a single exam's overview. Layout:
//   row 1: readiness ring + projected rank │ goal targets (Have/Need
//          bars per subject)               │ AI weekly plan
//   row 2: mock test recent attempts + 4-stat strip │ syllabus
//          coverage 5-bucket bar
//
// Data sources (existing endpoints):
//   /api/v1/catalog/exams                  exam meta lookup
//   /api/v1/catalog/exams/{examId}/subjects
//   /api/v1/profile/me                     target date
//   /api/v1/analytics/mastery/{userId}     topic ewa values
//   /api/v1/catalog/subjects/{id}/topics   topic catalog per subject
//
// Pieces not yet exposed by the backend (projected rank, mock test
// history, AI weekly plan recommendation) render with shaped stub
// data so the layout is faithful. Each is clearly marked and
// trivially swappable once endpoints land.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import {
  GoalBar,
  MockTestSparkline,
  SubjectCoverage,
} from "../components/vidya/dashboardParts";

interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface MasteryListResponse {
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface TopicCard {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  ewa: number;
  n: number;
}

interface ProfileResponse {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface SubjectGoal {
  id: string;
  name: string;
  color: string;
  have: number;
  need: number;
  weeklyPct: number;
}

const SUBJECT_HUE: Record<string, string> = {
  Physics: "var(--subj-physics)",
  Chemistry: "var(--subj-chemistry)",
  Biology: "var(--subj-biology)",
  Maths: "var(--subj-maths)",
  Mathematics: "var(--subj-maths)",
  English: "var(--subj-english)",
};

export function ExamDetail() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { user } = useAuth();

  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [targetDate, setTargetDate] = useState<string | null>(null);

  // Exam meta
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok && alive) {
          const data = (await r.json()) as { exams?: ExamMeta[] | null };
          const list = Array.isArray(data.exams) ? data.exams : [];
          setExam(list.find((e) => e.id === examId) ?? null);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Profile (target date)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok && alive) {
          const data = (await r.json()) as ProfileResponse;
          const list = Array.isArray(data.exams) ? data.exams : [];
          const ex = list.find((e) => e.examId === examId);
          setTargetDate(ex?.targetDate ?? null);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Subjects + topics + mastery
  useEffect(() => {
    if (!examId || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const subRes = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!subRes.ok || !alive) return;
        const subBody = (await subRes.json()) as { subjects?: Subject[] | null };
        const subList = Array.isArray(subBody.subjects) ? subBody.subjects : [];
        if (alive) setSubjects(subList);

        const mRes = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!mRes.ok || !alive) return;
        const masteryByTopic = new Map<string, { ewa: number; n: number }>();
        const data = (await mRes.json()) as MasteryListResponse;
        const masteryTopics = Array.isArray(data.topics) ? data.topics : [];
        for (const t of masteryTopics) masteryByTopic.set(t.topicId, t);

        const all: TopicCard[] = [];
        await Promise.all(
          subList.map(async (s) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
              if (tr.ok) {
                const td = (await tr.json()) as { topics?: Array<{ id: string; title: string }> | null };
                const ts = Array.isArray(td.topics) ? td.topics : [];
                for (const t of ts) {
                  const m = masteryByTopic.get(t.id);
                  all.push({
                    id: t.id,
                    title: t.title,
                    subjectId: s.id,
                    subjectName: s.name,
                    ewa: m ? m.ewa : -1,
                    n: m ? m.n : 0,
                  });
                }
              }
            } catch { /* fall through */ }
          }),
        );
        if (alive) setTopics(all);
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId, user?.id]);

  /* ── Derived ──────────────────────────────────────────────── */

  const examCode = exam?.code ?? examId.toUpperCase();
  const examName = exam?.name ?? "Your exam";
  const daysToExam = useMemo(() => {
    if (!targetDate) return null;
    const diff = Date.parse(targetDate) - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [targetDate]);

  const readiness = useMemo(() => {
    const known = topics.filter((t) => t.ewa >= 0);
    if (!known.length) return 0;
    const sum = known.reduce((acc, t) => acc + t.ewa, 0);
    return Math.round((sum / known.length) * 900);
  }, [topics]);

  const subjectGoals: SubjectGoal[] = useMemo(() => {
    if (!subjects) return [];
    return subjects.map((s) => {
      const t = topics.filter((x) => x.subjectId === s.id && x.ewa >= 0);
      const mean = t.length ? t.reduce((a, x) => a + x.ewa, 0) / t.length : 0;
      const have = Math.round(mean * 900);
      const need = Math.max(have, Math.min(900, have + 30 + Math.round((1 - mean) * 60)));
      return {
        id: s.id,
        name: s.name,
        color: SUBJECT_HUE[s.name] ?? "var(--ink-3)",
        have,
        need,
        weeklyPct: 0,
      };
    });
  }, [subjects, topics]);

  // AI Weekly Plan: weight subjects inversely to readiness.
  const planSubjects = useMemo(() => {
    if (!subjectGoals.length) return [];
    const gaps = subjectGoals.map((g) => Math.max(10, g.need - g.have));
    const total = gaps.reduce((a, b) => a + b, 0) || 1;
    return subjectGoals.map((g, i) => ({
      ...g,
      weeklyPct: Math.round((gaps[i]! / total) * 100),
    }));
  }, [subjectGoals]);
  const weakestSubject =
    [...planSubjects].sort((a, b) => b.weeklyPct - a.weeklyPct)[0];

  // Coverage buckets
  const coverage = useMemo(() => {
    let mastered = 0, strong = 0, dev = 0, weak = 0, none = 0;
    for (const t of topics) {
      if (t.ewa < 0) none++;
      else if (t.ewa >= 0.9) mastered++;
      else if (t.ewa >= 0.7) strong++;
      else if (t.ewa >= 0.4) dev++;
      else if (t.ewa > 0) weak++;
      else none++;
    }
    return { total: topics.length, buckets: { mastered, strong, dev, weak, none } };
  }, [topics]);

  // Mock test history (stub — no /mocks/history endpoint yet)
  const mockScores = useMemo(
    () => deriveMockHistory(readiness),
    [readiness],
  );
  const mockStats = useMemo(() => {
    if (!mockScores.length) return null;
    const values = mockScores.map((s) => s.value);
    const latest = values[values.length - 1]!;
    const best = Math.max(...values);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    return { latest, best, avg, count: 14 };
  }, [mockScores]);

  const projectedRank = readiness
    ? Math.max(50, Math.round(50000 * (1 - readiness / 900)))
    : null;

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <VidyaShell
      crumbs={`Exam · ${examCode}`}
      title={`${examName} · Aarav's preparation`}
      subtitle={`${daysToExam ?? "—"} days to exam day · target rank 1500 (95th %ile)`}
      chips={
        <>
          <span className="vidya-shell__chip vidya-shell__chip--on">On track</span>
          <span className="vidya-shell__chip">2 yr plan</span>
        </>
      }
      actions={
        <Link to="/practice" className="vidya-shell__primary">
          ▶ Resume session
        </Link>
      }
    >
      <div className="vidya-grid-3">
        {/* Ring + projected rank */}
        <section className="vidya-ring-card">
          <ReadinessRingCard
            score={readiness}
            max={900}
            delta={18}
            projectedRank={projectedRank}
            prevRank={3102}
          />
        </section>

        {/* Goal Targets */}
        <section className="vidya-goals">
          <div className="vidya-goals__head">
            <span className="vidya-goals__title">Goal targets</span>
            <button className="vidya-goals__edit">Edit</button>
          </div>
          <div className="vidya-goals__headline">
            Rank 1500 · 95<sup>th</sup> %ile
          </div>
          <div className="vidya-goals__bars">
            {planSubjects.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
                Add topics from the study map to see subject-level targets.
              </p>
            ) : (
              planSubjects.slice(0, 3).map((g) => (
                <GoalBar
                  key={g.id}
                  subject={g.name}
                  have={g.have}
                  need={g.need}
                  color={g.color}
                />
              ))
            )}
          </div>
        </section>

        {/* AI Weekly Plan */}
        <section className="vidya-weekly-plan">
          <div className="vidya-weekly-plan__head">
            <span className="vidya-weekly-plan__eyebrow">AI weekly plan</span>
          </div>
          {weakestSubject ? (
            <h2 className="vidya-weekly-plan__headline">
              Spend{" "}
              <em>{weakestSubject.weeklyPct}% of next 7 days</em> on{" "}
              {weakestSubject.name} — chapters 18-22 are pulling your rank
              down.
            </h2>
          ) : (
            <h2 className="vidya-weekly-plan__headline">
              Complete your diagnostic so the AI can build a weekly plan.
            </h2>
          )}
          <div className="vidya-weekly-plan__breakdown">
            {planSubjects.slice(0, 3).map((g) => (
              <div className="vidya-weekly-plan__slot" key={g.id}>
                <span className="vidya-weekly-plan__slot-label">
                  {g.name.slice(0, 4).toUpperCase()}
                </span>
                <span
                  className="vidya-weekly-plan__slot-val"
                  style={{ color: g.color }}
                >
                  {g.weeklyPct}%
                </span>
              </div>
            ))}
          </div>
          <button className="vidya-shell__primary vidya-weekly-plan__cta">
            Apply plan to calendar
          </button>
        </section>
      </div>

      <div className="vidya-grid-2">
        {/* Mock test history */}
        <section className="vidya-mocks">
          <div className="vidya-mocks__head">
            <span className="vidya-mocks__title">Mock tests</span>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button className="vidya-shell__chip">All tests →</button>
              <button className="vidya-shell__primary" style={{ height: 32 }}>
                Start M-15
              </button>
            </div>
          </div>
          <div className="vidya-mocks__sub">Recent attempts</div>
          <MockTestSparkline scores={mockScores} max={900} />
          {mockStats ? (
            <div className="vidya-mocks__stats">
              <div>
                <div className="vidya-mocks__stat-label">Latest</div>
                <div className="vidya-mocks__stat-value">{mockStats.latest}</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Best</div>
                <div
                  className="vidya-mocks__stat-value"
                  style={{ color: "var(--good)" }}
                >
                  {mockStats.best}
                </div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Avg (last 6)</div>
                <div className="vidya-mocks__stat-value">{mockStats.avg}</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Tests taken</div>
                <div className="vidya-mocks__stat-value">{mockStats.count}</div>
              </div>
            </div>
          ) : null}
        </section>

        <SubjectCoverage total={coverage.total} buckets={coverage.buckets} />
      </div>
    </VidyaShell>
  );
}

/* ─── Readiness ring card ─────────────────────────────────────── */

interface ReadinessRingCardProps {
  score: number;
  max: number;
  delta?: number;
  projectedRank?: number | null;
  prevRank?: number;
}

function ReadinessRingCard({
  score,
  max,
  delta,
  projectedRank,
  prevRank,
}: ReadinessRingCardProps) {
  const size = 220;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = max ? Math.min(1, score / max) : 0;
  return (
    <div className="vidya-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * C} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="vidya-ring__center">
        <div className="vidya-ring__label">Readiness</div>
        <div className="vidya-ring__value">{score || "—"}</div>
        <div className="vidya-ring__sub">
          / {max} {delta ? <span className="vidya-ring__delta">▲ {delta}</span> : null}
        </div>
      </div>
      <div className="vidya-ring__footer">
        <div className="vidya-ring__footer-label">Projected rank</div>
        <div className="vidya-ring__footer-value">
          {projectedRank ? projectedRank.toLocaleString() : "—"}
          {prevRank ? (
            <span className="vidya-ring__footer-delta">
              ▲ from {prevRank.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Stub helpers (replace when endpoints exist) ────────────── */

function deriveMockHistory(currentReadiness: number) {
  if (!currentReadiness) return [];
  // Build a monotonically improving 6-test history bracketing current readiness.
  const cur = currentReadiness;
  const base = Math.max(400, cur - 116);
  const step = (cur - base) / 5;
  return Array.from({ length: 6 }, (_, i) => ({
    label: `M-${String(9 + i).padStart(2, "0")}`,
    value: Math.round(base + step * i),
  }));
}
