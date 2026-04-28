import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// Doubts list — persistent threads backed by the doubts service.
// Distinct from /experts (AI tutor free-form chat in localStorage):
// these threads survive across devices and route to humans (peer/expert)
// once the AI doesn't suffice. Source for the inbox `doubt.answered`
// notification deep-link.

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
    <AppShell title="My doubts">
      <p className="muted" style={{ marginTop: 0, marginBottom: "var(--sp-3)" }}>
        Persistent question threads. AI tutor replies first; if you mark a
        thread unresolved, an expert can pick it up.
      </p>

      {error ? <Banner tone="danger" role="alert">{error}</Banner> : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        {(["all", "open", "answered", "resolved"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${filter === f ? "var(--color-blue)" : "var(--border-default)"}`,
              background: filter === f ? "var(--color-blue)" : "transparent",
              color: filter === f ? "#fff" : "var(--text-primary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setComposing((c) => !c)}
        >
          {composing ? "Cancel" : "Ask a question"}
        </button>
      </div>

      {composing ? (
        <div
          style={{
            background: "var(--bg-surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-3)",
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
            rows={4}
            placeholder="What's the question? Add context — formula, attempt, where you got stuck."
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {draft.length}/4000 · 4 char minimum
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={postNew}
              disabled={draft.trim().length < 4 || posting}
            >
              {posting ? "Posting…" : "Post →"}
            </button>
          </div>
        </div>
      ) : null}

      {filtered === null ? (
        <SkeletonRows count={4} />
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "var(--sp-5)",
            textAlign: "center",
            color: "var(--text-muted)",
            border: "1px dashed var(--border-default)",
            borderRadius: 12,
            background: "var(--bg-surface-1)",
          }}
        >
          {items && items.length === 0 ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
              <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 6 }}>
                No doubts yet
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Tap "Ask a question" above — your thread will be saved here and
                ping your inbox when an answer arrives.
              </div>
            </>
          ) : (
            <>No doubts match this filter.</>
          )}
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {filtered.map((d) => (
            <li key={d.id}>
              <Link
                to={`/doubts/${d.id}`}
                style={{
                  display: "block",
                  background: "var(--bg-surface-1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 12,
                  padding: "var(--sp-3)",
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
                  }}
                >
                  <Pill tone={statusTone(d.status)}>{d.status}</Pill>
                  {d.topicTitle ? <Pill tone="info">◈ {d.topicTitle}</Pill> : null}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {relative(d.lastActivityAt)}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--text-primary)",
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
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  {d.answerCount} answer{d.answerCount === 1 ? "" : "s"}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
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
