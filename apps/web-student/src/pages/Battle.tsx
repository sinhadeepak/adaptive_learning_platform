// F7 — Battle: quick-play lobby + live match + result screen.
//
// One page, four phases driven by WS messages from alp-battle:
//   - "idle"     → show Find Opponent button
//   - "queuing"  → searching animation + ELO band
//   - "playing"  → 10-question game with shared 30s timer
//   - "result"   → ranked podium + ELO deltas + Rematch CTA
//
// Chat is allowed during the lobby + scoring phases (the server
// enforces; UI just shows the input when phase ∈ {queuing, result}).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { battleClient, type BattleEnvelope } from "../lib/battle";
import { auth } from "../lib/api";

interface Profile {
  exams: Array<{ examId: string }>;
}

type Phase = "idle" | "queuing" | "starting" | "playing" | "result";

interface Question {
  idx: number;
  stem: string;
  choices: string[];
  deadlineMs: number;
}

interface PlayerScore {
  userId: string;
  displayName: string;
  score: number;
  correct: number;
  total: number;
}

interface LeaderboardRow {
  userId: string;
  rank: number;
  score: number;
}

interface ScoredResult {
  perPlayer: PlayerScore[];
  leaderboard: LeaderboardRow[];
  eloDelta: Record<string, number>;
}

interface ChatLine {
  userId: string;
  body: string;
  sentAt: number;
}

export function Battle() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [eloBand, setEloBand] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [opponentsAnswered, setOpponentsAnswered] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ScoredResult | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatDraft, setChatDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const questionStartMs = useRef<number>(0);

  const examId = useMemo(() => profile?.exams?.[0]?.examId ?? null, [profile]);
  const myUserId = auth.getUser?.()?.id ?? "";

  // Load profile.
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok) setProfile(await r.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Connect + dispatch WS envelopes.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        await battleClient.connect();
        setConnected(true);
        unsub = battleClient.on((env: BattleEnvelope) => {
          switch (env.t) {
            case "lobby.queued": {
              const p = env.p as { eloBand: number };
              setPhase("queuing");
              setEloBand(p.eloBand);
              break;
            }
            case "lobby.matched": {
              const p = env.p as { matchId: string };
              setMatchId(p.matchId);
              setPhase("starting");
              setResult(null);
              setChat([]);
              break;
            }
            case "lobby.cancelled":
              setPhase("idle");
              setMatchId(null);
              setQuestion(null);
              break;
            case "match.starting": {
              setPhase("starting");
              break;
            }
            case "match.question": {
              const p = env.p as Question;
              setPhase("playing");
              setQuestion(p);
              setPickedIdx(null);
              setOpponentsAnswered(new Set());
              questionStartMs.current = Date.now();
              const remaining = Math.max(0, Math.floor((p.deadlineMs - Date.now()) / 1000));
              setSecondsLeft(remaining);
              break;
            }
            case "match.tick": {
              const p = env.p as { idx: number; secondsRemaining: number };
              setSecondsLeft(p.secondsRemaining);
              break;
            }
            case "match.player_answered": {
              const p = env.p as { userId: string; idx: number };
              setOpponentsAnswered((prev) => new Set(prev).add(p.userId));
              break;
            }
            case "match.scored": {
              const p = env.p as ScoredResult;
              setResult(p);
              setPhase("result");
              setQuestion(null);
              break;
            }
            case "chat.msg": {
              const p = env.p as ChatLine;
              setChat((c) => [...c, p].slice(-20));
              break;
            }
            case "error": {
              const p = env.p as { code: string; message: string };
              setError(p.message || p.code);
              if (p.code === "queue_timeout") setPhase("idle");
              break;
            }
          }
        });
      } catch (e) {
        setError(`Battle service unavailable: ${(e as Error).message}`);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Local fallback timer (in case ticks drop): decrement every second when playing.
  useEffect(() => {
    if (phase !== "playing" || !question) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, question?.idx]);

  const queue = useCallback(() => {
    if (!examId) {
      setError("Set an exam in your profile before queueing.");
      return;
    }
    setError(null);
    battleClient.send("lobby.queue", { examId });
  }, [examId]);

  const cancel = useCallback(() => {
    battleClient.send("room.leave");
    setPhase("idle");
    setEloBand(null);
  }, []);

  const submitAnswer = useCallback(
    (idx: number) => {
      if (!question || pickedIdx !== null) return;
      const timeMs = Date.now() - questionStartMs.current;
      setPickedIdx(idx);
      battleClient.send("match.answer", {
        questionIdx: question.idx,
        pickedIdx: idx,
        timeMs,
      });
    },
    [question, pickedIdx],
  );

  const sendChat = useCallback(() => {
    const body = chatDraft.trim();
    if (!body) return;
    battleClient.send("chat.send", { body });
    setChatDraft("");
  }, [chatDraft]);

  const myResult = result?.perPlayer.find((r) => r.userId === myUserId);
  const myEloDelta = result?.eloDelta[myUserId] ?? 0;

  return (
    <AppShell
      title="Battle"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          ← Practice
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 960 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        {phase === "idle" && (
          <IdlePhase connected={connected} onQueue={queue} />
        )}

        {phase === "queuing" && (
          <QueuingPhase eloBand={eloBand} onCancel={cancel} />
        )}

        {phase === "starting" && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
              ⚡ Match starting…
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              {matchId && `Match ${matchId.slice(0, 8)}…`}
            </div>
          </div>
        )}

        {phase === "playing" && question && (
          <PlayingPhase
            question={question}
            pickedIdx={pickedIdx}
            secondsLeft={secondsLeft}
            opponentsAnswered={opponentsAnswered}
            onPick={submitAnswer}
          />
        )}

        {phase === "result" && result && (
          <ResultPhase
            result={result}
            myUserId={myUserId}
            myResult={myResult ?? null}
            myEloDelta={myEloDelta}
            chat={chat}
            chatDraft={chatDraft}
            onChatDraft={setChatDraft}
            onSendChat={sendChat}
            onRematch={queue}
            onLeave={() => setPhase("idle")}
          />
        )}
      </div>
    </AppShell>
  );
}

// ── Phase sub-components ─────────────────────────────────────────────

function IdlePhase({ connected, onQueue }: { connected: boolean; onQueue: () => void }) {
  return (
    <>
      <header className="pg-header">
        <div className="pg-header-main">
          <h1 className="pg-header-title">Battle other students live</h1>
          <p className="pg-header-sub">
            10 questions. 30 seconds each. Server-authoritative scoring with
            Glicko-2 ratings. Find an opponent near your skill level.
          </p>
        </div>
      </header>
      <section className="pg-section" style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 14, marginBottom: 16, color: "var(--text-muted)" }}>
          {connected ? "✓ Connected to battle server" : "Connecting…"}
        </div>
        <button
          type="button"
          className="pg-btn pg-btn-primary"
          onClick={onQueue}
          disabled={!connected}
          style={{ minWidth: 200, fontSize: 16, padding: "12px 24px" }}
        >
          Find opponent
        </button>
      </section>
    </>
  );
}

function QueuingPhase({ eloBand, onCancel }: { eloBand: number | null; onCancel: () => void }) {
  return (
    <section className="pg-section" style={{ padding: 64, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🔄</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        Searching for opponent…
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
        {eloBand !== null
          ? `ELO band ${eloBand} — widening search after 30 s`
          : ""}
      </div>
      <button type="button" className="pg-btn pg-btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}

function PlayingPhase({
  question,
  pickedIdx,
  secondsLeft,
  opponentsAnswered,
  onPick,
}: {
  question: Question;
  pickedIdx: number | null;
  secondsLeft: number;
  opponentsAnswered: Set<string>;
  onPick: (idx: number) => void;
}) {
  const dangerLow = secondsLeft <= 5;
  return (
    <section className="pg-section">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Question {question.idx + 1}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: dangerLow ? "var(--color-danger)" : "var(--text-primary)",
            transition: "color 200ms",
          }}
        >
          {secondsLeft}s
        </div>
      </div>

      <div style={{ fontSize: 17, lineHeight: 1.5, marginBottom: 24 }}>
        {question.stem}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {question.choices.map((choice, i) => {
          const isPicked = pickedIdx === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              disabled={pickedIdx !== null}
              style={{
                textAlign: "left",
                padding: "14px 18px",
                borderRadius: 8,
                border: isPicked
                  ? "2px solid var(--color-blue)"
                  : "1px solid var(--border-subtle)",
                background: isPicked
                  ? "rgba(47,93,203,0.10)"
                  : "var(--bg-elevated)",
                cursor: pickedIdx === null ? "pointer" : "not-allowed",
                opacity: pickedIdx !== null && !isPicked ? 0.5 : 1,
                fontSize: 14,
              }}
            >
              <span style={{ fontWeight: 600, marginRight: 8 }}>
                {String.fromCharCode(65 + i)}.
              </span>
              {choice}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-muted)" }}>
        {pickedIdx !== null
          ? "✓ Locked in — waiting for opponent…"
          : "Tap to lock in your answer. Faster = more points."}
        {opponentsAnswered.size > 0 && (
          <span style={{ marginLeft: 12 }}>
            🟢 {opponentsAnswered.size} opponent
            {opponentsAnswered.size > 1 ? "s" : ""} answered
          </span>
        )}
      </div>
    </section>
  );
}

function ResultPhase({
  result,
  myUserId,
  myResult,
  myEloDelta,
  chat,
  chatDraft,
  onChatDraft,
  onSendChat,
  onRematch,
  onLeave,
}: {
  result: ScoredResult;
  myUserId: string;
  myResult: PlayerScore | null;
  myEloDelta: number;
  chat: ChatLine[];
  chatDraft: string;
  onChatDraft: (s: string) => void;
  onSendChat: () => void;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const myRank =
    result.leaderboard.find((r) => r.userId === myUserId)?.rank ?? null;
  return (
    <>
      <header className="pg-header">
        <div className="pg-header-main">
          <h1 className="pg-header-title">
            {myRank === 1 ? "🏆 You won!" : myRank === 2 ? "🥈 So close" : "Match complete"}
          </h1>
          {myResult && (
            <p className="pg-header-sub">
              You scored {myResult.score} points · {myResult.correct} /{" "}
              {myResult.total} correct · ELO{" "}
              {myEloDelta >= 0 ? "+" : ""}
              {myEloDelta}
            </p>
          )}
        </div>
      </header>

      <section className="pg-section">
        <h2 className="pg-section-title">Leaderboard</h2>
        <div className="pg-list">
          {result.leaderboard.map((row) => {
            const player = result.perPlayer.find((p) => p.userId === row.userId);
            const isMe = row.userId === myUserId;
            return (
              <div className="pg-row" key={row.userId}>
                <div className="pg-row-main">
                  <p className="pg-row-title">
                    {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉"}{" "}
                    {player?.displayName ?? row.userId.slice(0, 8)}
                    {isMe && (
                      <span style={{ marginLeft: 8, color: "var(--color-blue)", fontSize: 12 }}>
                        you
                      </span>
                    )}
                  </p>
                  <div className="pg-row-meta">
                    <span>{row.score} pts</span>
                    {player && (
                      <>
                        <span className="pg-row-meta-dot">·</span>
                        <span>
                          {player.correct}/{player.total} correct
                        </span>
                      </>
                    )}
                    <span className="pg-row-meta-dot">·</span>
                    <span style={{ color: result.eloDelta[row.userId] >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                      ELO {result.eloDelta[row.userId] >= 0 ? "+" : ""}
                      {result.eloDelta[row.userId]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pg-section">
        <h2 className="pg-section-title">Lobby chat</h2>
        <div
          style={{
            maxHeight: 200,
            overflowY: "auto",
            padding: 12,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          {chat.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              No messages yet. Say "gg" 👋
            </div>
          ) : (
            chat.map((line, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>
                  {line.userId.slice(0, 8)}:
                </span>{" "}
                <span>{line.body}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={chatDraft}
            onChange={(e) => onChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSendChat();
            }}
            placeholder="Type a message…"
            maxLength={500}
            style={{ flex: 1, padding: 8, fontSize: 13 }}
          />
          <button type="button" className="pg-btn pg-btn-primary" onClick={onSendChat}>
            Send
          </button>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" className="pg-btn pg-btn-ghost" onClick={onLeave}>
          Leave
        </button>
        <button type="button" className="pg-btn pg-btn-primary" onClick={onRematch}>
          Find another →
        </button>
      </div>
    </>
  );
}
