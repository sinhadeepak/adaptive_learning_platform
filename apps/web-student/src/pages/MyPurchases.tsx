// MyPurchases — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → pg-tabs (Active / Refunded / Pending)
// → pg-list of rich rows with real course title fetched via
// courseMarketplace.get(courseId). Replaces window.prompt() with a
// proper modal for ratings.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
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

type Tab = "active" | "pending" | "refunded";

const STATUS_INFO: Record<
  Purchase["status"],
  { label: string; tone: "success" | "warn" | "danger" | "muted" }
> = {
  PAID: { label: "Active", tone: "success" },
  PENDING_PAYMENT: { label: "Payment pending", tone: "warn" },
  REFUNDED: { label: "Refunded", tone: "muted" },
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
    <AppShell title="My purchases">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">My purchases</h1>
            <p className="pg-header-sub">
              Every self-paced course you own. Open a course to resume, or
              leave a rating to help other learners pick.
            </p>
          </div>
          <div className="pg-header-actions">
            <Link to="/courses" className="pg-btn pg-btn-primary">
              ＋ Browse courses
            </Link>
          </div>
        </header>

        <div className="pg-tabs" role="tablist">
          {(
            [
              ["active", "Active"],
              ["pending", "Pending"],
              ["refunded", "Refunded"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`pg-tab${tab === k ? " on" : ""}`}
              onClick={() => setTab(k)}
            >
              {label}
              <span className="pg-tab-count">{grouped[k].length}</span>
            </button>
          ))}
        </div>

        {error && <p className="banner banner-error">{error}</p>}

        {items === null && !error && (
          <div className="pg-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-row" style={{ opacity: 0.5, minHeight: 80 }} aria-hidden />
            ))}
          </div>
        )}

        {items !== null && visible.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">
              {tab === "active" ? "📚" : tab === "pending" ? "⏳" : "↩"}
            </div>
            <h2 className="pg-empty-title">
              {tab === "active"
                ? "No active courses yet"
                : tab === "pending"
                  ? "No pending purchases"
                  : "No refunds"}
            </h2>
            <p className="pg-empty-body">
              {tab === "active"
                ? "Pick up a self-paced course to start learning at your own rhythm."
                : tab === "pending"
                  ? "Once you complete checkout, your courses land here."
                  : "Refunded purchases will appear here for your records."}
            </p>
            {tab === "active" && (
              <Link to="/courses" className="pg-btn pg-btn-primary">
                Browse courses
              </Link>
            )}
          </div>
        )}

        {items !== null && visible.length > 0 && (
          <div className="pg-list">
            {visible.map((p) => {
              const info = courses[p.courseId];
              const title = info?.title ?? "Loading…";
              const status = STATUS_INFO[p.status];
              return (
                <div key={p.id} className="pg-row">
                  <div
                    className="pg-avatar pg-avatar-lg"
                    style={{
                      background: info?.coverImageUrl
                        ? `center/cover url(${info.coverImageUrl})`
                        : thumbFor(p.courseId),
                      borderRadius: 8,
                      width: 64,
                      height: 64,
                      fontSize: 24,
                    }}
                    aria-hidden
                  >
                    {!info?.coverImageUrl && initialFor(title)}
                  </div>
                  <div className="pg-row-main">
                    <p className="pg-row-title">{title}</p>
                    <div className="pg-row-meta">
                      <span>{paiseToRupees(p.pricePaise)}</span>
                      {p.purchasedAt && (
                        <>
                          <span className="pg-row-meta-dot">·</span>
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
                          <span className="pg-row-meta-dot">·</span>
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
                  <div className="pg-row-aside">
                    <span className={`pg-pill pg-pill-${status.tone}`}>
                      {status.label}
                    </span>
                    {p.status === "PAID" && (
                      <>
                        <Link
                          to={`/courses/${p.courseId}/read`}
                          className="pg-btn pg-btn-primary pg-btn-sm"
                        >
                          Resume →
                        </Link>
                        <button
                          type="button"
                          className="pg-btn pg-btn-ghost pg-btn-sm"
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
      </div>

      {/* Rating modal — replaces the old window.prompt() UX. */}
      {rating && (
        <div className="pg-modal-overlay" onClick={() => setRating(null)}>
          <div className="pg-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="pg-modal-title">
              Rate &ldquo;{courses[rating.purchase.courseId]?.title ?? "this course"}&rdquo;
            </h3>
            <p className="pg-modal-body">
              Your rating is public to other learners — be honest and specific.
              Comment is optional.
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
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
                marginBottom: 14,
              }}
            />
            <div className="pg-modal-actions">
              <button
                type="button"
                className="pg-btn pg-btn-ghost"
                onClick={() => setRating(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pg-btn pg-btn-primary"
                onClick={submitRating}
                disabled={submitting || rating.stars < 1}
              >
                {submitting ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}