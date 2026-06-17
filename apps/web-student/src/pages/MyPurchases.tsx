// MyPurchases — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + Active/Pending/Refunded
// tabs + Browse-courses primary action) → vertical list of vidya-card-block
// rows. Each row: course thumb + title + meta (price, purchased date,
// description) + status chip + Resume / Rate actions. Inline modal for
// rating submission (replaces the legacy Aurora modal CSS).

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { type Purchase, courseMarketplace } from "../lib/api";

interface CourseInfo {
  title: string;
  description?: string;
  coverImageUrl?: string;
}

const THUMB_GRADIENTS = [
  "linear-gradient(135deg, #4F87F6, #A78BFA)",
  "linear-gradient(135deg, #22D4EE, #4F87F6)",
  "linear-gradient(135deg, #10C47A, #22D4EE)",
  "linear-gradient(135deg, #F5A623, #F43F5E)",
  "linear-gradient(135deg, #A78BFA, #F472B6)",
];

function thumbFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return THUMB_GRADIENTS[h % THUMB_GRADIENTS.length];
}

function initialFor(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || "C";
}

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

function statusChipStyle(tone: "success" | "info" | "warn" | "danger" | "muted"): CSSProperties {
  const tones = {
    success: { background: "var(--good-soft)", color: "var(--good)" },
    info:    { background: "var(--info-soft)", color: "var(--info)" },
    warn:    { background: "var(--warn-soft)", color: "var(--warn)" },
    danger:  { background: "var(--bad-soft)",  color: "var(--bad)"  },
    muted:   { background: "var(--paper-2)",   color: "var(--ink-3)" },
  };
  return tones[tone];
}

type Tab = "active" | "pending" | "refunded";

const STATUS_INFO: Record<
  Purchase["status"],
  { label: string; tone: "success" | "warn" | "danger" | "muted" }
> = {
  PAID: { label: "Active", tone: "success" },
  PENDING_PAYMENT: { label: "Payment pending", tone: "warn" },
  REFUNDED: { label: "Refunded", tone: "muted" },
};

const TAB_LABELS: Record<Tab, string> = {
  active: "Active",
  pending: "Pending",
  refunded: "Refunded",
};

function tabFor(p: Purchase): Tab {
  if (p.status === "PAID") return "active";
  if (p.status === "PENDING_PAYMENT") return "pending";
  return "refunded";
}

export function MyPurchases() {
  const [items, setItems] = useState<Purchase[] | null>(null);
  const [courses, setCourses] = useState<Record<string, CourseInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [rating, setRating] = useState<{ purchase: Purchase; stars: number; comment: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    setError(null);
    courseMarketplace
      .myPurchases()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }
  useEffect(refresh, []);

  // Lazy-fetch course titles so the list shows real names instead of UUIDs.
  useEffect(() => {
    if (!items) return;
    const unknown = Array.from(new Set(items.map((p) => p.courseId))).filter(
      (id) => !courses[id],
    );
    if (unknown.length === 0) return;
    let alive = true;
    void (async () => {
      const next: Record<string, CourseInfo> = {};
      await Promise.all(
        unknown.map(async (id) => {
          try {
            const c = await courseMarketplace.get(id);
            next[id] = {
              title: c.title,
              description: c.description ?? undefined,
              coverImageUrl: c.coverImageUrl ?? undefined,
            };
          } catch {
            next[id] = { title: "Course" };
          }
        }),
      );
      if (alive) setCourses((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      alive = false;
    };
  }, [items, courses]);

  async function submitRating() {
    if (!rating) return;
    setSubmitting(true);
    try {
      await courseMarketplace.rate(
        rating.purchase.courseId,
        rating.purchase.id,
        rating.stars,
        rating.comment.trim() || undefined,
      );
      setRating(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = useMemo(() => {
    if (!items) return { active: [], pending: [], refunded: [] };
    const out: Record<Tab, Purchase[]> = { active: [], pending: [], refunded: [] };
    for (const p of items) out[tabFor(p)].push(p);
    return out;
  }, [items]);

  const visible = grouped[tab];

  return (
    <VidyaShell
      crumbs="MARKETPLACE · MY PURCHASES"
      title="My purchases"
      subtitle="Every self-paced course you own. Open a course to resume, or leave a rating to help other learners pick."
      chips={
        <>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`vidya-shell__chip${tab === t ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]} · {grouped[t].length}
            </button>
          ))}
        </>
      }
      actions={
        <Link to="/courses" className="vidya-shell__primary">
          ＋ Browse courses
        </Link>
      }
    >
      {error && (
        <p
          role="alert"
          style={{
            background: "var(--bad)",
            color: "var(--paper)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      {items === null && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="vidya-card-block"
              style={{ opacity: 0.5, minHeight: 80 }}
              aria-hidden
            />
          ))}
        </div>
      )}

      {items !== null && visible.length === 0 && (
        <section
          className="vidya-card-block"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--sp-3)",
            padding: "var(--sp-5)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }} aria-hidden>
            {tab === "active" ? "📚" : tab === "pending" ? "⏳" : "↩"}
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
            {tab === "active"
              ? "No active courses yet"
              : tab === "pending"
                ? "No pending purchases"
                : "No refunds"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", maxWidth: 480 }}>
            {tab === "active"
              ? "Pick up a self-paced course to start learning at your own rhythm."
              : tab === "pending"
                ? "Once you complete checkout, your courses land here."
                : "Refunded purchases will appear here for your records."}
          </p>
          {tab === "active" && (
            <Link to="/courses" className="vidya-shell__primary">
              Browse courses
            </Link>
          )}
        </section>
      )}

      {items !== null && visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {visible.map((p) => {
            const info = courses[p.courseId];
            const title = info?.title ?? "Loading…";
            const status = STATUS_INFO[p.status];
            return (
              <div
                key={p.id}
                className="vidya-card-block"
                style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    background: info?.coverImageUrl
                      ? `center/cover url(${info.coverImageUrl})`
                      : thumbFor(p.courseId),
                    color: "#fff",
                    fontSize: 24,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {!info?.coverImageUrl && initialFor(title)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{title}</p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 4,
                      fontSize: 12,
                      color: "var(--ink-2)",
                    }}
                  >
                    <span>{paiseToRupees(p.pricePaise)}</span>
                    {p.purchasedAt && (
                      <>
                        <span style={{ color: "var(--ink-4)" }}>·</span>
                        <span>
                          Purchased {new Date(p.purchasedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                    {info?.description && (
                      <>
                        <span style={{ color: "var(--ink-4)" }}>·</span>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 260,
                            display: "inline-block",
                          }}
                        >
                          {info.description}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "var(--sp-2)",
                    flexShrink: 0,
                  }}
                >
                  <span className="vidya-shell__chip" style={statusChipStyle(status.tone)}>
                    {status.label}
                  </span>
                  {p.status === "PAID" && (
                    <>
                      <Link to={`/courses/${p.courseId}/read`} className="vidya-shell__primary">
                        Resume →
                      </Link>
                      <button
                        type="button"
                        className="vidya-shell__chip"
                        onClick={() => setRating({ purchase: p, stars: 5, comment: "" })}
                      >
                        ★ Rate
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rating modal — replaces the old window.prompt() UX. */}
      {rating && (
        <div
          onClick={() => setRating(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "var(--sp-4)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: "var(--paper)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "var(--sp-5)",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Rate &ldquo;{courses[rating.purchase.courseId]?.title ?? "this course"}&rdquo;
            </h3>
            <p style={{ margin: "var(--sp-2) 0 var(--sp-3)", fontSize: 13, color: "var(--ink-2)" }}>
              Your rating is public to other learners — be honest and specific. Comment is optional.
            </p>
            <div
              style={{
                display: "flex",
                gap: 4,
                fontSize: 30,
                marginBottom: 14,
                color: "var(--warn)",
                cursor: "pointer",
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  onClick={() => setRating({ ...rating, stars: n })}
                  style={{
                    opacity: n <= rating.stars ? 1 : 0.25,
                    transition: "opacity 120ms",
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <textarea
              value={rating.comment}
              onChange={(e) => setRating({ ...rating, comment: e.target.value })}
              placeholder="Optional comment — what worked, what didn't?"
              rows={3}
              style={{
                width: "100%",
                padding: 10,
                background: "var(--paper-2)",
                color: "var(--ink)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
                marginBottom: 14,
              }}
            />
            <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="vidya-shell__chip"
                onClick={() => setRating(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="vidya-shell__primary"
                onClick={submitRating}
                disabled={submitting || rating.stars < 1}
              >
                {submitting ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          </div>
        </div>
      )}
    </VidyaShell>
  );
}
