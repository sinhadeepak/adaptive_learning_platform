// TutorChatHistory — Vidya v1 redesign.
//
// AI tutor chat history (list + transcript view). Layout: VidyaShell
// (crumbs + title + subtitle + back action) → search input + session
// list, with a sibling transcript route for the per-session detail.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

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

  const backAction = (
    <Link
      to="/experts"
      className="vidya-shell__chip"
      style={{ textDecoration: "none" }}
    >
      ← Experts
    </Link>
  );

  return (
    <VidyaShell
      crumbs="LEARN · AI TUTOR · HISTORY"
      title="Chat history"
      subtitle="Your past conversations with the AI tutor."
      actions={backAction}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by topic, keyword…"
        style={{
          padding: "10px 14px",
          width: "100%",
          maxWidth: 480,
          background: "var(--paper-2)",
          color: "var(--ink)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 16,
        }}
      />
      {!loaded && <p>Loading…</p>}
      {loaded && sessions.length === 0 && (
        <p style={{ color: "var(--ink-3)" }}>
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
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
            }}
          >
            <Link
              to={`/tutor-history/${s.id}`}
              style={{ color: "var(--ink)", textDecoration: "none" }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {s.title ?? "(untitled chat)"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                {s.msgCount} message{s.msgCount === 1 ? "" : "s"} · last{" "}
                {new Date(s.lastMsgAt).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </VidyaShell>
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

  const backAction = (
    <Link
      to="/tutor-history"
      className="vidya-shell__chip"
      style={{ textDecoration: "none" }}
    >
      ← History
    </Link>
  );

  if (!loaded) {
    return (
      <VidyaShell
        crumbs="LEARN · AI TUTOR · CHAT"
        title="Tutor chat"
        actions={backAction}
      >
        Loading…
      </VidyaShell>
    );
  }
  if (!transcript) {
    return (
      <VidyaShell
        crumbs="LEARN · AI TUTOR · CHAT"
        title="Tutor chat"
        actions={backAction}
      >
        <p>Chat not found.</p>
      </VidyaShell>
    );
  }

  const title = transcript.title ?? "Untitled chat";
  const subtitle = `Started ${new Date(transcript.startedAt).toLocaleString()} · ${transcript.msgCount} messages`;

  return (
    <VidyaShell
      crumbs="LEARN · AI TUTOR · CHAT"
      title={title}
      subtitle={subtitle}
      actions={backAction}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {transcript.messages.map((m) => (
          <div
            key={m.idx}
            style={{
              padding: 12,
              background:
                m.role === "user"
                  ? "var(--card, #1f1f1f)"
                  : "var(--paper-2, #262626)",
              border: "1px solid var(--rule)",
              borderLeft: `3px solid ${m.role === "user" ? "var(--info, #4F87F6)" : "var(--gold, #A78BFA)"}`,
              borderRadius: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
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
    </VidyaShell>
  );
}
