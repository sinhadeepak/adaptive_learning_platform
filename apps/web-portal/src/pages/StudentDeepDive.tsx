/**
 * Track 2 Sprint A4 — student deep-dive with intervention flag.
 *
 * Reuses the existing /analytics/cohorts/{id}/students/{userId} drill
 * down endpoint and adds a "Flag for revision" modal that POSTs to
 * /analytics/manual-interventions. The flag appears in that
 * student's Guided Next Steps with a "from {teacher}" badge until
 * they fulfil it.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Pill, SkeletonRows } from "../components/primitives";
import { auth } from "../lib/api";
import { env } from "../lib/env";
import { useAuth } from "../lib/auth-provider";
import { teacherAnalytics } from "../lib/analytics-api";

interface StudentDrillRow {
  topicId: string;
  topicTitle?: string;
  ewa: number;
  n: number;
}

// Phase 1A.5 — KG root-cause walker output.
interface RootCauseResult {
  primaryConceptId: string;
  rootCauseConceptId: string | null;
  path: string[];
  weakConcepts: string[];
  notes: string[];
}

export function StudentDeepDive() {
  const { cohortId, userId } = useParams<{ cohortId: string; userId: string }>();
  const { user: viewer } = useAuth();
  const [topics, setTopics] = useState<StudentDrillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagTopic, setFlagTopic] = useState<StudentDrillRow | null>(null);
  // Phase 1A.5 — concept mastery cache + per-row diagnose state.
  const [conceptMastery, setConceptMastery] = useState<
    Record<string, number>
  >({});
  const [diagnoseTopic, setDiagnoseTopic] = useState<string | null>(null);
  const [diagnoseResult, setDiagnoseResult] = useState<RootCauseResult | null>(
    null,
  );
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [conceptTitles, setConceptTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cohortId || !userId) return;
    auth
      .fetch(
        `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(
          cohortId,
        )}/students/${encodeURIComponent(userId)}`,
      )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { topics: StudentDrillRow[] };
        setTopics(j.topics ?? []);
      })
      .catch((e) => setError(String(e)));

    // Phase 1A.5 — pre-fetch concept mastery once for the diagnose flow.
    auth
      .fetch(
        `${env.apiBaseUrl}/analytics/concept-mastery/${encodeURIComponent(userId)}`,
      )
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as {
          concepts: { conceptId: string; ewa: number }[];
        };
        const map: Record<string, number> = {};
        for (const c of j.concepts ?? []) map[c.conceptId] = c.ewa;
        setConceptMastery(map);
      })
      .catch(() => {
        /* concept mastery is best-effort */
      });
  }, [cohortId, userId]);

  // Phase 1A.5 — root-cause diagnostic for a specific topic.
  async function diagnose(topic: StudentDrillRow) {
    if (diagnoseTopic === topic.topicId) {
      setDiagnoseTopic(null);
      setDiagnoseResult(null);
      return;
    }
    setDiagnoseTopic(topic.topicId);
    setDiagnoseResult(null);
    setDiagnoseLoading(true);
    try {
      // 1. Fetch prereq edges for this topic from learning catalog.
      const er = await auth.fetch(
        `${env.apiBaseUrl}/catalog/topics/${encodeURIComponent(topic.topicId)}/prereqs`,
      );
      const edges =
        er.status === 200
          ? ((await er.json()) as { from: string; to: string }[]).map((e) => ({
              fromConceptId: e.from,
              toConceptId: e.to,
            }))
          : [];
      // 2. POST to root-cause walker. The topic_id is the topic-root concept_id
      // (per Phase 5 KG migration — UUIDs are reused).
      const rr = await auth.fetch(
        `${env.apiBaseUrl}/adaptive/diagnostic/root-cause`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            primaryConceptId: topic.topicId,
            userConceptMastery: conceptMastery,
            edges,
            weakThreshold: 0.4,
          }),
        },
      );
      if (rr.ok) {
        const body = (await rr.json()) as RootCauseResult;
        setDiagnoseResult(body);
        // Hydrate concept titles for the path.
        const allIds = [
          body.primaryConceptId,
          ...(body.path ?? []),
          ...(body.weakConcepts ?? []),
        ];
        const unique = Array.from(new Set(allIds));
        const titles: Record<string, string> = {};
        await Promise.all(
          unique.map(async (id) => {
            try {
              const tr = await auth.fetch(
                `${env.apiBaseUrl}/catalog/topics/${encodeURIComponent(id)}`,
              );
              if (tr.ok) {
                const tt = await tr.json();
                titles[id] = tt.title ?? id.slice(0, 8);
              }
            } catch {
              /* ignore */
            }
          }),
        );
        setConceptTitles((prev) => ({ ...prev, ...titles }));
      }
    } catch (e) {
      setError(`Root-cause failed: ${String(e)}`);
    } finally {
      setDiagnoseLoading(false);
    }
  }

  if (!cohortId || !userId) {
    return (
      <AppShell title="Student">
        <main className="page" style={{ padding: 24 }}>
          <Pill tone="danger">Missing cohort or user id.</Pill>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Student ${userId.slice(0, 8)}`}>
      <main className="page" style={{ padding: 24 }}>
        <Link to={`/teacher/cohorts/${cohortId}`} style={{ color: "var(--text-muted)", fontSize: 12 }}>
          ← Back to cohort
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Student <code>{userId.slice(0, 8)}</code>
        </h1>
        {error && <Pill tone="danger">{error}</Pill>}
        {!topics ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Per-topic mastery for this student. Click <em>Flag for revision</em> on
              any row to send a nudge that appears in their Guided Next Steps with a
              "from {viewer?.firstName ?? "you"}" badge.
            </p>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Mastery</th>
                  <th>Sessions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topics.flatMap((t) => {
                  const pct = Math.round(t.ewa * 100);
                  const tone = pct >= 70 ? "success" : pct >= 40 ? "info" : "danger";
                  const isOpen = diagnoseTopic === t.topicId;
                  const rows = [
                    <tr key={t.topicId}>
                      <td>{t.topicTitle ?? t.topicId.slice(0, 8)}</td>
                      <td>
                        <Pill tone={tone}>{pct}%</Pill>
                      </td>
                      <td>{t.n}</td>
                      <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          onClick={() => diagnose(t)}
                          style={{
                            background: isOpen
                              ? "var(--color-red, #f43f5e)"
                              : "var(--color-blue, #4F87F6)",
                            color: "#fff",
                            border: 0,
                            padding: "4px 10px",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                          disabled={diagnoseLoading && isOpen}
                        >
                          {isOpen ? "Hide" : "Diagnose"}
                        </button>
                        <button
                          onClick={() => {
                            setFlagTopic(t);
                            setFlagOpen(true);
                          }}
                          style={{
                            background: "var(--color-amber)",
                            color: "#fff",
                            border: 0,
                            padding: "4px 10px",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Flag for revision
                        </button>
                      </td>
                    </tr>,
                  ];
                  if (isOpen) {
                    rows.push(
                      <tr
                        key={`${t.topicId}-diag`}
                        style={{ background: "var(--bg-surface2, rgba(0,0,0,0.05))" }}
                      >
                        <td colSpan={4} style={{ padding: 12 }}>
                          {diagnoseLoading ? (
                            <span style={{ color: "var(--text-muted)" }}>
                              Walking prereq chain…
                            </span>
                          ) : diagnoseResult ? (
                            <RootCausePanel
                              result={diagnoseResult}
                              titles={conceptTitles}
                            />
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              No diagnostic data — student needs more attempts
                              on prerequisites for this topic.
                            </span>
                          )}
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </>
        )}

        {flagOpen && flagTopic && viewer && (
          <FlagModal
            cohortId={cohortId}
            studentId={userId}
            educatorId={viewer.id}
            topic={flagTopic}
            onClose={() => setFlagOpen(false)}
          />
        )}
      </main>
    </AppShell>
  );
}

function FlagModal({
  cohortId,
  studentId,
  educatorId,
  topic,
  onClose,
}: {
  cohortId: string;
  studentId: string;
  educatorId: string;
  topic: StudentDrillRow;
  onClose: () => void;
}) {
  const [action, setAction] = useState<"REVISE" | "DIAGNOSE" | "PRACTICE">("REVISE");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await teacherAnalytics.flagIntervention({
        student_id: studentId,
        educator_id: educatorId,
        cohort_id: cohortId,
        topic_id: topic.topicId,
        action,
        reason: reason.trim() || undefined,
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "calc(100% - 32px)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Flag {topic.topicTitle ?? topic.topicId.slice(0, 8)}</h3>
        {done ? (
          <Pill tone="success">Sent. The student will see it in their next dashboard load.</Pill>
        ) : (
          <>
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Pick the action you want the student to take. The nudge appears in their Guided
              Next Steps until they fulfil it.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["REVISE", "DIAGNOSE", "PRACTICE"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  style={{
                    background: action === a ? "var(--color-ai)" : "var(--bg-surface-2)",
                    color: action === a ? "#fff" : "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    padding: "6px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: action === a ? 700 : 500,
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Why? (optional, shown to the student)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              style={{
                width: "100%",
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                padding: 8,
                fontSize: 13,
              }}
            />
            {error && (
              <p style={{ color: "var(--color-red)", fontSize: 12, marginTop: 8 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={onClose}
                disabled={busy}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-default)",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                style={{
                  background: "var(--color-ai)",
                  color: "#fff",
                  border: 0,
                  padding: "6px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {busy ? "Sending…" : "Send flag"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// Phase 1A.5 — KG root-cause walker output panel.
function RootCausePanel({
  result,
  titles,
}: {
  result: RootCauseResult;
  titles: Record<string, string>;
}) {
  const primaryName =
    titles[result.primaryConceptId] ?? result.primaryConceptId.slice(0, 8);
  const rootName = result.rootCauseConceptId
    ? titles[result.rootCauseConceptId] ?? result.rootCauseConceptId.slice(0, 8)
    : null;

  return (
    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ marginBottom: 8 }}>
        <strong style={{ color: "var(--text-primary)" }}>
          Why is the student stuck on {primaryName}?
        </strong>
      </div>
      {rootName && rootName !== primaryName ? (
        <div
          style={{
            padding: 10,
            background: "rgba(244,63,94,0.08)",
            border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ROOT CAUSE
          </div>
          <div
            style={{
              fontWeight: 700,
              color: "var(--color-red, #f43f5e)",
              fontSize: 14,
            }}
          >
            {rootName}
          </div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
            Mastery on this prerequisite is below the weak threshold (0.4).
            Fixing this concept first is likely to unblock {primaryName}.
          </div>
        </div>
      ) : (
        <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
          No deeper-prerequisite gap found — the student understands the
          prereqs but is missing something specific to {primaryName}. This
          could be a procedural slip rather than a conceptual gap.
        </div>
      )}
      {result.path && result.path.length > 1 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <strong>Path:</strong>{" "}
          {result.path.map((id, i) => (
            <span key={id}>
              {i > 0 ? " → " : ""}
              {titles[id] ?? id.slice(0, 8)}
            </span>
          ))}
        </div>
      ) : null}
      {result.weakConcepts && result.weakConcepts.length > 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          <strong>{result.weakConcepts.length}</strong> weak concept
          {result.weakConcepts.length === 1 ? "" : "s"} along this chain:{" "}
          {result.weakConcepts
            .slice(0, 5)
            .map((id) => titles[id] ?? id.slice(0, 8))
            .join(", ")}
          {result.weakConcepts.length > 5 ? "…" : ""}
        </div>
      ) : null}
    </div>
  );
}
