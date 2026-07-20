// Phase 3.1 — Mistake Notebook.
//
// Every wrong answer is captured at scoring time (chosen/correct text +
// explanation snapshot) and scheduled for spaced-repetition replay on the
// shared canonical SM-2. Two modes: "Review due" (flip-card recall drill) and
// "All mistakes" (filterable browse). VidyaShell chrome; error-tag helpers
// reused from the error-pattern panel.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { useAuth } from "../lib/auth-provider";
import { tagColour, tagLabel, type ErrorTag } from "../lib/error_patterns";
import { mistakes, REVIEW_GRADES, type Mistake } from "../lib/mistakes";

type Mode = "due" | "all";

const ALL_TAGS: ErrorTag[] = [
  "conceptual_gap",
  "silly_mistake",
  "formula_error",
  "sign_or_unit_error",
  "time_pressure",
  "unattempted",
];

export function MistakeNotebook() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("due");
  const [error, setError] = useState<string | null>(null);

  // Review-due flow state.
  const [dueList, setDueList] = useState<Mistake[] | null>(null);
  const [dueTotal, setDueTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Browse-all state.
  const [allList, setAllList] = useState<Mistake[] | null>(null);
  const [tagFilter, setTagFilter] = useState<ErrorTag | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const resp = await mistakes.due(user.id, 30);
        setDueList(resp.items);
        setDueTotal(resp.dueCount);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || mode !== "all") return;
    setAllList(null);
    (async () => {
      try {
        const items = await mistakes.list(user.id, {
          errorTag: tagFilter ?? undefined,
          limit: 100,
        });
        setAllList(items);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user, mode, tagFilter]);

  const current = dueList && idx < dueList.length ? dueList[idx] : null;

  async function grade(quality: number) {
    if (!user || !current || grading) return;
    setGrading(true);
    try {
      await mistakes.review(user.id, current.id, quality);
      setReviewedCount((n) => n + 1);
      setRevealed(false);
      setIdx((i) => i + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  const subtitle =
    "Every question you got wrong, captured and scheduled for review. Replaying your own mistakes is the highest-yield revision there is.";

  return (
    <VidyaShell crumbs="PRACTICE · MISTAKE NOTEBOOK" title="Mistake Notebook" subtitle={subtitle}>
      <div style={{ maxWidth: 820 }}>
        {error && (
          <div role="alert" style={alertStyle}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: "var(--sp-4)" }}>
          <TabButton active={mode === "due"} onClick={() => setMode("due")}>
            Review due{dueTotal > 0 ? ` (${dueTotal})` : ""}
          </TabButton>
          <TabButton active={mode === "all"} onClick={() => setMode("all")}>
            All mistakes
          </TabButton>
        </div>

        {mode === "due" && (
          <ReviewFlow
            list={dueList}
            current={current}
            revealed={revealed}
            grading={grading}
            reviewedCount={reviewedCount}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
          />
        )}

        {mode === "all" && (
          <BrowseAll
            list={allList}
            tagFilter={tagFilter}
            onFilter={setTagFilter}
          />
        )}
      </div>
    </VidyaShell>
  );
}

function ReviewFlow({
  list,
  current,
  revealed,
  grading,
  reviewedCount,
  onReveal,
  onGrade,
}: {
  list: Mistake[] | null;
  current: Mistake | null;
  revealed: boolean;
  grading: boolean;
  reviewedCount: number;
  onReveal: () => void;
  onGrade: (quality: number) => void;
}) {
  if (list === null) return <p style={{ color: "var(--ink-3)" }}>Loading…</p>;

  if (!current) {
    return (
      <section style={emptyStyle}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>
          {reviewedCount > 0 ? "All caught up!" : "Nothing due right now"}
        </h3>
        <p style={{ color: "var(--ink-3)", margin: 0, fontSize: 14 }}>
          {reviewedCount > 0
            ? `You reviewed ${reviewedCount} mistake${reviewedCount === 1 ? "" : "s"}. They'll resurface on their SM-2 schedule.`
            : "Answer some practice questions — anything you miss lands here for spaced review."}
        </p>
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <div style={metaRow}>
        {current.topicTitle && <span style={{ color: "var(--ink-3)" }}>{current.topicTitle}</span>}
        {current.errorTag && <TagChip tag={current.errorTag} />}
        {current.overdueDays > 0 && (
          <span style={{ color: "var(--warn)", fontSize: 12 }}>
            {current.overdueDays}d overdue
          </span>
        )}
      </div>

      {current.stem ? (
        <p style={stemStyle}>{current.stem}</p>
      ) : (
        <p style={{ ...stemStyle, color: "var(--ink-3)", fontStyle: "italic" }}>
          (Question text wasn't captured for this one — recall the concept below.)
        </p>
      )}

      {!revealed && (
        <button type="button" onClick={onReveal} style={primaryBtn}>
          Reveal answer
        </button>
      )}

      {revealed && (
        <>
          {current.chosenText && (
            <div style={answerRow}>
              <span style={answerLabel}>You answered</span>
              <span style={{ color: "var(--bad)" }}>{current.chosenText}</span>
            </div>
          )}
          {current.correctText && (
            <div style={answerRow}>
              <span style={answerLabel}>Correct</span>
              <span style={{ color: "var(--good)" }}>{current.correctText}</span>
            </div>
          )}
          {current.explanation && (
            <div style={explanationStyle}>{current.explanation}</div>
          )}

          <div style={{ marginTop: "var(--sp-4)" }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
              How well did you know it?
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REVIEW_GRADES.map((g) => (
                <button
                  key={g.quality}
                  type="button"
                  disabled={grading}
                  onClick={() => onGrade(g.quality)}
                  style={gradeBtn}
                  title={g.hint}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function BrowseAll({
  list,
  tagFilter,
  onFilter,
}: {
  list: Mistake[] | null;
  tagFilter: ErrorTag | null;
  onFilter: (t: ErrorTag | null) => void;
}) {
  const available = useMemo(() => {
    const present = new Set((list ?? []).map((m) => m.errorTag).filter(Boolean));
    return ALL_TAGS.filter((t) => present.has(t) || t === tagFilter);
  }, [list, tagFilter]);

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
        <FilterChip active={tagFilter === null} onClick={() => onFilter(null)}>
          All
        </FilterChip>
        {available.map((t) => (
          <FilterChip key={t} active={tagFilter === t} onClick={() => onFilter(t)}>
            {tagLabel(t)}
          </FilterChip>
        ))}
      </div>

      {list === null && <p style={{ color: "var(--ink-3)" }}>Loading…</p>}
      {list !== null && list.length === 0 && (
        <section style={emptyStyle}>
          <p style={{ color: "var(--ink-3)", margin: 0 }}>
            No mistakes captured yet{tagFilter ? " for this category" : ""}.
          </p>
        </section>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(list ?? []).map((m) => (
          <article key={m.id} style={listCard}>
            <div style={metaRow}>
              {m.topicTitle && <span style={{ color: "var(--ink-3)" }}>{m.topicTitle}</span>}
              {m.errorTag && <TagChip tag={m.errorTag} />}
            </div>
            {m.stem && <p style={{ ...stemStyle, fontSize: 14 }}>{m.stem}</p>}
            {m.chosenText && (
              <div style={answerRow}>
                <span style={answerLabel}>You</span>
                <span style={{ color: "var(--bad)" }}>{m.chosenText}</span>
              </div>
            )}
            {m.correctText && (
              <div style={answerRow}>
                <span style={answerLabel}>Correct</span>
                <span style={{ color: "var(--good)" }}>{m.correctText}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function TagChip({ tag }: { tag: ErrorTag }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        color: tagColour(tag),
        border: `1px solid ${tagColour(tag)}`,
      }}
    >
      {tagLabel(tag)}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--accent, #A78BFA)" : "var(--rule)"}`,
        background: active ? "var(--accent, #A78BFA)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--ink-2)" : "var(--rule)"}`,
        background: active ? "var(--ink-2)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-3)",
      }}
    >
      {children}
    </button>
  );
}

const alertStyle: CSSProperties = {
  padding: "var(--sp-3) var(--sp-4)",
  marginBottom: "var(--sp-4)",
  background: "var(--bad)",
  color: "var(--paper)",
  borderRadius: 8,
  fontSize: 13,
};

const cardStyle: CSSProperties = {
  padding: "var(--sp-5) var(--sp-5)",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
};

const listCard: CSSProperties = {
  padding: "var(--sp-4)",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  padding: "var(--sp-6) var(--sp-4)",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
};

const metaRow: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginBottom: 10,
  fontSize: 12,
};

const stemStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "var(--ink)",
  margin: "0 0 var(--sp-4)",
};

const answerRow: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "baseline",
  fontSize: 14,
  padding: "4px 0",
};

const answerLabel: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--ink-3)",
  minWidth: 72,
};

const explanationStyle: CSSProperties = {
  marginTop: "var(--sp-3)",
  padding: "var(--sp-3)",
  background: "var(--paper-2, rgba(0,0,0,0.03))",
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--ink-2)",
};

const primaryBtn: CSSProperties = {
  padding: "8px 18px",
  background: "var(--accent, #A78BFA)",
  color: "var(--paper)",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const gradeBtn: CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
