// F4 — Receiver-facing landing for a shared blueprint.
// URL: /t/:slug
//
// Shows a card with the test's shape (title, exam, length, sections,
// ratings) and a single CTA: "Take this test". Clicking calls Quiz Go's
// /quiz/sessions/from-blueprint with the captured slug so the resulting
// session contributes to the author's share stats.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

interface Section {
  section_id: string;
  name: string;
  n_questions: number;
  n_minutes: number;
  difficulty_band?: string;
}

interface Blueprint {
  id: string;
  examId: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  sections: Section[];
  shareSlug: string;
  createdByUserId: string | null;
  ratings: { count: number; avgStars: number | null };
}

export function SharedTestLanding() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/catalog/exam-blueprints/by-slug/${slug}`,
        );
        if (!alive) return;
        if (r.status === 404) {
          setError("This shared test no longer exists. The author may have removed the link.");
          return;
        }
        if (!r.ok) {
          setError(`Couldn't load the test (HTTP ${r.status}).`);
          return;
        }
        setBp((await r.json()) as Blueprint);
      } catch (e) {
        if (!alive) return;
        setError(`Network error: ${(e as Error).message}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  async function start() {
    if (!bp || !user) return;
    setStarting(true);
    setError(null);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/from-blueprint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blueprintId: bp.id,
          userId: user.id,
          sourceShareSlug: bp.shareSlug,
        }),
      });
      if (!r.ok) {
        setError(`Couldn't start (HTTP ${r.status}).`);
        return;
      }
      // MockExam runner accepts blueprintId via query string, but to
      // attribute the session to the slug we already created the session
      // here — route directly to the player.
      const body = (await r.json()) as { sessionId: string };
      nav(`/mock-exam?blueprintId=${bp.id}&sessionId=${body.sessionId}`);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <AppShell
      title="Shared test"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          ← Practice
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 820 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        {loading && !bp && (
          <div className="pg-section" style={{ minHeight: 200, opacity: 0.5 }}>
            Loading shared test…
          </div>
        )}

        {bp && (
          <>
            <header className="pg-header">
              <div className="pg-header-main">
                <h1 className="pg-header-title">{bp.name}</h1>
                <p className="pg-header-sub">
                  A test someone shared with you. Take it in one sitting; the
                  result will be attributed to the link so the author can see
                  how friends did. No identity beyond your own username is
                  revealed.
                </p>
              </div>
            </header>

            <div className="pg-stat-strip">
              <div className="pg-stat">
                <div className="pg-stat-label">Questions</div>
                <div className="pg-stat-value">{bp.totalQuestions}</div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Time</div>
                <div className="pg-stat-value">{bp.totalMinutes}m</div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Marking</div>
                <div className="pg-stat-value" style={{ fontSize: 16 }}>
                  +{bp.marksCorrect} / −{bp.marksNegative}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Ratings</div>
                <div
                  className="pg-stat-value"
                  style={{ fontSize: 16, color: "var(--warn)" }}
                >
                  {bp.ratings.count === 0
                    ? "—"
                    : `★ ${bp.ratings.avgStars?.toFixed(1)}`}
                </div>
                <div className="pg-stat-delta">
                  {bp.ratings.count} rating
                  {bp.ratings.count === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <section className="pg-section">
              <h2 className="pg-section-title">
                Sections
                <span className="pg-section-title-sub">
                  {bp.sections.length} section
                  {bp.sections.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="pg-list">
                {bp.sections.map((s, i) => (
                  <div className="pg-row" key={s.section_id}>
                    <div className="pg-row-main">
                      <p className="pg-row-title">
                        {s.name || `Section ${i + 1}`}
                      </p>
                      <div className="pg-row-meta">
                        <span>{s.n_questions} Q · {s.n_minutes} min</span>
                        {s.difficulty_band && (
                          <>
                            <span className="pg-row-meta-dot">·</span>
                            <span>
                              {s.difficulty_band === "mixed"
                                ? "Mixed difficulty"
                                : s.difficulty_band === "easy"
                                  ? "Easy-heavy"
                                  : "Hard-heavy"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Link to="/practice" className="pg-btn pg-btn-ghost">
                Not now
              </Link>
              <button
                type="button"
                className="pg-btn pg-btn-primary"
                onClick={start}
                disabled={starting}
              >
                {starting ? "Starting…" : "Take this test →"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}