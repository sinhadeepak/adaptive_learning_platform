// Phase 1D-3 — AI tutor chat history (list + transcript view).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

interface SessionSummary {
  id: string;
  userId: string;
  topicId: string | null;
  title: string | null;
  summary: string | null;
  startedAt: string;
  lastMsgAt: string;
  msgCount: number;
}

interface ChatMessage {
  idx: number;
  role: "user" | "assistant" | "system";
  contentMd: string;
  createdAt: string;
}

interface Transcript extends SessionSummary {
  messages: ChatMessage[];
}

export function TutorChatHistory() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("userId", user.id);
        if (q.trim()) params.set("q", q.trim());
        const r = await auth.fetch(`/api/v1/adaptive/tutor/chat-sessions?${params}`);
        if (alive && r.ok) {
          const body = (await r.json()) as { sessions: SessionSummary[] };
          setSessions(body.sessions);
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, q]);

  return (
    <AppShell title="Tutor history">
      <main className="page" style={{ padding: 24, maxWidth: 900 }}>
        <h1 style={{ marginTop: 0 }}>AI tutor history</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Search past conversations with your AI tutor.
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by topic, keyword…"
          style={{
            padding: "10px 14px",
            width: "100%",
            maxWidth: 480,
            background: "var(--bg-surface1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 16,
          }}
        />
        {!loaded && <p>Loading…</p>}
        {loaded && sessions.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>
            No past chats. Start one from any topic page.
          </p>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sessions.map((s) => (
            <li
              key={s.id}
              style={{
                padding: "12px 14px",
                marginBottom: 8,
                background: "var(--bg-surface1)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
              }}
            >
              <Link
                to={`/tutor-history/${s.id}`}
                style={{ color: "var(--text-primary)", textDecoration: "none" }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.title ?? "(untitled chat)"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {s.msgCount} message{s.msgCount === 1 ? "" : "s"} · last{" "}
                  {new Date(s.lastMsgAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </AppShell>
  );
}

export function TutorChatTranscript() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/adaptive/tutor/chat-sessions/${sessionId}`);
        if (alive && r.ok) setTranscript((await r.json()) as Transcript);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  if (!loaded) return <AppShell title="Tutor chat">Loading…</AppShell>;
  if (!transcript)
    return (
      <AppShell title="Tutor chat">
        <main className="page" style={{ padding: 24 }}>
          <p>Chat not found.</p>
          <Link to="/tutor-history">← Back</Link>
        </main>
      </AppShell>
    );

  return (
    <AppShell title={transcript.title ?? "Tutor chat"}>
      <main className="page" style={{ padding: 24, maxWidth: 800 }}>
        <Link to="/tutor-history" style={{ color: "var(--text-muted)", fontSize: 12 }}>
          ← Back to history
        </Link>
        <h1 style={{ marginTop: 8 }}>{transcript.title ?? "Untitled chat"}</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Started {new Date(transcript.startedAt).toLocaleString()} ·{" "}
          {transcript.msgCount} messages
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {transcript.messages.map((m) => (
            <div
              key={m.idx}
              style={{
                padding: 12,
                background:
                  m.role === "user"
                    ? "var(--bg-surface, #1f1f1f)"
                    : "var(--bg-surface1, #262626)",
                border: "1px solid var(--border-default)",
                borderLeft: `3px solid ${m.role === "user" ? "var(--color-blue, #4F87F6)" : "var(--color-ai, #A78BFA)"}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {m.role}
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>
                {m.contentMd}
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
