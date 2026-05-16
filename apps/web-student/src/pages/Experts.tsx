// Experts — Vidya v1 Expert help (mockup 7/8).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 7/8 (Expert help · doubts).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: SUPPORT · EXPERT HELP · "2 open · avg 14 min" · + New ┐
//   │  ┌─ thread list (sortable, filterable) ─┐ ┌─ thread view ────┐
//   │  │  All · 12 / Open · 2 / Resolved      │ │  Q + AI draft    │
//   │  │  per-thread: title · subject · time  │ │  Helpful/Need…   │
//   │  │  status pill (AI draft / Dr. Mehta…) │ │  follow-up box   │
//   │  └──────────────────────────────────────┘ └──────────────────┘
//
// Doubts surface lives in alp-learning (POST /api/v1/doubts). The
// AI-drafted answer + expert-verification model is a Vidya v1 design
// surface — the existing endpoint returns a plain assistant message
// today; the "AI drafted · awaiting expert" + "Resolved" states are
// rendered against the same payload until the expert-routing model
// lands. Mock threads carry the design forward when the user has no
// real doubts yet.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { auth } from "../lib/api";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface Thread {
  id: string;
  topicId: string;
  topicTitle: string;
  subjectName?: string;
  title: string;
  status: "OPEN" | "ANSWERED" | "AI_DRAFTED";
  createdAt: string;
  updatedAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
  expert?: string | null;
  aiDraft?: string | null;
  attachments?: Array<{ name: string; sizeKb: number }>;
}

type Filter = "all" | "open" | "resolved";

export function Experts() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [reply, setReply] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/doubts?limit=20");
        if (!r.ok || !alive) return;
        const body = (await r.json()) as { doubts?: Thread[] | null };
        const real = Array.isArray(body.doubts) ? body.doubts : [];
        // Always seed the design with at least the mock thread that
        // matches the mockup so the surface is walkable on a fresh
        // account.
        const composed = real.length ? real : MOCK_THREADS;
        if (alive) {
          setThreads(composed);
          setActiveId((cur) => cur ?? composed[0]?.id ?? null);
        }
      } catch {
        if (alive) {
          setThreads(MOCK_THREADS);
          setActiveId(MOCK_THREADS[0]?.id ?? null);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (filter === "open") return t.status === "OPEN" || t.status === "AI_DRAFTED";
      if (filter === "resolved") return t.status === "ANSWERED";
      return true;
    });
  }, [threads, filter]);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const openCount = threads.filter((t) => t.status !== "ANSWERED").length;

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    const next: Thread = {
      ...active,
      messages: [
        ...active.messages,
        { role: "user", content: reply.trim(), ts: new Date().toISOString() },
      ],
    };
    setThreads((cur) => cur.map((t) => (t.id === active.id ? next : t)));
    setReply("");
    // Optimistic only — the production hookup will POST to
    // /api/v1/doubts/{id}/messages and route to a human expert.
  }

  return (
    <VidyaShell
      crumbs="Support · Expert help"
      title="Expert help"
      subtitle={`${openCount} open thread${openCount === 1 ? "" : "s"} · average expert response 14 minutes`}
      actions={<button className="vidya-shell__primary">+ New doubt</button>}
    >
      <div className="vidya-experts">
        {/* Left rail: thread list */}
        <aside className="vidya-experts__list">
          <div className="vidya-experts__filter-row">
            <button
              className={`vidya-shell__chip${filter === "all" ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All · {threads.length}
            </button>
            <button
              className={`vidya-shell__chip${filter === "open" ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setFilter("open")}
            >
              Open · {openCount}
            </button>
            <button
              className={`vidya-shell__chip${filter === "resolved" ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setFilter("resolved")}
            >
              Resolved
            </button>
          </div>

          <ul className="vidya-experts__threads">
            {filtered.length === 0 ? (
              <li style={{ color: "var(--ink-3)", padding: "var(--sp-5)", textAlign: "center" }}>
                No threads in this filter.
              </li>
            ) : (
              filtered.map((t) => {
                const isActive = t.id === activeId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`vidya-experts__thread${isActive ? " vidya-experts__thread--active" : ""}`}
                      onClick={() => setActiveId(t.id)}
                    >
                      <div className="vidya-experts__thread-top">
                        <span className="vidya-experts__thread-title">
                          {t.status === "OPEN" ? (
                            <span className="vidya-experts__thread-dot" aria-hidden />
                          ) : null}
                          {t.title}
                        </span>
                        <span className="vidya-experts__thread-time">
                          {timeAgo(t.updatedAt)}
                        </span>
                      </div>
                      <div className="vidya-experts__thread-bottom">
                        <span className="vidya-experts__thread-subject">
                          {t.subjectName ?? "—"} · {t.topicTitle}
                        </span>
                        <ThreadStatusPill t={t} />
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Right pane: thread view */}
        <section className="vidya-experts__pane">
          {active ? (
            <>
              <header className="vidya-experts__pane-head">
                <div>
                  <div className="vidya-experts__pane-crumb">
                    {(active.subjectName ?? "Subject").toUpperCase()} ·{" "}
                    {active.topicTitle.toUpperCase()} · #{active.id.slice(-4)}
                  </div>
                  <h2 className="vidya-experts__pane-title">{active.title}</h2>
                </div>
                <div className="vidya-experts__pane-actions">
                  <ThreadStatusPill t={active} />
                  <button className="vidya-experts__pane-menu" aria-label="More">
                    ⋯
                  </button>
                </div>
              </header>

              <div className="vidya-experts__transcript">
                {active.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`vidya-msg vidya-msg--${m.role}`}
                  >
                    {m.role === "user" ? (
                      <span className="vidya-msg__avatar">AS</span>
                    ) : (
                      <span className="vidya-msg__avatar vidya-msg__avatar--ai" aria-hidden>
                        ◈
                      </span>
                    )}
                    <div className="vidya-msg__body">
                      <div className="vidya-msg__meta">
                        <span className="vidya-msg__from">
                          {m.role === "user" ? "You" : "Vidya AI · draft answer"}
                        </span>
                        <span className="vidya-msg__time">
                          {timeAgo(m.ts)}
                          {m.role === "assistant" && active.status === "AI_DRAFTED"
                            ? " · awaiting expert verification"
                            : ""}
                        </span>
                      </div>
                      <div
                        className={`vidya-msg__content${m.role === "assistant" ? " vidya-msg__content--ai" : ""}`}
                      >
                        {renderMessage(m.content)}
                      </div>
                    </div>
                  </div>
                ))}

                {active.attachments?.length ? (
                  <div className="vidya-msg__attach">
                    {active.attachments.map((a) => (
                      <span key={a.name} className="vidya-msg__attach-chip">
                        <span className="vidya-msg__attach-icon" aria-hidden>
                          📎
                        </span>
                        <span>
                          <strong>{a.name}</strong>
                          <span> {a.sizeKb} KB</span>
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="vidya-experts__feedback-row">
                <button className="vidya-experts__fb">Helpful</button>
                <button className="vidya-experts__fb">Need more</button>
                <button className="vidya-experts__fb">Ask follow-up</button>
              </div>

              <form className="vidya-experts__composer" onSubmit={sendReply}>
                <textarea
                  className="vidya-experts__composer-input"
                  placeholder="Reply or ask a follow-up…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                />
                <div className="vidya-experts__composer-row">
                  <div className="vidya-experts__composer-attach">
                    <button type="button" aria-label="Attach photo">↑</button>
                    <button type="button" aria-label="Attach link">∞</button>
                  </div>
                  <button
                    type="submit"
                    className="vidya-shell__primary"
                    disabled={!reply.trim()}
                  >
                    ➤ Send to expert
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="vidya-experts__empty">
              Pick a thread on the left to view the conversation.
            </div>
          )}
        </section>
      </div>
    </VidyaShell>
  );
}

function ThreadStatusPill({ t }: { t: Thread }) {
  if (t.status === "ANSWERED") {
    return (
      <span className="vidya-experts__pill vidya-experts__pill--mute">
        {t.expert ? t.expert : "Resolved"}
      </span>
    );
  }
  if (t.status === "AI_DRAFTED") {
    return (
      <span className="vidya-experts__pill vidya-experts__pill--gold">
        ◆ AI drafted · awaiting expert
      </span>
    );
  }
  return (
    <span className="vidya-experts__pill vidya-experts__pill--accent">
      AI draft ready
    </span>
  );
}

function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - Date.parse(iso);
    if (Number.isNaN(ms)) return "";
    const min = Math.round(ms / 60000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return `${d}d`;
  } catch {
    return "";
  }
}

/** Render plain text with simple bullet support (•/- prefix → <li>). */
function renderMessage(text: string): React.ReactNode {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={`b-${key}`} className="vidya-msg__bullets">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("• ") || line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else if (line) {
      flushBullets(`${i}`);
      out.push(
        <p key={i} className="vidya-msg__p">
          {line}
        </p>,
      );
    }
  });
  flushBullets("end");
  return out;
}

/* ── Mock data — used when /doubts returns empty, so the design
   surface is walkable on a fresh student account. ───────────── */

const NOW = Date.now();
const MOCK_THREADS: Thread[] = [
  {
    id: "doubt-4821",
    topicId: "rotational-motion",
    topicTitle: "Rotational motion",
    subjectName: "Physics",
    title: "Why is angular momentum conserved here?",
    status: "AI_DRAFTED",
    createdAt: new Date(NOW - 14 * 60 * 1000).toISOString(),
    updatedAt: new Date(NOW - 14 * 60 * 1000).toISOString(),
    attachments: [{ name: "diagram-rotation.png", sizeKb: 178 }],
    messages: [
      {
        role: "user",
        ts: new Date(NOW - 14 * 60 * 1000).toISOString(),
        content:
          "In this problem (image attached) a particle slides down a frictionless rod attached to a freely rotating axis. The rotational KE clearly changes. So why is angular momentum still considered conserved? Aren't there internal forces doing work?",
      },
      {
        role: "assistant",
        ts: new Date(NOW - 12 * 60 * 1000).toISOString(),
        content:
          "Short answer: angular momentum is conserved because the net external torque about the axis is zero — not because no work is done.\n\nWhy energy can still change:\n• Conservation of L only requires τ_ext = 0.\n• Internal forces (constraint, normal) can change the moment of inertia I, so ω adjusts as L = Iω stays fixed.\n• That redistribution does work on the particle — hence rotational KE = L²/2I can vary as I varies.\n\nClassic example: an ice skater pulling in their arms. L is constant, KE goes up because muscles do internal work.",
      },
    ],
  },
  {
    id: "doubt-4820",
    topicId: "organic-chemistry",
    topicTitle: "Organic",
    subjectName: "Chemistry",
    title: "Diff between SN1 and SN2 — solvent effect",
    status: "ANSWERED",
    createdAt: new Date(NOW - 2 * 3600 * 1000).toISOString(),
    updatedAt: new Date(NOW - 2 * 3600 * 1000).toISOString(),
    expert: "Dr. Mehta",
    messages: [
      {
        role: "user",
        ts: new Date(NOW - 2 * 3600 * 1000).toISOString(),
        content: "Why does polar protic favor SN1 vs polar aprotic for SN2?",
      },
      {
        role: "assistant",
        ts: new Date(NOW - 1.8 * 3600 * 1000).toISOString(),
        content: "Polar protic solvates the leaving group via H-bonding — stabilizes the carbocation in SN1. Polar aprotic leaves the nucleophile reactive but doesn't stabilize charges, favoring the concerted SN2.",
      },
    ],
  },
  {
    id: "doubt-4819",
    topicId: "cell-biology",
    topicTitle: "Cell biology",
    subjectName: "Biology",
    title: "Cell cycle — G1 vs G0 distinction",
    status: "OPEN",
    createdAt: new Date(NOW - 1 * 86400 * 1000).toISOString(),
    updatedAt: new Date(NOW - 1 * 86400 * 1000).toISOString(),
    expert: "Anjali R.",
    messages: [
      {
        role: "user",
        ts: new Date(NOW - 1 * 86400 * 1000).toISOString(),
        content: "When does a cell formally enter G0 vs being in extended G1?",
      },
    ],
  },
  {
    id: "doubt-4818",
    topicId: "waves",
    topicTitle: "Waves",
    subjectName: "Physics",
    title: "Doppler effect — relative velocities sign",
    status: "ANSWERED",
    createdAt: new Date(NOW - 2 * 86400 * 1000).toISOString(),
    updatedAt: new Date(NOW - 2 * 86400 * 1000).toISOString(),
    expert: "Resolved",
    messages: [],
  },
  {
    id: "doubt-4817",
    topicId: "organic",
    topicTitle: "Organic",
    subjectName: "Chemistry",
    title: "Acid strength order — para vs meta",
    status: "ANSWERED",
    createdAt: new Date(NOW - 4 * 86400 * 1000).toISOString(),
    updatedAt: new Date(NOW - 4 * 86400 * 1000).toISOString(),
    expert: "Resolved",
    messages: [],
  },
  {
    id: "doubt-4816",
    topicId: "plant-phys",
    topicTitle: "Plant phys",
    subjectName: "Biology",
    title: "Photosynthesis — C3 vs C4 vs CAM",
    status: "ANSWERED",
    createdAt: new Date(NOW - 7 * 86400 * 1000).toISOString(),
    updatedAt: new Date(NOW - 7 * 86400 * 1000).toISOString(),
    expert: "Resolved",
    messages: [],
  },
  {
    id: "doubt-4815",
    topicId: "gravitation",
    topicTitle: "Gravitation",
    subjectName: "Physics",
    title: "Kepler's third law derivation",
    status: "ANSWERED",
    createdAt: new Date(NOW - 7 * 86400 * 1000).toISOString(),
    updatedAt: new Date(NOW - 7 * 86400 * 1000).toISOString(),
    expert: "Resolved",
    messages: [],
  },
];
