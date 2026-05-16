import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Pill, strengthFor } from "../components/dashboard";
import {
  TutorBody,
  TutorFollowups,
  parseTutorReply,
} from "../components/TutorMessage";

// Expert Help — React port of
// docs/ui/01_StudentPortal_Web/11_expert-help.html.
//
// Phase 1 reality: there is no "ask a human teacher" service yet. So
// this page is wired to the existing AI Tutor (`/api/v1/adaptive/tutor/chat`)
// — every doubt routes to the AI in this build, and the right rail is
// honest about that ("AI Tutor · 24/7"). Human-expert routing lands in
// Phase 2 (see docs/02_planning/20_Phase2_SprintDevelopmentPlan.md).
//
// Threads are persisted in localStorage under
//   alp.experts.threads.<userId>
// — when the doubts microservice ships, swap the storage layer and
// every other piece of the page works unchanged.

interface Thread {
  id: string;
  topicId: string;
  topicTitle: string;
  subjectName?: string;
  title: string;
  status: "OPEN" | "ANSWERED";
  createdAt: string;
  updatedAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
}
interface SubjectMeta {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}
interface TopicMeta {
  id: string;
  subjectId: string;
  title: string;
}
interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

type Filter = "all" | "open" | "answered";

const STORAGE_VERSION = 1;

export function Experts() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [exams, setExams] = useState<ExamMeta[]>([]);
  const [subjects, setSubjects] = useState<SubjectMeta[]>([]);
  const [topics, setTopics] = useState<TopicMeta[]>([]);
  const [mastery, setMastery] = useState<Map<string, { ewa: number; n: number }>>(
    new Map(),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Load threads from localStorage on mount ───────────────────────────
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(storageKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as { v: number; threads: Thread[] };
        if (parsed.v === STORAGE_VERSION && Array.isArray(parsed.threads)) {
          setThreads(parsed.threads);
          if (parsed.threads.length > 0) {
            setActiveId(parsed.threads[0].id);
          }
        }
      }
    } catch {
      /* swallow — corrupted storage just resets */
    }
  }, [user]);

  // ── Persist threads on change ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        storageKey(user.id),
        JSON.stringify({ v: STORAGE_VERSION, threads }),
      );
    } catch {
      /* swallow — quota errors aren't worth blocking the UI */
    }
  }, [user, threads]);

  // ── Catalog metadata for the topic picker ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (!r.ok) return;
        const xs = (await r.json()) as ExamMeta[];
        setExams(xs);

        // Walk all exams → subjects → topics. The catalog is small enough
        // that this fans out to a handful of requests; cached server-side.
        const subjAll: SubjectMeta[] = [];
        for (const e of xs) {
          try {
            const sr = await auth.fetch(`/api/v1/catalog/exams/${e.id}/subjects`);
            if (sr.ok) {
              const ss = (await sr.json()) as SubjectMeta[];
              ss.forEach((s) => subjAll.push({ ...s, examId: e.id }));
            }
          } catch {
            /* swallow */
          }
        }
        setSubjects(subjAll);

        const topAll: TopicMeta[] = [];
        for (const s of subjAll) {
          try {
            const tr = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
            if (tr.ok) {
              const ts = (await tr.json()) as TopicMeta[];
              ts.forEach((t) => topAll.push({ ...t, subjectId: s.id }));
            }
          } catch {
            /* swallow */
          }
        }
        setTopics(topAll);
      } catch {
        /* swallow */
      }
    })();
  }, []);

  // ── Mastery for the AI Context panel ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (!r.ok) return;
        const body = (await r.json()) as MasteryListResponse;
        const m = new Map<string, { ewa: number; n: number }>();
        body.topics.forEach((t) => m.set(t.topicId, { ewa: t.ewa, n: t.n }));
        setMastery(m);
      } catch {
        /* swallow */
      }
    })();
  }, [user]);

  // Auto-scroll the conversation as deltas arrive.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, streaming, threads]);

  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );

  const subjectByTopicId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics) {
      const s = subjects.find((x) => x.id === t.subjectId);
      if (s) m.set(t.id, s.name);
    }
    return m;
  }, [topics, subjects]);

  const filtered = useMemo(() => {
    let out = threads;
    if (filter === "open") out = out.filter((t) => t.status === "OPEN");
    if (filter === "answered") out = out.filter((t) => t.status === "ANSWERED");
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.topicTitle.toLowerCase().includes(q) ||
          t.messages.some((m) => m.content.toLowerCase().includes(q)),
      );
    }
    return [...out].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [threads, filter, search]);

  const counts = useMemo(() => {
    const open = threads.filter((t) => t.status === "OPEN").length;
    return { all: threads.length, open };
  }, [threads]);

  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();

  // ── Send a message in the active thread ───────────────────────────────
  async function sendMessage(textRaw: string) {
    const text = textRaw.trim();
    if (!text || !active || streaming) return;
    const now = new Date().toISOString();
    // Append user message + open assistant placeholder.
    setThreads((cur) =>
      cur.map((t) =>
        t.id === active.id
          ? {
              ...t,
              status: "OPEN",
              updatedAt: now,
              messages: [
                ...t.messages,
                { role: "user", content: text, ts: now },
                { role: "assistant", content: "", ts: now },
              ],
            }
          : t,
      ),
    );
    setStreaming(true);

    try {
      // Build the history that goes to the model — strip the empty
      // placeholder we just appended.
      const history = [
        ...active.messages.filter(
          (m, i, arr) => !(i === arr.length - 1 && m.role === "assistant" && m.content === ""),
        ),
        { role: "user" as const, content: text },
      ];
      const res = await auth.fetch("/api/v1/adaptive/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId: active.topicId,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          userId: user?.id ?? null,
        }),
      });
      if (!res.ok || !res.body) {
        appendToActive("Sorry — couldn't reach the tutor service. Please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const obj = JSON.parse(payload) as { delta?: string };
            if (obj.delta) appendToActive(obj.delta);
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch {
      appendToActive("\n\n_(Connection dropped — try again.)_");
    } finally {
      setStreaming(false);
      // Mark thread as ANSWERED once the stream completes.
      const ts = new Date().toISOString();
      setThreads((cur) =>
        cur.map((t) =>
          t.id === active.id ? { ...t, status: "ANSWERED", updatedAt: ts } : t,
        ),
      );
    }
  }

  function appendToActive(chunk: string) {
    setThreads((cur) =>
      cur.map((t) => {
        if (t.id !== activeId) return t;
        const last = t.messages[t.messages.length - 1];
        if (last && last.role === "assistant") {
          return {
            ...t,
            messages: [
              ...t.messages.slice(0, -1),
              { ...last, content: last.content + chunk },
            ],
          };
        }
        return {
          ...t,
          messages: [
            ...t.messages,
            { role: "assistant", content: chunk, ts: new Date().toISOString() },
          ],
        };
      }),
    );
  }

  // ── Start a new thread (called by the modal) ──────────────────────────
  async function startThread({
    topicId,
    initialQuestion,
  }: {
    topicId: string;
    initialQuestion: string;
  }) {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) return;
    const subjectName = subjectByTopicId.get(topicId);
    const id = `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const newThread: Thread = {
      id,
      topicId,
      topicTitle: topic.title,
      subjectName,
      title: deriveTitle(initialQuestion, topic.title),
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      messages: [
        { role: "user", content: initialQuestion, ts: now },
        { role: "assistant", content: "", ts: now },
      ],
    };
    setThreads((cur) => [newThread, ...cur]);
    setActiveId(id);
    setComposerOpen(false);
    // Trigger streaming — manually (not via sendMessage because the
    // message is already in state).
    setStreaming(true);
    try {
      const res = await auth.fetch("/api/v1/adaptive/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId,
          messages: [{ role: "user", content: initialQuestion }],
          userId: user?.id ?? null,
        }),
      });
      if (!res.ok || !res.body) {
        // Append directly — activeId may not have been picked up by appendToActive yet.
        setThreads((cur) =>
          cur.map((t) =>
            t.id === id
              ? {
                  ...t,
                  messages: [
                    ...t.messages.slice(0, -1),
                    {
                      role: "assistant",
                      content: "Sorry — couldn't reach the tutor service.",
                      ts: new Date().toISOString(),
                    },
                  ],
                }
              : t,
          ),
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const obj = JSON.parse(payload) as { delta?: string };
            if (obj.delta) {
              // Inline append — same logic as appendToActive but bound to the
              // new thread id so we don't depend on a state setter sync.
              setThreads((cur) =>
                cur.map((t) => {
                  if (t.id !== id) return t;
                  const last = t.messages[t.messages.length - 1];
                  if (last && last.role === "assistant") {
                    return {
                      ...t,
                      messages: [
                        ...t.messages.slice(0, -1),
                        { ...last, content: last.content + obj.delta! },
                      ],
                    };
                  }
                  return t;
                }),
              );
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* swallow — already showed an empty bubble */
    } finally {
      setStreaming(false);
      const ts = new Date().toISOString();
      setThreads((cur) =>
        cur.map((t) =>
          t.id === id ? { ...t, status: "ANSWERED", updatedAt: ts } : t,
        ),
      );
    }
  }

  function closeThread() {
    if (!active) return;
    setThreads((cur) =>
      cur.map((t) => (t.id === active.id ? { ...t, status: "ANSWERED" } : t)),
    );
  }

  function deleteThread(id: string) {
    if (!confirm("Delete this thread? This can't be undone.")) return;
    setThreads((cur) => {
      const next = cur.filter((t) => t.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  // Active thread context for the right rail.
  const activeMastery = active ? mastery.get(active.topicId) : null;
  const activeStrength = activeMastery
    ? strengthFor(activeMastery.ewa)
    : "NOT_STARTED";

  // Related = threads on the same subject, excluding active.
  const related = useMemo(() => {
    if (!active) return [];
    return threads
      .filter(
        (t) =>
          t.id !== active.id &&
          (t.subjectName === active.subjectName ||
            t.topicId === active.topicId),
      )
      .slice(0, 4);
  }, [threads, active]);

  return (
    <AppShell title="Expert Help">
      <div className="eh-page">
        <header className="eh-bar" aria-label="Expert Help header">
          <span className="eh-bar-title">Expert Help</span>
          <span className="topbar-chip">
            <span className="live-dot" aria-hidden /> AI Tutor online · 24/7
          </span>
          {counts.open > 0 ? (
            <span className="topbar-chip">
              {counts.open} unanswered
            </span>
          ) : null}
          <span className="eh-bar-spacer" />
          <button
            type="button"
            className="btn-ai"
            onClick={() => setComposerOpen(true)}
          >
            + Ask a Question
          </button>
        </header>

        <div className="eh-body">
          {/* LEFT — doubt list */}
          <aside className="eh-left" aria-label="Your doubts">
            <div className="eh-left-top">
              <div className="eh-search">
                <span aria-hidden>🔍</span>
                <input
                  type="search"
                  placeholder="Search questions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="eh-filter-row">
                <button
                  type="button"
                  className={`eh-fp ${filter === "all" ? "is-active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All ({counts.all})
                </button>
                <button
                  type="button"
                  className={`eh-fp ${filter === "open" ? "is-active" : ""}`}
                  onClick={() => setFilter("open")}
                >
                  Open ({counts.open})
                </button>
                <button
                  type="button"
                  className={`eh-fp ${filter === "answered" ? "is-active" : ""}`}
                  onClick={() => setFilter("answered")}
                >
                  Answered
                </button>
              </div>
            </div>
            <div className="eh-list">
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--ink-4)",
                    lineHeight: 1.5,
                  }}
                >
                  {threads.length === 0
                    ? "No questions yet. Click + Ask a Question to start."
                    : "No questions match these filters."}
                </div>
              ) : (
                filtered.map((t) => {
                  const sel = t.id === activeId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`eh-di ${sel ? "is-selected" : ""}`}
                      onClick={() => setActiveId(t.id)}
                    >
                      <div className="eh-di-top">
                        <div className="eh-di-av">{initial}</div>
                        <div className="eh-di-name">
                          {user?.firstName ?? "You"}
                        </div>
                        <div className="eh-di-time">
                          {formatRelative(t.updatedAt)}
                        </div>
                      </div>
                      <div className="eh-di-q">{t.title}</div>
                      <div className="eh-di-foot">
                        <Pill tone="info">{t.subjectName ?? t.topicTitle}</Pill>
                        <Pill tone={t.status === "OPEN" ? "warning" : "success"}>
                          {t.status}
                        </Pill>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* CENTRE — conversation */}
          <main className="eh-centre" aria-label="Conversation">
            {!active ? (
              <div className="eh-msg-empty" style={{ margin: "auto", padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                <h2 style={{ fontSize: 14, color: "var(--ink)", margin: "0 0 4px" }}>
                  No question selected
                </h2>
                <p>
                  Pick a thread from the left, or click <strong>+ Ask a Question</strong>{" "}
                  to start a new one.
                </p>
                <button
                  type="button"
                  className="btn-ai"
                  style={{ marginTop: 14 }}
                  onClick={() => setComposerOpen(true)}
                >
                  + Ask a Question
                </button>
              </div>
            ) : (
              <>
                <div className="eh-conv-head">
                  <div className="eh-ch-av">{initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eh-ch-name">{active.title}</div>
                    <div className="eh-ch-meta">
                      <span>{user?.firstName ?? "You"}</span>
                      <span>·</span>
                      <span>{formatRelative(active.createdAt)}</span>
                      <span>·</span>
                      <span>{active.subjectName ?? active.topicTitle}</span>
                    </div>
                    <div className="eh-ch-tags">
                      <Pill tone="info">{active.topicTitle}</Pill>
                      <Pill tone={active.status === "OPEN" ? "warning" : "success"}>
                        {active.status}
                      </Pill>
                    </div>
                  </div>
                  {active.status === "OPEN" ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "6px 12px" }}
                      onClick={closeThread}
                    >
                      Close question
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "6px 12px" }}
                      onClick={() => deleteThread(active.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {activeMastery !== null && activeMastery !== undefined ? (
                  <div className="eh-ai-banner">
                    <div className="eh-ai-banner-inner">
                      <span aria-hidden style={{ fontSize: 12, color: "var(--gold)" }}>
                        ◈
                      </span>
                      <div className="eh-ai-banner-text">
                        <strong>AI Context:</strong> {active.topicTitle} mastery{" "}
                        {Math.round(activeMastery.ewa * 100)}% ({activeStrength}) ·{" "}
                        {activeMastery.n} session
                        {activeMastery.n === 1 ? "" : "s"} answered · the AI tutor uses
                        this to calibrate the depth of its reply.
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="eh-conv-body" ref={scrollRef}>
                 <div className="eh-conv-inner">
                  {active.messages.map((m, i) => {
                    if (m.role === "user") {
                      return (
                        <div key={i} className="eh-msg-student">
                          <div className="eh-msg-bubble eh-mb-student">
                            {m.content}
                          </div>
                          <div className="eh-msg-meta">
                            {user?.firstName ?? "You"} · {formatRelative(m.ts)}
                          </div>
                        </div>
                      );
                    }
                    const last = i === active.messages.length - 1;
                    const parsed = parseTutorReply(m.content);
                    return (
                      <div key={i} className="eh-msg-tutor">
                        <div className="eh-tutor-badge">
                          ◈ AI Tutor{streaming && last ? " · Streaming" : ""}
                        </div>
                        <div className="eh-msg-bubble eh-mb-tutor">
                          {parsed.body || parsed.artifacts.length > 0 ? (
                            <TutorBody reply={parsed} />
                          ) : streaming && last ? (
                            "…"
                          ) : (
                            ""
                          )}
                        </div>
                        {/* Generative-UI follow-up chips — show only on the
                            last assistant message and only after the model
                            closed the <<FOLLOWUPS>> block. */}
                        {last && parsed.followups.length > 0 ? (
                          <TutorFollowups
                            items={parsed.followups}
                            disabled={streaming}
                            onPick={(text) => sendMessage(text)}
                          />
                        ) : null}
                        <div className="eh-msg-meta">
                          AI Tutor · {formatRelative(m.ts)}
                          {parsed.body && last && !streaming ? " · " : ""}
                          {parsed.body && last && !streaming ? (
                            <span style={{ color: "var(--good)" }}>
                              ✓ Answered
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                 </div>
                </div>

                <form
                  className="eh-input-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = draft.trim();
                    if (!text) return;
                    setDraft("");
                    sendMessage(text);
                  }}
                >
                  <div className="eh-input-inner">
                    <div className="eh-inp-av">{initial}</div>
                    <div className="eh-inp-wrap">
                      <textarea
                        className="eh-inp-ta"
                        rows={2}
                        placeholder={
                          streaming
                            ? "Tutor is replying…"
                            : "Ask a follow-up question or add more detail…"
                        }
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={streaming}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            const text = draft.trim();
                            if (!text) return;
                            setDraft("");
                            sendMessage(text);
                          }
                        }}
                      />
                      <div className="eh-inp-foot">
                        <span className="eh-inp-hint">
                          Enter to send · Shift+Enter for newline
                        </span>
                        <button
                          type="submit"
                          className="eh-inp-send"
                          disabled={streaming || !draft.trim()}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </>
            )}
          </main>

          {/* RIGHT — tutor card + AI context + related */}
          <aside className="eh-right" aria-label="Tutor and context">
            <div className="eh-tcard">
              <div className="eh-card-eyebrow">
                <span className="eh-card-eyebrow-glyph" aria-hidden>
                  ◈
                </span>
                Answering this question
              </div>
              <div className="eh-tcard-top">
                <div className="eh-tcard-av">◈</div>
                <div>
                  <div className="eh-tcard-name">AI Tutor</div>
                  <div className="eh-tcard-cred">
                    Powered by Claude
                    <br />
                    Trained on the NEET / JEE / UPSC syllabus
                  </div>
                </div>
              </div>
              <div className="eh-tcard-online">
                <span className="live-dot" aria-hidden /> Online now
              </div>
              <div className="eh-tcard-stats">
                <div className="eh-tcard-stat">
                  <div className="eh-tcard-snum" style={{ color: "var(--good)" }}>
                    24/7
                  </div>
                  <div className="eh-tcard-slbl">Availability</div>
                </div>
                <div className="eh-tcard-stat">
                  <div className="eh-tcard-snum" style={{ color: "var(--gold)" }}>
                    &lt;30s
                  </div>
                  <div className="eh-tcard-slbl">First token</div>
                </div>
                <div className="eh-tcard-stat">
                  <div className="eh-tcard-snum" style={{ color: "var(--info)" }}>
                    Streamed
                  </div>
                  <div className="eh-tcard-slbl">Live replies</div>
                </div>
                <div className="eh-tcard-stat">
                  <div className="eh-tcard-snum" style={{ color: "var(--accent)" }}>
                    P2
                  </div>
                  <div className="eh-tcard-slbl">Human review</div>
                </div>
              </div>
              <div className="eh-sla">
                Human-expert review lands in <strong>Phase 2</strong>
              </div>
            </div>

            {active ? (
              <>
                <div className="eh-ctx-card">
                  <div className="eh-ctx-ey">
                    <span aria-hidden>◈</span>
                    AI context · this question
                  </div>
                  <div className="eh-ctx-row">
                    <div className="eh-ctx-lbl">Topic</div>
                    <div className="eh-ctx-val">{active.topicTitle}</div>
                  </div>
                  {active.subjectName ? (
                    <div className="eh-ctx-row">
                      <div className="eh-ctx-lbl">Subject</div>
                      <div className="eh-ctx-val">{active.subjectName}</div>
                    </div>
                  ) : null}
                  <div className="eh-ctx-row">
                    <div className="eh-ctx-lbl">Topic mastery</div>
                    <div
                      className="eh-ctx-val"
                      style={{
                        color: activeMastery
                          ? activeMastery.ewa >= 0.7
                            ? "var(--good)"
                            : activeMastery.ewa >= 0.4
                              ? "var(--info)"
                              : "var(--bad)"
                          : "var(--ink-4)",
                      }}
                    >
                      {activeMastery
                        ? `${Math.round(activeMastery.ewa * 100)}% · ${activeStrength}`
                        : "Not started"}
                    </div>
                  </div>
                  <div className="eh-ctx-row">
                    <div className="eh-ctx-lbl">Sessions</div>
                    <div className="eh-ctx-val">{activeMastery?.n ?? 0}</div>
                  </div>
                  <div className="eh-ctx-row">
                    <div className="eh-ctx-lbl">Status</div>
                    <div
                      className="eh-ctx-val"
                      style={{
                        color:
                          active.status === "OPEN"
                            ? "var(--warn)"
                            : "var(--good)",
                      }}
                    >
                      {active.status}
                    </div>
                  </div>
                </div>

                {related.length > 0 ? (
                  <div className="eh-related-card">
                    <div className="eh-card-eyebrow">
                      <span className="eh-card-eyebrow-glyph" aria-hidden>
                        ◈
                      </span>
                      Related questions
                    </div>
                    <div className="eh-rel-list">
                      {related.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="eh-rel"
                          onClick={() => setActiveId(r.id)}
                        >
                          <div className="eh-rel-q">{r.title}</div>
                          <div className="eh-rel-meta">
                            <Pill tone={r.status === "OPEN" ? "warning" : "success"}>
                              {r.status}
                            </Pill>
                            <span>
                              AI Tutor · {formatRelative(r.updatedAt)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>

        {composerOpen ? (
          <NewQuestionModal
            exams={exams}
            subjects={subjects}
            topics={topics}
            mastery={mastery}
            onClose={() => setComposerOpen(false)}
            onSubmit={startThread}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

// ── New-question modal ────────────────────────────────────────────────────
function NewQuestionModal({
  exams,
  subjects,
  topics,
  mastery,
  onClose,
  onSubmit,
}: {
  exams: ExamMeta[];
  subjects: SubjectMeta[];
  topics: TopicMeta[];
  mastery: Map<string, { ewa: number; n: number }>;
  onClose: () => void;
  onSubmit: (args: { topicId: string; initialQuestion: string }) => Promise<void>;
}) {
  // Default to the topic the learner has answered most recently, otherwise
  // the first topic in the catalog. This means the Most Likely thing they
  // want to ask about is preselected.
  const recentTopicId = useMemo(() => {
    let best: { id: string; n: number } | null = null;
    mastery.forEach((v, k) => {
      if (!best || v.n > best.n) best = { id: k, n: v.n };
    });
    return best ? (best as { id: string; n: number }).id : null;
  }, [mastery]);

  const [examId, setExamId] = useState<string>(exams[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>(recentTopicId ?? "");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // When examId changes, reset subject + topic.
  useEffect(() => {
    if (!examId) return;
    const subs = subjects.filter((s) => s.examId === examId);
    if (subs.length > 0 && !subs.find((s) => s.id === subjectId)) {
      setSubjectId(subs[0].id);
    }
  }, [examId, subjects, subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    const ts = topics.filter((t) => t.subjectId === subjectId);
    if (ts.length > 0 && !ts.find((t) => t.id === topicId)) {
      setTopicId(ts[0].id);
    }
  }, [subjectId, topics, topicId]);

  const examSubjects = subjects.filter((s) => s.examId === examId);
  const subjectTopics = topics.filter((t) => t.subjectId === subjectId);
  const canSubmit = !!topicId && question.trim().length >= 8 && !submitting;

  return (
    <div className="eh-modal-back" onClick={onClose}>
      <div className="eh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="eh-modal-title">Ask a question</div>
        <div className="eh-modal-sub">
          Pick the topic this question belongs to so the AI tutor can use your
          mastery context to calibrate its reply.
        </div>

        <div className="eh-modal-label">Exam</div>
        <select
          className="eh-modal-select"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        >
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <div className="eh-modal-label">Subject</div>
        <select
          className="eh-modal-select"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {examSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="eh-modal-label">Topic</div>
        <select
          className="eh-modal-select"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          {subjectTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        <div className="eh-modal-label">Your question</div>
        <textarea
          className="eh-modal-textarea"
          rows={5}
          placeholder="e.g. In SN2 reactions, why does backside attack cause Walden inversion of configuration?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <div className="eh-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-ai"
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.5 }}
            onClick={async () => {
              if (!canSubmit) return;
              setSubmitting(true);
              try {
                await onSubmit({ topicId, initialQuestion: question.trim() });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Sending…" : "Ask AI Tutor →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
function storageKey(userId: string) {
  return `alp.experts.threads.${userId}`;
}

function deriveTitle(question: string, fallback: string): string {
  // First sentence up to ~70 chars; fall back to the topic title.
  const trimmed = question.trim();
  const stop = trimmed.search(/[.?\n]/);
  const candidate = (stop > 0 ? trimmed.slice(0, stop) : trimmed).trim();
  if (candidate.length === 0) return fallback;
  return candidate.length > 70 ? candidate.slice(0, 67) + "…" : candidate;
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "recently";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}