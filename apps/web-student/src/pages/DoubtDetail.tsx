import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// Doubt detail — backed by /doubts/{id}. Renders the question + answer
// stream chronologically with source/role badges, and a reply composer
// that appends an answer (peer source by default; backend promotes to
// expert if the user has TEACHER+ role).

interface DoubtAnswer {
  id: string;
  doubtId: string;
  authorId: string | null;
  authorRole: string;
  content: string;
  source: "ai" | "expert" | "peer";
  createdAt: string;
  accepted: boolean;
}

interface DoubtDetailResponse {
  id: string;
  userId: string;
  questionText: string;
  photoDataUrl: string | null;
  topicId: string | null;
  topicTitle: string | null;
  status: "OPEN" | "ANSWERED" | "RESOLVED";
  createdAt: string;
  lastActivityAt: string;
  answerCount: number;
  answers: DoubtAnswer[];
}

export function DoubtDetail() {
  const { doubtId } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DoubtDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiBuffer, setAiBuffer] = useState("");
  const askedRef = useRef(false);

  useEffect(() => {
    if (!doubtId) return;
    void load();
  }, [doubtId]);

  // Auto-trigger AI tutor when arriving with ?askAi=1 (from quiz review).
  useEffect(() => {
    if (!data || askedRef.current) return;
    if (searchParams.get("askAi") !== "1") return;
    askedRef.current = true;
    // Clear the param so a refresh doesn't re-trigger.
    searchParams.delete("askAi");
    setSearchParams(searchParams, { replace: true });
    void askAi();
  }, [data, searchParams, setSearchParams]);

  async function askAi() {
    if (!doubtId || !data || aiStreaming) return;
    setAiStreaming(true);
    setAiBuffer("");
    try {
      // Build a coherent dialog from the full thread so the tutor can
      // follow up rather than answering the original question in isolation:
      //   user role  → original question + any peer follow-ups
      //   asst role  → existing AI / expert answers
      const sortedAnswers = [...data.answers].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: data.questionText },
      ];
      for (const a of sortedAnswers) {
        const role = a.source === "peer" ? "user" : "assistant";
        messages.push({ role, content: a.content });
      }
      // If the last message is from the assistant, append a nudge so the
      // model knows the user is asking for a follow-up.
      if (
        messages.length > 1 &&
        messages[messages.length - 1].role === "assistant"
      ) {
        messages.push({
          role: "user",
          content: "Can you explain this further or give a worked example?",
        });
      }
      const res = await auth.fetch("/api/v1/adaptive/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId: data.topicId ?? "00000000-0000-0000-0000-000000000000",
          messages,
        }),
      });
      if (!res.ok || !res.body) {
        setAiStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              boundary = -2;
              break;
            }
            try {
              const m = JSON.parse(payload) as { delta?: string };
              if (m.delta) {
                acc += m.delta;
                setAiBuffer(acc);
              }
            } catch {/* skip */}
          }
          if (boundary === -2) break;
          boundary = buffer.indexOf("\n\n");
        }
      }
      // Persist the streamed response as an ai-source answer.
      if (acc.trim().length > 0) {
        await auth.fetch(`/api/v1/doubts/${doubtId}/answers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: acc.trim(), source: "ai" }),
        });
        await load();
      }
    } finally {
      setAiStreaming(false);
      setAiBuffer("");
    }
  }

  async function load() {
    try {
      const r = await auth.fetch(`/api/v1/doubts/${doubtId}`);
      if (r.status === 404) {
        setError("Doubt not found.");
        return;
      }
      if (!r.ok) {
        setError("We couldn't load this doubt.");
        return;
      }
      setData((await r.json()) as DoubtDetailResponse);
    } catch {
      setError("Network error.");
    }
  }

  async function postReply() {
    const text = reply.trim();
    if (!doubtId || text.length < 1 || posting) return;
    setPosting(true);
    try {
      const r = await auth.fetch(`/api/v1/doubts/${doubtId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, source: "peer" }),
      });
      if (r.ok) {
        setReply("");
        await load();
      }
    } finally {
      setPosting(false);
    }
  }

  async function acceptAnswer(answerId: string) {
    if (!doubtId) return;
    await auth.fetch(`/api/v1/doubts/${doubtId}/answers/${answerId}/accept`, {
      method: "POST",
    });
    await load();
  }

  const sortedAnswers = useMemo(
    () =>
      data ? [...data.answers].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [],
    [data],
  );

  const back = (
    <Link to="/doubts" className="auth-link" style={{ fontSize: 12 }}>
      ← My doubts
    </Link>
  );

  if (error) {
    return (
      <AppShell title="Doubt" actions={back}>
        <Banner tone="danger" role="alert">{error}</Banner>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell title="Doubt" actions={back}>
        <SkeletonRows count={4} />
      </AppShell>
    );
  }

  const canReply = data.status !== "RESOLVED";

  return (
    <AppShell title="Doubt" actions={back}>
      {/* Question card */}
      <div
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          padding: "var(--sp-4)",
          marginBottom: "var(--sp-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Pill tone={statusTone(data.status)}>{data.status}</Pill>
          {data.topicTitle ? <Pill tone="info">◈ {data.topicTitle}</Pill> : null}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {relative(data.createdAt)}
          </span>
        </div>
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 15,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {data.questionText}
        </div>
        {data.photoDataUrl ? (
          <img
            src={data.photoDataUrl}
            alt=""
            style={{ marginTop: 12, maxWidth: "100%", borderRadius: 10 }}
          />
        ) : null}
      </div>

      {/* Answers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "var(--sp-4) 0 var(--sp-2) 0",
        }}
      >
        <h2
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {sortedAnswers.length} answer{sortedAnswers.length === 1 ? "" : "s"}
        </h2>
      </div>

      {sortedAnswers.length === 0 ? (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            padding: "var(--sp-3)",
            border: "1px dashed var(--border-default)",
            borderRadius: 10,
            marginBottom: "var(--sp-3)",
          }}
        >
          No answers yet — the AI tutor or an expert will reply soon.
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {sortedAnswers.map((a) => (
            <li
              key={a.id}
              style={{
                background: "var(--bg-surface-1)",
                border: `1px solid ${a.accepted ? "var(--color-green)" : "var(--border-default)"}`,
                borderRadius: 12,
                padding: "var(--sp-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Pill tone={sourceTone(a.source)}>{labelForSource(a.source)}</Pill>
                {a.accepted ? <Pill tone="success">ACCEPTED</Pill> : null}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {relative(a.createdAt)}
                </span>
                {!a.accepted &&
                user?.id === data.userId &&
                data.status !== "RESOLVED" ? (
                  <button
                    type="button"
                    className="auth-link"
                    style={{ fontSize: 11, background: "transparent", border: 0, cursor: "pointer" }}
                    onClick={() => acceptAnswer(a.id)}
                  >
                    Accept
                  </button>
                ) : null}
              </div>
              <div
                style={{
                  color: "var(--text-primary)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {a.content}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Ask AI tutor — always available (until RESOLVED) so the student
          can ask follow-ups. Each call streams a reply and persists it as
          a new ai-source answer; the thread builds context for next time. */}
      {canReply && !aiStreaming ? (
        <button
          type="button"
          onClick={askAi}
          className="btn btn-secondary"
          style={{ marginTop: "var(--sp-2)" }}
        >
          {data.answers.some((a) => a.source === "ai")
            ? "◈ Ask AI follow-up"
            : "◈ Ask AI Tutor for help"}
        </button>
      ) : null}

      {/* Streaming preview — shown while the AI is responding so the
          student sees the reply build up in real time. Final text is
          persisted as an answer when the stream completes. */}
      {aiStreaming ? (
        <div
          style={{
            background: "var(--bg-surface-1)",
            border: "1px solid var(--color-ai)",
            borderRadius: 12,
            padding: "var(--sp-3)",
            marginTop: "var(--sp-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Pill tone="info">◈ AI Tutor · streaming…</Pill>
          </div>
          <div
            style={{
              color: "var(--text-primary)",
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              minHeight: 24,
            }}
          >
            {aiBuffer}
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 14,
                marginLeft: 2,
                background: "var(--color-ai)",
                animation: "blink 1s step-start infinite",
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Reply composer */}
      {canReply ? (
        <div
          style={{
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            padding: "var(--sp-3)",
            marginTop: "var(--sp-4)",
          }}
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 20_000))}
            rows={3}
            placeholder="Add a reply or follow-up question…"
            style={{
              width: "100%",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              color: "var(--text-primary)",
              padding: 10,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={postReply}
              disabled={reply.trim().length < 1 || posting}
            >
              {posting ? "Posting…" : "Post reply"}
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function labelForSource(s: DoubtAnswer["source"]): string {
  if (s === "ai") return "◈ AI Tutor";
  if (s === "expert") return "Expert";
  return "Peer";
}

function sourceTone(s: DoubtAnswer["source"]): "info" | "success" | "warning" {
  if (s === "ai") return "info";
  if (s === "expert") return "success";
  return "warning";
}

function statusTone(s: string): "info" | "success" | "warning" | "muted" {
  if (s === "RESOLVED") return "success";
  if (s === "ANSWERED") return "info";
  if (s === "OPEN") return "warning";
  return "muted";
}

function relative(iso: string): string {
  try {
    const t = new Date(iso);
    const delta = Date.now() - t.getTime();
    const m = Math.floor(delta / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return t.toLocaleDateString();
  } catch {
    return iso;
  }
}
