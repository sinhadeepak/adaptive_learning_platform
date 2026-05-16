import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────────
// Study Map — React port of docs/ui/01_StudentPortal_Web/07_study-map.html.
// Reached from a subject row on /exams/:examId. Two-column layout:
//   • Left subject-nav panel (220px) with AI coach summary + subject list.
//   • Main content with the selected subject's topic list (sorted by AI
//     priority — weak/decaying first), then mock-tests section.
//
// Route: /study/:examId/:subjectId
//
// Data wiring:
//   • Real: catalog/exams/{id}/subjects, catalog/subjects/{id}/topics,
//     analytics/mastery (filter to topics in the active subject).
//   • Synthesised (placeholder until backend lands): topic decay flag, "last
//     practiced" copy, mock tests (upcoming + past 5 + AI analysis).
// ─────────────────────────────────────────────────────────────────────────

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

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface TopicCard {
  id: string;
  title: string;
  ewa: number; // -1 = not started
  n: number;
}

interface SubjectWithMastery {
  id: string;
  name: string;
  ewa: number; // 0..1
  nTracked: number;
  totalTopics: number;
}

const SUBJECT_EMOJI: Record<string, string> = {
  Biology: "🔬",
  Chemistry: "⚗️",
  Physics: "⚛️",
  Mathematics: "📐",
  Maths: "📐",
  English: "📖",
  History: "📜",
  Geography: "🌍",
};

export function StudyMap() {
  const { examId = "", subjectId = "" } = useParams<{
    examId: string;
    subjectId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [allTopics, setAllTopics] = useState<Record<string, TopicCard[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Fetch exam meta.
  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok) {
          const all = (await r.json()) as ExamMeta[];
          const match = all.find((e) => e.id === examId);
          if (match) setExam(match);
          else setError("Exam not found.");
        }
      } catch {
        setError("We couldn't load this exam.");
      }
    })();
  }, [examId]);

  // Fetch subjects + topics + mastery, then join.
  useEffect(() => {
    if (!examId || !user) return;
    (async () => {
      try {
        const subRes = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!subRes.ok) {
          setSubjects([]);
          setAllTopics({});
          return;
        }
        const subs = (await subRes.json()) as Subject[];
        setSubjects(subs);

        let masteryMap = new Map<string, { ewa: number; n: number }>();
        try {
          const mRes = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
          if (mRes.ok) {
            const body = (await mRes.json()) as MasteryListResponse;
            body.topics.forEach((t) => {
              masteryMap.set(t.topicId, { ewa: t.ewa, n: t.n });
            });
          }
        } catch {
          /* empty mastery */
        }

        const topicsBySubject: Record<string, TopicCard[]> = {};
        await Promise.all(
          subs.map(async (s) => {
            try {
              const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
              if (!tr.ok) {
                topicsBySubject[s.id] = [];
                return;
              }
              const list = (await tr.json()) as Topic[];
              topicsBySubject[s.id] = list.map((t) => {
                const m = masteryMap.get(t.id);
                return {
                  id: t.id,
                  title: t.title,
                  ewa: m ? m.ewa : -1,
                  n: m ? m.n : 0,
                };
              });
            } catch {
              topicsBySubject[s.id] = [];
            }
          }),
        );
        setAllTopics(topicsBySubject);
      } catch {
        setError("We couldn't load this exam's content.");
      }
    })();
  }, [examId, user]);

  // ── Default-subject redirect ──
  useEffect(() => {
    if (!subjects || subjects.length === 0) return;
    const known = subjects.find((s) => s.id === subjectId);
    if (!known) {
      navigate(`/study/${examId}/${subjects[0].id}`, { replace: true });
    }
  }, [subjects, subjectId, examId, navigate]);

  // ── Derivations ──
  const subjectsWithMastery = useMemo<SubjectWithMastery[]>(() => {
    if (!subjects) return [];
    return subjects.map((s) => {
      const ts = allTopics[s.id] ?? [];
      const tracked = ts.filter((t) => t.ewa >= 0);
      const ewa =
        tracked.length > 0
          ? tracked.reduce((sum, t) => sum + t.ewa, 0) / tracked.length
          : 0;
      return {
        id: s.id,
        name: s.name,
        ewa,
        nTracked: tracked.length,
        totalTopics: ts.length,
      };
    });
  }, [subjects, allTopics]);

  const activeSubject = subjects?.find((s) => s.id === subjectId);

  // Sort by AI priority: weak first, then developing, then strong, then new.
  // Within each bucket, lower-EWA first.
  const sortedTopics = useMemo(() => {
    const activeTopics = subjectId ? allTopics[subjectId] ?? [] : [];
    return [...activeTopics].sort((a, b) => {
      const score = (t: TopicCard) => {
        if (t.ewa < 0) return 4; // not started → bottom
        if (t.ewa < 0.4) return 0; // weak
        if (t.ewa < 0.7) return 1; // developing
        return 2; // strong
      };
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;
      return a.ewa - b.ewa;
    });
  }, [allTopics, subjectId]);

  const aiPickTopic = useMemo(() => {
    const weak = sortedTopics.find((t) => t.ewa >= 0 && t.ewa < 0.4);
    return weak ?? null;
  }, [sortedTopics]);

  // Build the AI coach summary lines from across-all-subjects data.
  const coachLines = useMemo(() => {
    if (!subjectsWithMastery.length) return [];
    const tracked = subjectsWithMastery.filter((s) => s.nTracked > 0);
    if (tracked.length === 0) {
      return [
        {
          tone: "ai" as const,
          text: "Take your first quiz to start the recommendation engine.",
        },
      ];
    }
    const lines: Array<{ tone: "weak" | "strong" | "warn" | "ai"; text: string }> = [];
    const weakest = [...tracked].sort((a, b) => a.ewa - b.ewa)[0];
    if (weakest && weakest.ewa < 0.5) {
      lines.push({
        tone: "weak",
        text: `Fix first: ${weakest.name} ${Math.round(weakest.ewa * 100)}%`,
      });
    }
    const strongest = [...tracked].sort((a, b) => b.ewa - a.ewa)[0];
    if (strongest && strongest.ewa >= 0.6) {
      lines.push({
        tone: "strong",
        text: `Strongest: ${strongest.name} ${Math.round(strongest.ewa * 100)}%`,
      });
    }
    const decaying = Object.values(allTopics)
      .flat()
      .filter((t) => t.ewa >= 0 && t.ewa < 0.5).length;
    if (decaying > 0) {
      lines.push({
        tone: "warn",
        text: `${decaying} weak topic${decaying === 1 ? "" : "s"} across this exam`,
      });
    }
    return lines.slice(0, 3);
  }, [subjectsWithMastery, allTopics]);

  if (error) {
    return (
      <AppShell title="Study Map">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
        <Link to="/home" className="btn btn-ghost" style={{ marginTop: "var(--sp-3)" }}>
          ← Back to dashboard
        </Link>
      </AppShell>
    );
  }

  if (!exam || !subjects) {
    return (
      <AppShell title="Study Map">
        <SkeletonRows count={5} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Study Map"
      chips={[
        { label: exam.name },
        ...(coachLines.find((l) => l.tone === "warn")
          ? [{ label: `⚠ ${coachLines.find((l) => l.tone === "warn")!.text}` }]
          : []),
      ]}
      actions={
        <Link
          to={`/exams/${examId}`}
          className="topbar-back"
          aria-label="Back to exam dashboard"
        >
          ← {exam.name}
        </Link>
      }
    >
      <div
        className="studymap-body"
        style={{
          // Override AppShell main padding so the two-column grid has full width.
          margin: "calc(-1 * var(--sp-6))",
          height: "calc(100vh - 56px)",
        }}
      >
        {/* ── Left subject-nav panel ────────────────────────────── */}
        <aside className="studymap-left" aria-label="Subjects">
          {coachLines.length > 0 ? (
            <div className="ai-coach">
              <div className="ac-eyebrow">◈ AI COACH · TODAY</div>
              {coachLines.map((line, i) => (
                <div key={i} className="ac-item">
                  <div
                    className="ac-dot"
                    style={{
                      background:
                        line.tone === "weak"
                          ? "var(--bad)"
                          : line.tone === "strong"
                            ? "var(--good)"
                            : line.tone === "warn"
                              ? "var(--warn)"
                              : "var(--gold)",
                    }}
                  />
                  <div className="ac-text">{line.text}</div>
                </div>
              ))}
            </div>
          ) : null}

          <nav className="lp-nav">
            <div className="lp-section-label">Subjects</div>
            {subjectsWithMastery.length === 0 ? (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  padding: "8px 10px",
                }}
              >
                No subjects in this exam yet.
              </p>
            ) : (
              subjectsWithMastery.map((s) => {
                const bucket =
                  s.nTracked === 0
                    ? "not-started"
                    : s.ewa >= 0.7
                      ? "strong"
                      : s.ewa >= 0.4
                        ? "developing"
                        : "weak";
                const dotColor =
                  bucket === "strong"
                    ? "var(--good)"
                    : bucket === "developing"
                      ? "var(--info)"
                      : bucket === "weak"
                        ? "var(--bad)"
                        : "var(--ink-4)";
                return (
                  <Link
                    key={s.id}
                    to={`/study/${examId}/${s.id}`}
                    className={`lp-item ${s.id === subjectId ? "lp-active" : ""}`.trim()}
                  >
                    <div className="lp-dot" style={{ background: dotColor }} />
                    <span className="lp-name">
                      {SUBJECT_EMOJI[s.name] ?? "📚"} {s.name}
                    </span>
                    <span className={`lp-pill lp-pill-${bucket}`}>
                      {s.nTracked > 0 ? `${Math.round(s.ewa * 100)}%` : "—"}
                    </span>
                  </Link>
                );
              })
            )}
          </nav>
        </aside>

        {/* ── Right content panel ───────────────────────────────── */}
        <div className="studymap-right">
          {!activeSubject ? (
            <SkeletonRows count={4} />
          ) : (
            <>
              <div className="sec-row">
                <div>
                  <h2 className="section-heading">
                    {SUBJECT_EMOJI[activeSubject.name] ?? "📚"} {activeSubject.name} ·{" "}
                    {sortedTopics.length} topic{sortedTopics.length === 1 ? "" : "s"}
                  </h2>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--ink-4)",
                      marginTop: 1,
                    }}
                  >
                    Sorted by AI priority · tap any topic to practice
                  </div>
                </div>
              </div>

              {sortedTopics.length === 0 ? (
                <div className="card empty-state">
                  <div className="empty-state-title">No topics yet</div>
                  <p>This subject has no topics in the catalog.</p>
                </div>
              ) : (
                sortedTopics.map((t) => {
                  const isAiPick = aiPickTopic?.id === t.id;
                  const bucket =
                    t.ewa < 0
                      ? "not-started"
                      : t.ewa >= 0.7
                        ? "strong"
                        : t.ewa >= 0.4
                          ? "developing"
                          : "weak";
                  const tagLabel =
                    bucket === "not-started"
                      ? "NOT STARTED"
                      : bucket === "strong"
                        ? "STRONG"
                        : bucket === "developing"
                          ? "DEVELOPING"
                          : "WEAK";
                  const barColor =
                    bucket === "strong"
                      ? "var(--good)"
                      : bucket === "developing"
                        ? "var(--info)"
                        : bucket === "weak"
                          ? "var(--bad)"
                          : "var(--ink-4)";
                  const pctColor =
                    bucket === "strong"
                      ? "var(--good)"
                      : bucket === "developing"
                        ? "var(--info)"
                        : bucket === "weak"
                          ? "var(--bad)"
                          : "var(--ink-3)";
                  const ctaClass =
                    bucket === "weak"
                      ? "btn-sm btn-sm-fix"
                      : bucket === "not-started"
                        ? "btn-sm btn-sm-start"
                        : "btn-sm btn-sm-prac";
                  const ctaLabel =
                    bucket === "weak"
                      ? "Fix Now →"
                      : bucket === "not-started"
                        ? "Start →"
                        : bucket === "strong"
                          ? "Revise →"
                          : "Practice →";
                  const points =
                    bucket === "weak"
                      ? `▲ +${(2.5 + (1 - t.ewa) * 2).toFixed(1)} pts`
                      : bucket === "developing"
                        ? `▲ +${(0.8 + (1 - t.ewa) * 1.2).toFixed(1)} pts`
                        : bucket === "strong"
                          ? "Maintain"
                          : "Start to track";
                  const meta =
                    bucket === "not-started"
                      ? "No sessions yet"
                      : t.n === 1
                        ? "1 session so far"
                        : `${t.n} sessions so far`;
                  return (
                    <Link
                      key={t.id}
                      to={`/catalog/topic/${t.id}`}
                      className={`topic-row ${bucket === "weak" ? "topic-row-priority" : ""} ${
                        isAiPick ? "topic-row-ai-pick" : ""
                      }`.trim()}
                    >
                      <div className="tr-left">
                        <div className="tr-name">{t.title}</div>
                        <div className="tr-meta">
                          <span className={`tr-tag tr-tag-${bucket}`}>{tagLabel}</span>
                          {isAiPick ? (
                            <span className="tr-tag tr-tag-ai">◈ AI PICK</span>
                          ) : null}
                          <span className="tr-last">{meta}</span>
                        </div>
                        <div className="tr-bar">
                          <div
                            className="tr-bar-fill"
                            style={{
                              width: `${t.ewa < 0 ? 0 : Math.round(t.ewa * 100)}%`,
                              background: barColor,
                            }}
                          />
                        </div>
                      </div>
                      <div className="tr-right">
                        <div className="tr-pct" style={{ color: pctColor }}>
                          {t.ewa < 0 ? "—" : `${Math.round(t.ewa * 100)}%`}
                        </div>
                        <div
                          className="tr-pts"
                          style={{
                            color:
                              bucket === "strong" || bucket === "not-started"
                                ? "var(--ink-4)"
                                : "var(--good)",
                          }}
                        >
                          {points}
                        </div>
                        <span className={ctaClass}>{ctaLabel}</span>
                      </div>
                    </Link>
                  );
                })
              )}

              {/* ── Mock tests section ────────────────────────────── */}
              <div className="divider" style={{ height: 1, background: "var(--rule)", margin: "var(--sp-5) 0" }} />
              <div className="sec-row">
                <div>
                  <h2 className="section-heading">🏆 Mock Tests · {exam.name}</h2>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--ink-4)",
                      marginTop: 1,
                    }}
                  >
                    Mock tests + AI analysis appear here once your institution
                    wires the assignments service.
                  </div>
                </div>
              </div>

              <div className="card empty-state">
                <div className="empty-state-title">No mock tests yet</div>
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Mock test history + upcoming assigned mocks will appear here
                  once the assignments service lands. Until then use the topic
                  practice above.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}