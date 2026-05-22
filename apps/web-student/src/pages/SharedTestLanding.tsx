// SharedTestLanding — Vidya v1 redesign.
//
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
import { VidyaShell } from "../components/vidya/VidyaShell";

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

  const subtitle = bp
    ? `${bp.name} — take it in one sitting; the result will be attributed to the link so the author can see how friends did. No identity beyond your own username is revealed.`
    : "A test someone shared with you.";

  return (
    <VidyaShell
      crumbs="TAKE THIS TEST"
      title="Take this test"
      subtitle={subtitle}
      actions={
        <Link to="/practice" className="vidya-shell__chip" style={{ textDecoration: "none" }}>
          ← Practice
        </Link>
      }
    >
      <div style={{ maxWidth: 820 }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              marginBottom: "var(--sp-4)",
              background: "var(--bad)",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading && !bp && (
          <div className="vidya-card-block" style={{ minHeight: 200, opacity: 0.5 }}>
            Loading shared test…
          </div>
        )}

        {bp && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "var(--sp-3)",
                marginBottom: "var(--sp-4)",
              }}
            >
              <div className="vidya-card-block" style={{ padding: "var(--sp-3)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Questions
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
                  {bp.totalQuestions}
                </div>
              </div>
              <div className="vidya-card-block" style={{ padding: "var(--sp-3)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Time
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
                  {bp.totalMinutes}m
                </div>
              </div>
              <div className="vidya-card-block" style={{ padding: "var(--sp-3)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Marking
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
                  +{bp.marksCorrect} / −{bp.marksNegative}
                </div>
              </div>
              <div className="vidya-card-block" style={{ padding: "var(--sp-3)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Ratings
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--warn)", marginTop: 4 }}>
                  {bp.ratings.count === 0
                    ? "—"
                    : `★ ${bp.ratings.avgStars?.toFixed(1)}`}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                  {bp.ratings.count} rating
                  {bp.ratings.count === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
              <div className="vidya-card-block__head">
                <h2 className="vidya-card-block__title">
                  Sections
                  <span style={{ marginLeft: 8, fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>
                    {bp.sections.length} section
                    {bp.sections.length === 1 ? "" : "s"}
                  </span>
                </h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {bp.sections.map((s, i) => (
                  <div
                    key={s.section_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "var(--sp-3)",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                        {s.name || `Section ${i + 1}`}
                      </p>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, fontSize: 12, color: "var(--ink-3)" }}>
                        <span>{s.n_questions} Q · {s.n_minutes} min</span>
                        {s.difficulty_band && (
                          <>
                            <span>·</span>
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
              <Link to="/practice" className="vidya-shell__chip" style={{ textDecoration: "none" }}>
                Not now
              </Link>
              <button
                type="button"
                className="vidya-shell__chip vidya-shell__chip--on"
                onClick={start}
                disabled={starting}
              >
                {starting ? "Starting…" : "Take this test →"}
              </button>
            </div>
          </>
        )}
      </div>
    </VidyaShell>
  );
}
