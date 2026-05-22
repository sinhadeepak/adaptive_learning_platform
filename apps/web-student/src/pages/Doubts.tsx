// Doubts — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + status filter chips +
// Ask-a-question primary action) → optional compose card → vertical list
// of vidya-card-block rows. Each row: status chip (toned per state) +
// optional topic chip + last-activity meta + clamped question preview.
//
// Distinct from /experts (AI tutor free-form chat in localStorage):
// these threads survive across devices and route to humans (peer/expert)
// once the AI doesn't suffice. Source for the inbox `doubt.answered`
// notification deep-link.

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface DoubtSummary {
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
}

type Filter = "all" | "open" | "answered" | "resolved";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  open: "Open",
  answered: "Answered",
  resolved: "Resolved",
};

type ChipTone = "info" | "success" | "warning" | "muted";

function chipToneStyle(tone: ChipTone): CSSProperties {
  const tones: Record<ChipTone, CSSProperties> = {
    info:    { background: "var(--info-soft)", color: "var(--info)" },
    success: { background: "var(--good-soft)", color: "var(--good)" },
    warning: { background: "var(--warn-soft)", color: "var(--warn)" },
    muted:   { background: "var(--paper-2)",   color: "var(--ink-3)" },
  };
  return tones[tone];
}

export function Doubts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<DoubtSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  async function load() {
    try {
      const r = await auth.fetch(`/api/v1/doubts`);
      if (!r.ok) {
        setError("We couldn't load your doubts.");
        return;
      }
      const body = (await r.json()) as { items: DoubtSummary[] };
      setItems(body.items);
    } catch {
      setError("Network error loading doubts.");
    }
  }

  async function postNew() {
    const q = draft.trim();
    if (q.length < 4 || posting) return;
    setPosting(true);
    try {
      const r = await auth.fetch(`/api/v1/doubts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionText: q }),
      });
      if (r.ok) {
        const body = (await r.json()) as { id: string };
        setDraft("");
        setComposing(false);
        navigate(`/doubts/${body.id}`);
      }
    } finally {
      setPosting(false);
    }
  }

  const filtered = items
    ? items.filter((it) => {
        if (filter === "all") return true;
        return it.status.toLowerCase() === filter;
      })
    : null;

  return (
    <VidyaShell
      crumbs="LEARN · DOUBTS"
      title="Doubts"
      subtitle="Questions you've asked the AI tutor — pending, answered, resolved. AI tutor replies first; if you mark a thread unresolved, an expert can pick it up."
      chips={
        <>
          {(["all", "open", "answered", "resolved"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`vidya-shell__chip${filter === f ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </>
      }
      actions={
        <button
          type="button"
          className="vidya-shell__primary"
          onClick={() => setComposing((c) => !c)}
        >
          {composing ? "Cancel" : "＋ Ask a question"}
        </button>
      }
    >
      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--bad)",
            color: "var(--paper)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            margin: "0 0 var(--sp-3) 0",
          }}
        >
          {error}
        </div>
      ) : null}

      {composing ? (
        <div
          className="vidya-card-block"
          style={{ marginBottom: "var(--sp-3)" }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
            rows={4}
            placeholder="What's the question? Add context — formula, attempt, where you got stuck."
            style={{
              width: "100%",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              color: "var(--ink)",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {draft.length}/4000 · 4 char minimum
            </span>
            <button
              type="button"
              className="vidya-shell__primary"
              onClick={postNew}
              disabled={draft.trim().length < 4 || posting}
            >
              {posting ? "Posting…" : "Post →"}
            </button>
          </div>
        </div>
      ) : null}

      {filtered === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="vidya-card-block"
              style={{ opacity: 0.5, minHeight: 72 }}
              aria-hidden
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--sp-2)",
            padding: "var(--sp-5)",
            textAlign: "center",
            background: "var(--card)",
            border: "1px dashed var(--rule)",
            borderRadius: "var(--radius-2)",
            color: "var(--ink-3)",
          }}
        >
          {items && items.length === 0 ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }} aria-hidden>💬</div>
              <div style={{ color: "var(--ink)", fontWeight: 600, marginBottom: 6 }}>
                No doubts yet
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 480 }}>
                Tap "Ask a question" above — your thread will be saved here and
                ping your inbox when an answer arrives.
              </div>
            </>
          ) : (
            <>No doubts match this filter.</>
          )}
        </section>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-3)",
          }}
        >
          {filtered.map((d) => (
            <li key={d.id}>
              <Link
                to={`/doubts/${d.id}`}
                className="vidya-card-block"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="vidya-shell__chip"
                    style={chipToneStyle(statusTone(d.status))}
                  >
                    {d.status}
                  </span>
                  {d.topicTitle ? (
                    <span
                      className="vidya-shell__chip"
                      style={chipToneStyle("info")}
                    >
                      ◈ {d.topicTitle}
                    </span>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {relative(d.lastActivityAt)}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--ink)",
                    fontSize: 14,
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {d.questionText}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--ink-2)",
                  }}
                >
                  <span>{d.answerCount} answer{d.answerCount === 1 ? "" : "s"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </VidyaShell>
  );
}

function statusTone(s: string): ChipTone {
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
