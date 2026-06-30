import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { MasteryBar } from "../components/stats";
import { EmbeddedVideoPlayer } from "../components/EmbeddedVideoPlayer";
import { DocumentViewer } from "../components/content/DocumentViewer";
import { ContentCard } from "../components/content/ContentCard";
import { NotesPanel } from "../components/notes/NotesPanel";
import {
  contentResources,
  fetchStudyReadiness,
  type ExamContentTree,
  type StudentResource,
  type StudyReadiness,
  type WatchSummary,
} from "../lib/api";

// ─────────────────────────────────────────────────────────────────────────
// ExamContent — the Study Materials hub (exam-scoped).
//
// Aggregates every PUBLISHED content item for the exam (videos, URLs, notes,
// PDFs) grouped subject → topic, plus:
//   • a "Revise these topics" panel fusing SM-2 due + mastery + watched-status
//   • a "Continue watching" strip with resume + % per video
//   • per-topic minutes-watched
//
// Reached from the exam-dashboard "Study materials" card and the sidebar.
// ─────────────────────────────────────────────────────────────────────────

const NEED_TONE: Record<string, string> = {
  HIGH: "var(--bad, #F43F5E)",
  MEDIUM: "var(--warn, #F5A623)",
  LOW: "var(--good, #22C55E)",
};

export function ExamContent() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { user } = useAuth();

  const [tree, setTree] = useState<ExamContentTree | null>(null);
  const [watch, setWatch] = useState<WatchSummary | null>(null);
  const [readiness, setReadiness] = useState<StudyReadiness | null>(null);
  const [openVideo, setOpenVideo] = useState<StudentResource | null>(null);
  const [openDoc, setOpenDoc] = useState<StudentResource | null>(null);

  useEffect(() => {
    if (!examId) return;
    let alive = true;
    (async () => {
      const [t, w] = await Promise.all([
        contentResources.listForExam(examId),
        contentResources.watchSummary(examId),
      ]);
      if (!alive) return;
      setTree(t);
      setWatch(w);
    })();
    return () => {
      alive = false;
    };
  }, [examId]);

  useEffect(() => {
    if (!examId || !user?.id) return;
    let alive = true;
    (async () => {
      const r = await fetchStudyReadiness(user.id, examId);
      if (alive) setReadiness(r);
    })();
    return () => {
      alive = false;
    };
  }, [examId, user?.id]);

  // Flat list of every video with a resume position, for the strip.
  const continueWatching = useMemo(() => {
    if (!tree || !watch) return [];
    const byId = new Map<string, StudentResource>();
    for (const s of tree.subjects)
      for (const t of s.topics)
        for (const r of t.resources) byId.set(r.id, r);
    return Object.entries(watch.perResource)
      .filter(([id, p]) => !p.watched && p.furthestPercent > 0 && byId.has(id))
      .map(([id, p]) => ({ resource: byId.get(id)!, progress: p }))
      .filter((x) => x.resource.resource_type.startsWith("youtube"))
      .slice(0, 12);
  }, [tree, watch]);

  const totalItems = useMemo(
    () =>
      tree
        ? tree.subjects.reduce(
            (n, s) => n + s.topics.reduce((m, t) => m + t.resources.length, 0),
            0,
          )
        : 0,
    [tree],
  );

  return (
    <VidyaShell
      crumbs="LEARN · STUDY MATERIALS"
      title="Study materials"
      subtitle="Videos, notes & PDFs for every topic — and what to revise next."
    >
      {tree === null ? (
        <div style={{ padding: 32, color: "var(--ink-4, #7A8BAD)" }}>Loading…</div>
      ) : totalItems === 0 ? (
        <EmptyState />
      ) : (
        <>
          {readiness && readiness.topics.length > 0 ? (
            <RevisePanel readiness={readiness} watch={watch} />
          ) : null}

          {continueWatching.length > 0 ? (
            <ContinueWatchingStrip
              items={continueWatching}
              onOpen={(r) => setOpenVideo(r)}
            />
          ) : null}

          {tree.subjects.map((subject) => {
            const subjMinutes = subject.topics.reduce(
              (m, t) => m + (watch?.perTopic[t.topic_id]?.minutesWatched ?? 0),
              0,
            );
            return (
              <section key={subject.subject_id} className="card" style={{ marginBottom: 18 }}>
                <header
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <h2 style={{ fontSize: 16, margin: 0, color: "var(--ink, #EEF2FF)" }}>
                    {subject.subject_name}
                  </h2>
                  {subjMinutes > 0 ? (
                    <span style={{ fontSize: 12, color: "var(--ink-4, #7A8BAD)" }}>
                      ▶ {subjMinutes} min watched
                    </span>
                  ) : null}
                </header>

                {subject.topics.map((topic) => {
                  const tp = watch?.perTopic[topic.topic_id];
                  return (
                    <div key={topic.topic_id} style={{ marginBottom: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <h3
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            margin: 0,
                            color: "var(--ink-2, #B8C5E0)",
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                          }}
                        >
                          {topic.topic_title}
                        </h3>
                        {tp && tp.minutesWatched > 0 ? (
                          <span style={{ fontSize: 11, color: "var(--ink-4, #7A8BAD)" }}>
                            · {tp.minutesWatched} min
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                          gap: 10,
                        }}
                      >
                        {topic.resources.map((r) => (
                          <ContentCard
                            key={r.id}
                            resource={r}
                            progress={watch?.perResource[r.id]}
                            onOpenVideo={setOpenVideo}
                            onOpenDoc={setOpenDoc}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          {examId ? <NotesPanel examId={examId} /> : null}
        </>
      )}

      {openVideo ? (
        <EmbeddedVideoPlayer
          resource={openVideo}
          startSeconds={watch?.perResource[openVideo.id]?.resumePositionSeconds}
          onClose={() => setOpenVideo(null)}
        />
      ) : null}
      {openDoc ? (
        <DocumentViewer resource={openDoc} onClose={() => setOpenDoc(null)} />
      ) : null}
    </VidyaShell>
  );
}

function EmptyState() {
  return (
    <div
      className="card"
      style={{ padding: 28, textAlign: "center", color: "var(--ink-2, #B8C5E0)" }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>📚</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink, #EEF2FF)" }}>
        No study materials yet
      </div>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Your teachers pin videos, notes and PDFs here as the curation queue
        catches up. Check back soon.
      </p>
    </div>
  );
}

function RevisePanel({
  readiness,
  watch,
}: {
  readiness: StudyReadiness;
  watch: WatchSummary | null;
}) {
  const rows = readiness.topics
    .filter((t) => t.revisionNeed !== "LOW")
    .slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--gold, #22D4EE)",
          margin: "0 0 12px",
        }}
      >
        Revise these topics
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((t) => {
          const minutes = watch?.perTopic[t.topicId]?.minutesWatched ?? t.minutesWatched;
          return (
            <div
              key={t.topicId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--rule, rgba(255,255,255,0.06))",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: NEED_TONE[t.revisionNeed],
                  minWidth: 56,
                }}
              >
                {t.revisionNeed}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink, #EEF2FF)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t.topicTitle || "Untitled topic"}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4, #7A8BAD)" }}>
                  {t.overdueDays > 0
                    ? `${t.overdueDays}d overdue`
                    : t.dueAt
                      ? "due soon"
                      : "not scheduled"}
                  {minutes > 0 ? ` · ▶ ${minutes} min watched` : " · not watched"}
                </div>
              </div>
              <div style={{ width: 120 }}>
                {t.ewa !== null ? <MasteryBar ewa={t.ewa} n={t.n} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ContinueWatchingStrip({
  items,
  onOpen,
}: {
  items: { resource: StudentResource; progress: { furthestPercent: number } }[];
  onOpen: (r: StudentResource) => void;
}) {
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--gold, #22D4EE)",
          margin: "0 0 12px",
        }}
      >
        Continue watching
      </h2>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {items.map(({ resource, progress }) => (
          <button
            key={resource.id}
            type="button"
            onClick={() => onOpen(resource)}
            style={{
              flexShrink: 0,
              width: 240,
              background: "var(--paper-2, #162038)",
              border: "1px solid var(--rule, rgba(255,255,255,0.07))",
              borderRadius: 8,
              overflow: "hidden",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
              color: "inherit",
              fontFamily: "inherit",
            }}
          >
            <div style={{ position: "relative", height: 130, background: "#000" }}>
              {resource.thumbnail_url ? (
                <img
                  src={resource.thumbnail_url}
                  alt={resource.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  height: 4,
                  width: `${progress.furthestPercent}%`,
                  background: "var(--gold, #22D4EE)",
                }}
              />
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ink, #EEF2FF)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {resource.title}
              </div>
              <div style={{ fontSize: 10, color: "var(--gold, #22D4EE)", marginTop: 4 }}>
                {progress.furthestPercent}% · resume
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
