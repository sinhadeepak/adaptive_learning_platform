// Analysis — Vidya v1 My Analysis (mockup 6/8).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 6/8 (My analysis).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: INSIGHT · MY ANALYSIS / "My analysis" / Last 30d / All ┐
//   │  ┌── topic-level mastery heatmap (rows: topics, cols: dims) ──┐
//   │  └──────────────────────────────────────────────────────────────┘
//   │  ┌── best time of day ─┐ ┌── mistake patterns ─┐ ┌─ Your edge ─┐
//   │  └─────────────────────┘ └─────────────────────┘ └─────────────┘
//
// Data: /api/v1/profile/me + /api/v1/analytics/mastery (topic rows).
// The 7-dimension breakdown (recall / apply / analyze / mcq /
// numeric / concept / speed) is synthesized from each topic's ewa
// until /analytics/dimensions ships. Mistake-patterns + best-time-
// of-day metrics are Vidya v1 design surfaces pending dedicated
// endpoints.

import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
}

interface MasteryListResponse {
  topics?: Array<{ topicId: string; ewa: number; n: number }> | null;
}

interface ProfileResponse {
  exams?: Array<{ examId: string; targetDate: string | null }> | null;
}

interface TopicCell {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  ewa: number;
  n: number;
}

const DIMENSIONS = [
  "Recall",
  "Apply",
  "Analyze",
  "MCQ",
  "Numeric",
  "Concept",
  "Speed",
] as const;

export function Analysis() {
  const { user } = useAuth();
  const [examId, setExamId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<TopicCell[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"30d" | "all">("30d");

  // Profile → pick first enrolled exam
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (!r.ok || !alive) return;
        const data = (await r.json()) as ProfileResponse;
        const enrolled = Array.isArray(data.exams) ? data.exams : [];
        if (alive) setExamId(enrolled[0]?.examId ?? null);
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, []);

  // Subjects + topics + mastery
  useEffect(() => {
    if (!examId || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const sr = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!sr.ok || !alive) return;
        const sBody = (await sr.json()) as { subjects?: Subject[] | null };
        const subs = Array.isArray(sBody.subjects) ? sBody.subjects : [];
        if (alive) {
          setSubjects(subs);
          setActiveSubjectId((cur) => cur ?? subs[0]?.id ?? null);
        }

        const mr = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        const masteryMap = new Map<string, { ewa: number; n: number }>();
        if (mr.ok) {
          const mb = (await mr.json()) as MasteryListResponse;
          const ts = Array.isArray(mb.topics) ? mb.topics : [];
          for (const t of ts) masteryMap.set(t.topicId, t);
        }

        const all: TopicCell[] = [];
        await Promise.all(
          subs.map(async (s) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
              if (tr.ok) {
                const td = (await tr.json()) as { topics?: Topic[] | null };
                const ts = Array.isArray(td.topics) ? td.topics : [];
                for (const t of ts) {
                  const m = masteryMap.get(t.id);
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

  const visibleTopics = useMemo(() => {
    const list = activeSubjectId
      ? topics.filter((t) => t.subjectId === activeSubjectId)
      : topics;
    return list.slice(0, 8);
  }, [topics, activeSubjectId]);

  const heatmap = useMemo(() => buildHeatmap(visibleTopics), [visibleTopics]);

  return (
    <VidyaShell
      crumbs="Insight · My analysis"
      title="My analysis"
      subtitle="Diagnostic mode — what's working, what isn't, what to do next"
      chips={
        <>
          <button
            className={`vidya-shell__chip${period === "30d" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setPeriod("30d")}
          >
            Last 30 days
          </button>
          <button
            className={`vidya-shell__chip${period === "all" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setPeriod("all")}
          >
            All time
          </button>
        </>
      }
      actions={<button className="vidya-shell__chip">⬇ Export</button>}
    >
      <section className="vidya-heat-card">
        <div className="vidya-heat-card__head">
          <div>
            <div className="vidya-heat-card__eyebrow">
              Topic-level mastery · {subjects.find((s) => s.id === activeSubjectId)?.name ?? "Subject"}
            </div>
            <div className="vidya-heat-card__title">The truth, topic by topic</div>
          </div>
          <div className="vidya-heat-card__chips">
            {subjects.map((s) => (
              <button
                key={s.id}
                className={`vidya-shell__chip${s.id === activeSubjectId ? " vidya-shell__chip--on" : ""}`}
                onClick={() => setActiveSubjectId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div
          className="vidya-heat-grid"
          role="img"
          aria-label="Topic-level mastery heatmap"
          style={{
            gridTemplateColumns: `minmax(140px, 1fr) repeat(${DIMENSIONS.length}, 1fr)`,
          }}
        >
          <div className="vidya-heat-grid__corner" />
          {DIMENSIONS.map((d) => (
            <div className="vidya-heat-grid__col-head" key={d}>
              {d}
            </div>
          ))}
          {visibleTopics.length === 0 ? (
            <div
              className="vidya-heat-grid__empty"
              style={{ gridColumn: `1 / span ${DIMENSIONS.length + 1}` }}
            >
              Start a few sessions to populate the mastery matrix.
            </div>
          ) : (
            visibleTopics.map((t, ri) => (
              <Row key={t.id} title={t.title} values={heatmap[ri]!} />
            ))
          )}
        </div>
      </section>

      <div className="vidya-grid-3">
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">Best time of day</span>
          </div>
          <div className="vidya-tod" aria-hidden>
            {TIME_OF_DAY.map((h, i) => (
              <span
                key={i}
                className={`vidya-tod__bar${h.peak ? " vidya-tod__bar--peak" : ""}`}
                style={{ height: `${10 + h.value * 70}px` }}
                title={`${h.label} · ${Math.round(h.value * 100)}%`}
              />
            ))}
          </div>
          <div className="vidya-tod__axis">
            <span>00:00</span>
            <span>12:00</span>
            <span>24:00</span>
          </div>
          <p className="vidya-tod__caption">
            You peak at <strong>4-5 PM</strong> and <strong>8 PM</strong>.{" "}
            <a href="/plan">Schedule weak-topic work here.</a>
          </p>
        </section>

        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">Mistake patterns</span>
          </div>
          <ul className="vidya-mistakes">
            {MISTAKE_PATTERNS.map((m) => (
              <li key={m.label}>
                <span className="vidya-mistakes__label">{m.label}</span>
                <span className="vidya-mistakes__bar">
                  <span
                    className="vidya-mistakes__fill"
                    style={{ width: `${m.pct}%`, background: m.color }}
                  />
                </span>
                <span className="vidya-mistakes__pct">{m.pct}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="vidya-edge">
          <div className="vidya-edge__eyebrow">Your edge</div>
          <h2 className="vidya-edge__headline">
            You answer <em>32% faster</em> than your percentile cohort on
            numerical questions.
          </h2>
          <p className="vidya-edge__body">
            But you spend <strong>2× longer</strong> on conceptual reasoning. The
            gap is widening on Biology.
          </p>
          <button className="vidya-edge__cta">See full report</button>
        </section>
      </div>

      <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: "var(--sp-6)" }}>
        Per-dimension scores are synthesized from each topic's ewa until
        /analytics/dimensions ships; mistake-pattern and best-time-of-day
        metrics are Vidya v1 design surfaces pending dedicated endpoints.
      </div>
    </VidyaShell>
  );
}

function Row({ title, values }: { title: string; values: number[] }) {
  return (
    <>
      <div className="vidya-heat-grid__row-head" title={title}>
        {title}
      </div>
      {values.map((v, i) => {
        const bucket = heatBucket(v);
        return (
          <div
            key={i}
            className={`vidya-heat-grid__cell vidya-heat-grid__cell--${bucket}`}
            title={`${title} · ${Math.round(v)}`}
          >
            {Math.round(v)}
          </div>
        );
      })}
    </>
  );
}

function buildHeatmap(rows: TopicCell[]): number[][] {
  return rows.map((t, ri) => {
    const base = Math.max(0, t.ewa) * 100;
    return DIMENSIONS.map((_, di) => {
      const seed = (ri * 7 + di * 13) % 17;
      const offset = (seed - 8) * 1.6;
      return Math.max(0, Math.min(100, Math.round(base + offset)));
    });
  });
}

type Bucket = "good" | "ok" | "mid" | "weak" | "bad";

function heatBucket(value: number): Bucket {
  if (value >= 80) return "good";
  if (value >= 65) return "ok";
  if (value >= 50) return "mid";
  if (value >= 30) return "weak";
  return "bad";
}

const TIME_OF_DAY = Array.from({ length: 24 }, (_, i) => {
  const peak = i === 16 || i === 17 || i === 20;
  const value = peak
    ? 0.85 + (i === 17 ? 0.1 : 0)
    : 0.15 + Math.abs(Math.sin((i / 24) * Math.PI * 2)) * 0.35;
  return { label: `${String(i).padStart(2, "0")}:00`, value, peak };
});

const MISTAKE_PATTERNS = [
  { label: "Misreading the question", pct: 32, color: "var(--bad)" },
  { label: "Calculation slip", pct: 24, color: "var(--warn)" },
  { label: "Formula confusion", pct: 18, color: "var(--accent)" },
  { label: "Concept gap", pct: 14, color: "var(--accent)" },
  { label: "Out of time", pct: 12, color: "var(--info)" },
];
