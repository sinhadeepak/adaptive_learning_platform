// F3 — My custom tests list.
// Shows CUSTOM blueprints the user has authored, newest first. Each row
// links to a launcher route /test/:id/start which calls Quiz Go's
// start-from-blueprint endpoint and redirects to the MockExam runner.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";
import { ShareTestModal } from "../components/ShareTestModal";

interface BlueprintRow {
  id: string;
  examId: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  kind: string;
  visibility: string;
  status: string;
  shareSlug: string | null;
  createdAt: string | null;
  sections: Array<{ section_id: string; name: string; n_questions: number }>;
}

interface MyBlueprintsResponse {
  items: BlueprintRow[];
  count: number;
}

interface BlueprintStats {
  attempts: number;
  ratings: { count: number; avgStars: number | null };
}

export function MyTests() {
  const [items, setItems] = useState<BlueprintRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<BlueprintRow | null>(null);
  const [statsByBp, setStatsByBp] = useState<Record<string, BlueprintStats>>(
    {},
  );

  async function refresh() {
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/mine`);
      if (!r.ok) {
        setError(`Couldn't load your tests (HTTP ${r.status}).`);
        return;
      }
      const body = (await r.json()) as MyBlueprintsResponse;
      setItems(body.items);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  // Fetch share stats for any blueprint that's currently shared (has slug).
  // Only the author sees this page, so the per-row stats endpoint is safe.
  useEffect(() => {
    if (!items) return;
    const shared = items.filter((b) => b.shareSlug);
    if (shared.length === 0) return;
    let alive = true;
    void Promise.all(
      shared.map(async (b) => {
        try {
          const r = await auth.fetch(
            `/api/v1/catalog/exam-blueprints/mine/${b.id}/stats`,
          );
          if (!r.ok) return null;
          const body = (await r.json()) as BlueprintStats & { blueprintId: string };
          return { id: b.id, stats: body };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (!alive) return;
      const next: Record<string, BlueprintStats> = {};
      for (const row of rows) {
        if (row) next[row.id] = row.stats;
      }
      setStatsByBp((p) => ({ ...p, ...next }));
    });
    return () => {
      alive = false;
    };
  }, [items]);

  async function deleteOne(id: string) {
    if (!confirm("Delete this test? Past sessions stay; the test won't be re-launchable.")) return;
    setDeletingId(id);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/mine/${id}`, {
        method: "DELETE",
      });
      if (!r.ok && r.status !== 204) {
        alert(`Delete failed (${r.status})`);
        return;
      }
      void refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell
      title="My custom tests"
      actions={
        <>
          <Link to="/practice" className="pg-btn pg-btn-ghost">
            ← Practice
          </Link>
          <Link to="/practice/build" className="pg-btn pg-btn-primary">
            ＋ New test
          </Link>
        </>
      }
    >
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">My custom tests</h1>
            <p className="pg-header-sub">
              Tests you've built with the Custom Test Builder. Re-launch any
              of them, or build a new one from scratch.
            </p>
          </div>
        </header>

        {error && <Banner tone="danger">{error}</Banner>}

        {items === null && !error && (
          <div className="pg-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-row" style={{ opacity: 0.5, minHeight: 80 }} aria-hidden />
            ))}
          </div>
        )}

        {items !== null && items.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">📝</div>
            <h2 className="pg-empty-title">No custom tests yet</h2>
            <p className="pg-empty-body">
              Build a test that mixes multiple topics, sets your own
              difficulty band, and runs against a custom timer. Useful when
              you want more control than topic-only Practice but a tighter
              scope than a full Mock Exam.
            </p>
            <Link to="/practice/build" className="pg-btn pg-btn-primary">
              ＋ Build your first test
            </Link>
          </div>
        )}

        {items !== null && items.length > 0 && (
          <div className="pg-list">
            {items.map((bp) => {
              const stats = statsByBp[bp.id];
              return (
                <div key={bp.id} className="pg-row">
                  <div className="pg-row-main">
                    <p className="pg-row-title">{bp.name}</p>
                    <div className="pg-row-meta">
                      <span>{bp.totalQuestions} Q · {bp.totalMinutes} min</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>+{bp.marksCorrect} / −{bp.marksNegative}</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>
                        {Array.isArray(bp.sections) ? bp.sections.length : 0} section
                        {(Array.isArray(bp.sections) ? bp.sections.length : 0) === 1 ? "" : "s"}
                      </span>
                      {bp.createdAt && (
                        <>
                          <span className="pg-row-meta-dot">·</span>
                          <span>
                            {new Date(bp.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </>
                      )}
                      {stats && bp.shareSlug && (
                        <>
                          <span className="pg-row-meta-dot">·</span>
                          <span style={{ color: "var(--color-blue)" }}>
                            {stats.attempts} attempt{stats.attempts === 1 ? "" : "s"}
                          </span>
                          {stats.ratings.count > 0 && (
                            <>
                              <span className="pg-row-meta-dot">·</span>
                              <span style={{ color: "var(--color-amber)" }}>
                                ★ {stats.ratings.avgStars?.toFixed(1)} (
                                {stats.ratings.count})
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="pg-row-aside">
                    {bp.shareSlug && (
                      <span className="pg-pill pg-pill-info">Shared</span>
                    )}
                    <Link
                      to={`/mock-exam?blueprintId=${bp.id}`}
                      className="pg-btn pg-btn-primary pg-btn-sm"
                    >
                      ▶ Start →
                    </Link>
                    <button
                      type="button"
                      className="pg-btn pg-btn-subtle pg-btn-sm"
                      onClick={() => setSharing(bp)}
                    >
                      {bp.shareSlug ? "Manage share" : "Share"}
                    </button>
                    <button
                      type="button"
                      className="pg-btn pg-btn-ghost pg-btn-sm"
                      onClick={() => deleteOne(bp.id)}
                      disabled={deletingId === bp.id}
                    >
                      {deletingId === bp.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sharing && (
        <ShareTestModal
          blueprintId={sharing.id}
          initialSlug={sharing.shareSlug}
          onClose={() => setSharing(null)}
          onShared={(slug) => {
            // Reflect the new slug on the row immediately + clear cached stats.
            setItems((prev) =>
              prev
                ? prev.map((b) => (b.id === sharing.id ? { ...b, shareSlug: slug } : b))
                : prev,
            );
            setStatsByBp((prev) => {
              const next = { ...prev };
              delete next[sharing.id];
              return next;
            });
          }}
        />
      )}
    </AppShell>
  );
}
