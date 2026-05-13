import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { TutorBody, TutorFollowups, parseTutorReply } from "./TutorMessage";

// Streaming chat panel for AI doubt-resolution. Uses POST + fetch streaming
// (not EventSource — EventSource is GET-only and we need to send the
// conversation history as a request body).
//
// Wire format from the server:
//   data: {"delta":"some "}\n\n
//   data: {"delta":"text"}\n\n
//   data: [DONE]\n\n
//
// We parse line-by-line and append `delta` strings to the in-flight assistant
// message. On [DONE] or stream close, we lock the assistant turn and re-enable
// the input.

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  topicId: string;
  topicTitle: string;
}

export function AITutorChat({ topicId, topicTitle }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript as deltas arrive.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  async function send(rawText?: string) {
    const trimmed = (rawText ?? input).trim();
    if (!trimmed || streaming) return;
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    if (rawText === undefined) setInput("");
    setStreaming(true);

    // Show the assistant bubble immediately as an empty placeholder so the
    // user sees something happening before the first delta arrives.
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await auth.fetch("/api/v1/adaptive/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId,
          messages: next,
          userId: user?.id,
          chatSessionId,
        }),
      });

      if (!res.ok || !res.body) {
        appendToAssistant("Sorry — couldn't reach the tutor service.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines; data lines start with `data: `.
        let nl;
        while ((nl = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const obj = JSON.parse(payload) as { delta?: string; chatSessionId?: string };
            if (obj.chatSessionId) setChatSessionId(obj.chatSessionId);
            if (obj.delta) appendToAssistant(obj.delta);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch {
      appendToAssistant("\n\n(Connection dropped.)");
    } finally {
      setStreaming(false);
    }
  }

  function appendToAssistant(chunk: string) {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last && last.role === "assistant") {
        return [
          ...m.slice(0, -1),
          { role: "assistant", content: last.content + chunk },
        ];
      }
      return [...m, { role: "assistant", content: chunk }];
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 12,
          background: "linear-gradient(90deg, var(--color-blue), var(--color-purple))",
          color: "white",
          border: "none",
          padding: "10px 18px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        ◈ Ask the AI tutor about {topicTitle}
      </button>
    );
  }

  return (
    <section
      className="card"
      style={{ marginTop: 12, padding: 0, overflow: "hidden" }}
      aria-label="AI Tutor"
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background:
            "linear-gradient(90deg, rgba(79,135,246,0.10), rgba(102,67,255,0.10))",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 13 }}>◈ AI Tutor — {topicTitle}</strong>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Ask anything; replies stream in.
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link
            to="/tutor-history"
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              textDecoration: "none",
              padding: "4px 8px",
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
            }}
          >
            History →
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              color: "var(--text-faint)",
              border: "1px solid var(--border-strong)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        style={{
          maxHeight: 420,
          minHeight: 180,
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
            e.g. "Walk me through the third Newton's law with a real example", "Why
            does entropy always increase in an isolated system?"
          </div>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === "user";
            const last = i === messages.length - 1;
            const parsed = isUser ? null : parseTutorReply(m.content);
            return (
              <div
                key={i}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: isUser ? "85%" : "92%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    padding: "9px 13px",
                    borderRadius: isUser ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                    background: isUser
                      ? "rgba(79,135,246,0.15)"
                      : "var(--surface-elev1)",
                    border: isUser
                      ? "1px solid rgba(79,135,246,0.22)"
                      : "1px solid var(--border)",
                    whiteSpace: isUser ? "pre-wrap" : "normal",
                    wordWrap: "break-word",
                  }}
                >
                  {isUser ? (
                    m.content
                  ) : parsed && (parsed.body || parsed.artifacts.length > 0) ? (
                    <TutorBody reply={parsed} />
                  ) : streaming && last ? (
                    "…"
                  ) : (
                    ""
                  )}
                </div>
                {!isUser && parsed && last && parsed.followups.length > 0 ? (
                  <TutorFollowups
                    items={parsed.followups}
                    disabled={streaming}
                    onPick={(text) => send(text)}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: 10,
          borderTop: "1px solid var(--border)",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? "Tutor is replying…" : "Type your question…"}
          disabled={streaming}
          style={{
            flex: 1,
            background: "var(--surface-elev1)",
            border: "1px solid var(--border-strong)",
            color: "inherit",
            padding: "8px 10px",
            borderRadius: 4,
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          style={{
            background: "var(--color-blue)",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            opacity: streaming || !input.trim() ? 0.5 : 1,
            cursor: streaming ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
