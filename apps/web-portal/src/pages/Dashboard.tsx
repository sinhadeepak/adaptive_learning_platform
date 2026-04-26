import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { content, type Question } from "../lib/api";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// Teacher Dashboard — landing page for the educator portal.
// Mirrors docs/ui/04_TeacherPortal/01_dashboard.html scope per the README:
//   • KPIs (my drafts, in review, published, rejected — and a peer-review
//     pending count for moderators)
//   • Recent authoring activity (split: my drafts + my published items)
//   • AI-flavoured authoring tips
//   • Quick actions (new question, review queue)
//
// Data wiring:
//   • Real: content.listMine() → rolls up status counts + recency sort.
//   • If reviewer role: content.listAll("REVIEW") → pending peer-review
//     queue depth.
//   • Synthesised (until backend lands): per-question analytics
//     (impressions, accuracy), batch analytics for the institution-admin
//     view, doubts queue.
// ─────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Question[] | null>(null);
  const [pendingReview, setPendingReview] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showAuthoring = canAuthor(user?.role);
  const showReview = canReview(user?.role);

  useEffect(() => {
    (async () => {
      try {
        setMine(await content.listMine());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your questions");
      }
    })();
  }, []);

  useEffect(() => {
    if (!showReview) return;
    (async () => {
      try {
        setPendingReview(await content.listAll("REVIEW"));
      } catch {
        /* swallow — reviewer-only fetch */
      }
    })();
  }, [showReview]);

  const counts = useMemo(() => {
    if (!mine) return null;
    return {
      total: mine.length,
      draft: mine.filter((q) => q.status === "DRAFT").length,
      review: mine.filter((q) => q.status === "REVIEW").length,
      published: mine.filter((q) => q.status === "PUBLISHED").length,
      rejected: mine.filter((q) => q.status === "REJECTED").length,
    };
  }, [mine]);

  const recentDrafts = useMemo(() => {
    if (!mine) return [];
    return [...mine]
      .filter((q) => q.status === "DRAFT" || q.status === "REVIEW")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 4);
  }, [mine]);

  const recentPublished = useMemo(() => {
    if (!mine) return [];
    return [...mine]
      .filter((q) => q.status === "PUBLISHED")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 4);
  }, [mine]);

  const firstName = user?.firstName ?? "Educator";
  const greeting = greetingFor(new Date());

  return (
    <AppShell
      title="Educator Dashboard"
      chips={
        counts
          ? [
              { label: `${counts.draft} draft` },
              { label: `${counts.review} in review` },
              { label: `${counts.published} published` },
              ...(showReview && pendingReview
                ? [{ label: `${pendingReview.length} to review` }]
                : []),
            ]
          : []
      }
      actions={
        showAuthoring ? (
          <Link to="/questions/new" className="btn btn-primary">
            + New question
          </Link>
        ) : null
      }
    >
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="ai-header" aria-label="Educator overview">
        <div className="ai-header-left">
          <span className="ai-pill">◈ EDUCATOR CONTROL</span>
          <h1 className="ai-header-name">
            {greeting},{" "}
            <span className="ai-header-name-accent">{firstName}</span>
          </h1>
          <p className="ai-header-sub">
            {counts && counts.total > 0 ? (
              <>
                You've authored <strong>{counts.total} question{counts.total === 1 ? "" : "s"}</strong>{" "}
                across the platform. {counts.published > 0 ? (
                  <>
                    <strong>{counts.published}</strong> are live with the IRT
                    engine.
                  </>
                ) : null}
                {showReview && pendingReview && pendingReview.length > 0 ? (
                  <>
                    {" "}You have <strong>{pendingReview.length}</strong> peer-review item{pendingReview.length === 1 ? "" : "s"} waiting.
                  </>
                ) : null}
              </>
            ) : (
              <>
                Author your first question — every approved item goes into the
                IRT bank that drives every student session on the platform.
              </>
            )}
          </p>
          <div className="ai-header-btns">
            {showAuthoring ? (
              <Link to="/questions/new" className="btn-ai">
                ◈ New question
              </Link>
            ) : null}
            <Link to="/questions" className="btn btn-ghost">
              My questions →
            </Link>
            {showReview ? (
              <Link to="/review" className="btn btn-ghost">
                Review queue →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        </div>
      ) : null}

      {/* ── KPI tiles ─────────────────────────────────────────── */}
      <section
        className="topic-stats"
        style={{ marginTop: "var(--sp-4)" }}
        aria-label="Authoring KPIs"
      >
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-blue)" }}>
            {counts === null ? "…" : counts.draft}
          </div>
          <div className="topic-stat-lbl">Drafts</div>
          <div className="topic-stat-foot">
            {counts && counts.draft > 0
              ? "submit when ready"
              : "no drafts"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-amber)" }}>
            {counts === null ? "…" : counts.review}
          </div>
          <div className="topic-stat-lbl">In review</div>
          <div className="topic-stat-foot">
            {counts && counts.review > 0
              ? "awaiting moderator"
              : "none waiting"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-green)" }}>
            {counts === null ? "…" : counts.published}
          </div>
          <div className="topic-stat-lbl">Published</div>
          <div className="topic-stat-foot">
            {counts && counts.published > 0
              ? "live in the IRT bank"
              : "none yet"}
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{
              color:
                counts && counts.rejected > 0
                  ? "var(--color-red)"
                  : "var(--text-muted)",
            }}
          >
            {counts === null ? "…" : counts.rejected}
          </div>
          <div className="topic-stat-lbl">Rejected</div>
          <div className="topic-stat-foot">review notes available</div>
        </div>
      </section>

      {/* ── Two-col: in-flight + published ─────────────────────── */}
      <div
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)" }}
      >
        {/* In-flight */}
        <div className="card">
          <div className="sec-row">
            <h2 className="section-heading">In flight</h2>
            <Link to="/questions" className="see-all">
              All →
            </Link>
          </div>
          {mine === null ? (
            <SkeletonRows count={3} />
          ) : recentDrafts.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: 0,
                padding: "var(--sp-2) 0",
              }}
            >
              {showAuthoring
                ? "No drafts in flight."
                : "Authoring is open to TEACHER and above."}
            </p>
          ) : (
            <ul className="row-list">
              {recentDrafts.map((q) => (
                <li key={q.id}>
                  <Link
                    to={`/questions`}
                    className="row-link"
                    aria-label={`Open ${q.stem.slice(0, 40)}`}
                  >
                    <div className="row-link-body">
                      <p className="row-link-title">
                        {q.stem.slice(0, 80)}
                        {q.stem.length > 80 ? "…" : ""}
                      </p>
                      <p className="row-link-meta">
                        {new Date(q.createdAt).toLocaleDateString()} ·{" "}
                        {q.language.toUpperCase()} · b={q.difficultyB.toFixed(2)}
                      </p>
                    </div>
                    <div className="row-link-trail">
                      <span
                        className={`pill pill-${q.status === "DRAFT" ? "muted" : "warning"}`}
                      >
                        {q.status}
                      </span>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Published */}
        <div className="card">
          <div className="sec-row">
            <h2 className="section-heading">Recently published</h2>
            <Link to="/questions" className="see-all">
              All →
            </Link>
          </div>
          {mine === null ? (
            <SkeletonRows count={3} />
          ) : recentPublished.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: 0,
                padding: "var(--sp-2) 0",
              }}
            >
              No items have been published yet.
            </p>
          ) : (
            <ul className="row-list">
              {recentPublished.map((q) => (
                <li key={q.id}>
                  <Link to={`/questions`} className="row-link">
                    <div className="row-link-body">
                      <p className="row-link-title">
                        {q.stem.slice(0, 80)}
                        {q.stem.length > 80 ? "…" : ""}
                      </p>
                      <p className="row-link-meta">
                        {new Date(q.createdAt).toLocaleDateString()} ·{" "}
                        {q.language.toUpperCase()} · b={q.difficultyB.toFixed(2)}
                      </p>
                    </div>
                    <div className="row-link-trail">
                      <span className="pill pill-success">PUBLISHED</span>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── AI authoring tips + Quick actions ──────────────────── */}
      <div
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)" }}
      >
        <div className="insight-card">
          <div className="ins-eyebrow">
            <span>◈</span> AUTHORING TIPS
          </div>
          {buildTips({
            counts,
            pendingReview: pendingReview?.length ?? 0,
            showAuthoring,
            showReview,
          }).map((text, i) => (
            <div key={i} className="ins-item">
              <div className="ins-num">{i + 1}</div>
              <div
                className="ins-text"
                dangerouslySetInnerHTML={{ __html: text }}
              />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="sec-row">
            <h2 className="section-heading">Quick actions</h2>
          </div>
          <ul className="row-list">
            {showAuthoring ? (
              <li>
                <Link to="/questions/new" className="row-link">
                  <div className="row-link-body">
                    <p className="row-link-title">+ Author a new question</p>
                    <p className="row-link-meta">
                      Stem · 4 choices · IRT difficulty · optional advanced (a, c)
                    </p>
                  </div>
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ) : null}
            <li>
              <Link to="/questions" className="row-link">
                <div className="row-link-body">
                  <p className="row-link-title">📋 My questions</p>
                  <p className="row-link-meta">
                    Drafts · in review · published · rejected
                  </p>
                </div>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            {showReview ? (
              <li>
                <Link to="/review" className="row-link">
                  <div className="row-link-body">
                    <p className="row-link-title">
                      🔎 Peer-review queue
                      {pendingReview && pendingReview.length > 0
                        ? ` (${pendingReview.length})`
                        : ""}
                    </p>
                    <p className="row-link-meta">
                      Approve to publish · reject with notes
                    </p>
                  </div>
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ) : null}
          </ul>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: "var(--sp-3)",
            }}
          >
            Students · Doubts · Mock tests · Batch analytics land in Phase 2 when
            the institution + assignments surfaces wire up.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function buildTips(args: {
  counts: { total: number; draft: number; review: number; published: number; rejected: number } | null;
  pendingReview: number;
  showAuthoring: boolean;
  showReview: boolean;
}): string[] {
  const out: string[] = [];
  const { counts, pendingReview, showAuthoring, showReview } = args;

  if (!counts || counts.total === 0) {
    if (showAuthoring) {
      out.push(
        `<strong>Author your first question.</strong> The IRT engine starts shaping student sessions the moment your item is approved.`,
      );
    }
    out.push(
      `<strong>Difficulty (b) ≈ 0</strong> is a typical starting point. The engine recalibrates from real student responses.`,
    );
    return out;
  }

  if (counts.review > 0) {
    out.push(
      `<strong>${counts.review} item${counts.review === 1 ? "" : "s"} pending peer review.</strong> Authors typically hear back within 48 hours.`,
    );
  }
  if (counts.draft > 0) {
    out.push(
      `<strong>${counts.draft} draft${counts.draft === 1 ? "" : "s"} sitting.</strong> Submit them when ready — drafts don't ship to students.`,
    );
  }
  if (counts.rejected > 0) {
    out.push(
      `<strong>${counts.rejected} rejected item${counts.rejected === 1 ? "" : "s"}.</strong> Review notes are on the My-Questions page; common fixes: ambiguous stem, distractor too obvious, calibration off.`,
    );
  }
  if (showReview && pendingReview > 0) {
    out.push(
      `<strong>${pendingReview} item${pendingReview === 1 ? "" : "s"} need your peer review.</strong> Reviewing 5 items typically takes 10 minutes.`,
    );
  }
  if (counts.published > 0) {
    out.push(
      `<strong>Tip:</strong> items with discrimination (a) ≥ 1.2 differentiate strong from weak students best. The IRT engine prioritises high-a items.`,
    );
  }
  return out.slice(0, 4);
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
