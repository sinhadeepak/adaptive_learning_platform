// Bulk AI question generation panel — wraps POST /content/ai/bulk-draft.
//
// Reads exam / topic / type from the parent page (so the educator picks
// them once at the top of the form), adds a count + difficulty + brief
// input, and renders the resulting drafts as cards with a per-item
// "Use in form" action that hands the draft back to the parent for
// manual editing + save via the standard /content/questions flow.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { aiAuthoring, type AIDraftMarker } from "../lib/phase5-api";
import { content } from "../lib/api";

interface Props {
  typeId: string;
  exam: string;          // exam code (e.g. "JEE-MAIN" or "UPSC-CSE")
  topicId: string;       // canonical topic id — needed for bulk-save
  topicTitle: string;    // human-readable topic title
  language?: "en" | "hi";
  disabled?: boolean;    // true when prerequisites (topic, type) aren't selected
  onDraftChosen: (
    draft: Record<string, unknown>,
    marker: AIDraftMarker,
  ) => void;
}

type DraftStatus = "idle" | "saving" | "saved" | "save_failed";

interface Draft {
  index: number;
  draft: Record<string, unknown> | null;
  marker: AIDraftMarker | null;
  error: string | null;
  // Phase 7 — bulk-save tracking. `idle` == not yet attempted.
  status?: DraftStatus;
  saveError?: string;
  questionId?: string;
}

const SUPPORTED_TYPES = new Set([
  // Objective + Numeric
  "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
  "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
  // Matching
  "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
  // Fill-in
  "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
  // Subjective + Composite
  "ESSAY", "DESCRIPTIVE_LONG", "COMPREHENSION_LONG", "CASE_STUDY",
  // Visual (AI emits structure + media_description)
  "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
  // Audio/Video (AI emits transcript/brief + sub-questions)
  "LISTENING_COMP", "VIDEO_QUESTION",
  // Interactive wrappers
  "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
]);

export function BulkAIGenerator({
  typeId,
  exam,
  topicId,
  topicTitle,
  language = "en",
  disabled,
  onDraftChosen,
}: Props) {
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [brief, setBrief] = useState("");
  const [results, setResults] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Running tally of drafts saved (they're removed from the list on save).
  const [savedCount, setSavedCount] = useState(0);
  // Running tally of drafts the educator discarded (removed without saving).
  const [discardedCount, setDiscardedCount] = useState(0);
  // Async job: jobId being polled (set on Generate, or from ?bulkJob via toast).
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Save-context restored from a job opened via the toast (when the form's
  // exam/topic isn't selected). Falls back to the live props otherwise.
  const [jobCtx, setJobCtx] = useState<{
    topicId: string | null;
    typeId: string | null;
    language: string | null;
  } | null>(null);
  const [searchParams] = useSearchParams();

  const supported = SUPPORTED_TYPES.has(typeId);
  const canGenerate = supported && !disabled && !!topicTitle.trim();

  // Effective values for saving — the live form selection wins; when absent
  // (job opened via toast), fall back to what was persisted with the job.
  const saveTopicId = topicId || jobCtx?.topicId || "";
  const saveType = typeId || jobCtx?.typeId || "MCQ_SINGLE";
  const saveLang = (jobCtx?.language as "en" | "hi" | null) || language;

  // Arriving via the completion toast (/questions/new?bulkJob=<id>) loads that
  // job's drafts for review.
  useEffect(() => {
    const b = searchParams.get("bulkJob");
    if (b) setJobId(b);
  }, [searchParams]);

  // Enqueue a background job — the generation runs server-side in chunks.
  async function generate() {
    setBusy(true);
    setError(null);
    setResults(null);
    setProgress(null);
    setSavedCount(0);
    setDiscardedCount(0);
    try {
      const { jobId: id } = await aiAuthoring.bulkDraftJob({
        typeId,
        topic: topicTitle,
        count,
        difficulty,
        exam,
        sourceMaterial: brief || undefined,
        topicId,
        topicTitle,
        language,
      });
      setJobId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk generate failed");
      setBusy(false);
    }
  }

  // Poll the active job until it finishes, then load all drafts into the list.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;
    setBusy(true);
    setError(null);

    const poll = async () => {
      try {
        const job = await aiAuthoring.getBulkJob(jobId);
        if (cancelled) return;
        if (job.context) {
          setJobCtx({
            topicId: job.context.topicId,
            typeId: job.context.typeId,
            language: job.context.language,
          });
        }
        if (job.status === "succeeded" && job.result) {
          setResults(job.result.items.map((it) => ({ ...it, status: "idle" as DraftStatus })));
          setBusy(false);
        } else if (job.status === "failed") {
          setError(job.error || "Generation failed. Please try again.");
          setBusy(false);
        } else {
          if (job.progress) setProgress(job.progress);
          timer = window.setTimeout(poll, 5000);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load job");
          setBusy(false);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId]);

  // Bulk-save every successful draft as a DRAFT question. Bypasses
  // the form entirely — the existing per-item "Use in form" path is
  // still there for individual edits. Throttled so 100 drafts don't
  // launch 100 parallel POSTs to /content/questions.
  const MAX_PARALLEL_SAVES = 5;

  async function saveAll() {
    if (!results || !saveTopicId) return;
    setSavingAll(true);
    setError(null);

    // Snapshot the indices of drafts that haven't been saved yet AND
    // succeeded the AI generation step.
    const queue = results
      .filter((r) => r.draft && r.status !== "saved" && r.status !== "saving")
      .map((r) => r.index);

    function patch(idx: number, p: Partial<Draft>) {
      setResults((prev) =>
        prev ? prev.map((r) => (r.index === idx ? { ...r, ...p } : r)) : prev,
      );
    }

    // Snapshot the current results so closures inside workers don't
    // chase the moving setState target. We patch by setResults rather
    // than mutating this snapshot.
    const snapshot = results;

    async function worker(idx: number) {
      const item = snapshot.find((r) => r.index === idx);
      if (!item || !item.draft) return;
      patch(idx, { status: "saving", saveError: undefined });
      try {
        const choicesAndIdx = extractChoices(item.draft);
        await content.create({
          topicId: saveTopicId,
          stem: typeof item.draft.stem === "string" ? item.draft.stem : "(no stem)",
          choices: choicesAndIdx.choices,
          correctIdx: choicesAndIdx.correctIdx,
          language: saveLang,
          explanation:
            typeof item.draft.explanation === "string"
              ? item.draft.explanation
              : null,
          questionType: saveType,
        });
        // Saved → drop it from the list so only un-saved drafts remain.
        setResults((prev) => (prev ? prev.filter((r) => r.index !== idx) : prev));
        setSavedCount((n) => n + 1);
      } catch (e) {
        patch(idx, {
          status: "save_failed",
          saveError: e instanceof Error ? e.message : "save failed",
        });
      }
    }

    // Simple manual semaphore — kick off MAX_PARALLEL workers and
    // refill as each completes.
    let cursor = 0;
    async function next() {
      while (cursor < queue.length) {
        const idx = queue[cursor++];
        await worker(idx);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL_SAVES, queue.length) }, next),
    );
    setSavingAll(false);
  }

  // Discard a single draft — drops it from the review list without saving.
  // Drafts are ephemeral review items (already generated), so this is purely
  // client-side; nothing to delete server-side.
  function discardOne(idx: number) {
    setResults((prev) => (prev ? prev.filter((r) => r.index !== idx) : prev));
    setDiscardedCount((n) => n + 1);
  }

  // Discard every draft still awaiting review (keeps already-saved cards so the
  // "saved" tally stays visible). Guarded by a confirm since it can't be undone.
  function discardAll() {
    if (!results) return;
    const toDrop = results.filter((r) => r.status !== "saved");
    if (toDrop.length === 0) return;
    if (
      !window.confirm(
        `Discard all ${toDrop.length} draft${toDrop.length === 1 ? "" : "s"} still under review? This can't be undone.`,
      )
    ) {
      return;
    }
    setResults((prev) => (prev ? prev.filter((r) => r.status === "saved") : prev));
    setDiscardedCount((n) => n + toDrop.length);
  }

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid var(--rule, #2a2f3a)",
        borderRadius: 8,
        background: "var(--paper-2, #161a22)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 14 }}>Generate questions with AI</strong>
        <span style={pill}>{typeId}</span>
      </div>

      {!supported && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "8px 0" }}>
          AI generation isn't available yet for <code>{typeId}</code>. Supported types:
          MCQ, True/False, Assertion-Reason, Multi-statement, Numeric, Formula-input.
        </p>
      )}

      {supported && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 2fr auto",
              gap: 12,
              alignItems: "end",
              marginBottom: 12,
            }}
          >
            <label style={labelStyle}>
              How many?
              <input
                type="number"
                min={1}
                max={300}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Difficulty
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as "EASY" | "MEDIUM" | "HARD")
                }
                style={inputStyle}
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label style={labelStyle}>
              Brief (optional — extra context for the AI)
              <input
                type="text"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. focus on Newton's third law applications"
                style={inputStyle}
              />
            </label>
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate || busy}
              style={{
                padding: "8px 16px",
                background: canGenerate ? "var(--info, #4F87F6)" : "var(--card, #2a2f3a)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: canGenerate && !busy ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {busy ? "Generating…" : `Generate ${count}`}
            </button>
          </div>

          {busy && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                marginBottom: 12,
                borderRadius: 6,
                background: "var(--paper-2, #f3f4f6)",
                fontSize: 12,
                color: "var(--ink-2, #6b7280)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--info, #4F87F6)",
                  flexShrink: 0,
                }}
              />
              <span>
                {progress ? (
                  <>
                    Generated <strong>{progress.done}/{progress.total}</strong> so far —{" "}
                  </>
                ) : (
                  <>Generating in the background — </>
                )}
                this can take a few minutes for a large batch.{" "}
                <strong>You can leave this page</strong>; we'll notify you when the
                drafts are ready to review.
              </span>
            </div>
          )}

          {!canGenerate && (
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
              {!topicTitle.trim()
                ? "Pick an exam, subject, and topic above to enable AI generation."
                : "Disabled."}
            </p>
          )}

          {error && (
            <p
              style={{
                fontSize: 13,
                color: "var(--bad, #f43f5e)",
                margin: "8px 0",
              }}
            >
              {error}
            </p>
          )}

          {results && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {results.filter((r) => r.draft).length} draft
                  {results.filter((r) => r.draft).length === 1 ? "" : "s"} to review
                  {(() => {
                    const failed = results.filter((r) => r.status === "save_failed").length;
                    if (savedCount === 0 && failed === 0 && discardedCount === 0) return null;
                    return (
                      <span style={{ marginLeft: 8 }}>
                        {savedCount > 0 && (
                          <span style={{ color: "var(--good, #10C47A)" }}>
                            · {savedCount} saved to question bank
                          </span>
                        )}
                        {discardedCount > 0 && (
                          <span style={{ color: "var(--ink-3)" }}>
                            {" "}· {discardedCount} discarded
                          </span>
                        )}
                        {failed > 0 && (
                          <span style={{ color: "var(--warn, #f59e0b)" }}>
                            {" "}· {failed} failed
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={discardAll}
                    disabled={
                      savingAll ||
                      results.filter((r) => r.status !== "saved").length === 0
                    }
                    style={{
                      padding: "6px 14px",
                      background: "transparent",
                      color: "var(--bad, #f43f5e)",
                      border: "1px solid var(--bad, #f43f5e)",
                      borderRadius: 4,
                      cursor:
                        savingAll ||
                        results.filter((r) => r.status !== "saved").length === 0
                          ? "not-allowed"
                          : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      opacity:
                        savingAll ||
                        results.filter((r) => r.status !== "saved").length === 0
                          ? 0.5
                          : 1,
                    }}
                    title="Discard every draft still under review (already-saved questions are kept)"
                  >
                    Discard all
                  </button>
                  <button
                    type="button"
                    onClick={saveAll}
                    disabled={
                      savingAll ||
                      !saveTopicId ||
                      results.filter(
                        (r) => r.draft && r.status !== "saved" && r.status !== "saving",
                      ).length === 0
                    }
                    style={{
                      padding: "6px 14px",
                      background:
                        savingAll || !saveTopicId
                          ? "var(--ink-4, #94a3b8)"
                          : "var(--good, #10C47A)",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: savingAll || !saveTopicId ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: savingAll || !saveTopicId ? 0.7 : 1,
                    }}
                    title={
                      !saveTopicId
                        ? "Pick a topic above to enable bulk-save"
                        : "Save every generated draft to the question bank as DRAFT — review + publish later from My questions"
                    }
                  >
                    {savingAll
                      ? "Saving all…"
                      : `💾 Save all as drafts (${results.filter((r) => r.draft && r.status !== "saved").length})`}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((r) => (
                  <DraftCard
                    key={r.index}
                    item={r}
                    onUse={() => {
                      if (r.draft && r.marker) onDraftChosen(r.draft, r.marker);
                    }}
                    onDiscard={() => discardOne(r.index)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DraftCard({
  item,
  onUse,
  onDiscard,
}: {
  item: Draft;
  onUse: () => void;
  onDiscard: () => void;
}) {
  const stem =
    item.draft && typeof item.draft.stem === "string"
      ? (item.draft.stem as string)
      : null;
  const opts =
    item.draft && Array.isArray(item.draft.options)
      ? (item.draft.options as { id: string; text: string; is_correct?: boolean }[])
      : null;

  if (item.error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: 10,
          border: "1px solid var(--rule, #2a2f3a)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--bad, #f43f5e)",
        }}
      >
        <span>#{item.index + 1} failed: {item.error}</span>
        <button
          type="button"
          onClick={onDiscard}
          style={discardBtn}
          title="Remove this failed draft from the list"
        >
          Discard
        </button>
      </div>
    );
  }
  const saved = item.status === "saved";
  const saving = item.status === "saving";
  return (
    <div
      style={{
        padding: 12,
        border: `1px solid ${
          saved
            ? "rgba(16,196,122,0.4)"
            : item.status === "save_failed"
              ? "rgba(244,63,94,0.4)"
              : "var(--rule, #2a2f3a)"
        }`,
        borderRadius: 6,
        background: "var(--card, #1c2129)",
        opacity: saved ? 0.85 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              marginBottom: 4,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span>Draft #{item.index + 1}</span>
            {saving && <span style={{ color: "var(--info)" }}>· Saving…</span>}
            {saved && (
              <span style={{ color: "var(--good)" }}>
                ✓ Saved as DRAFT
              </span>
            )}
            {item.status === "save_failed" && (
              <span style={{ color: "var(--bad)" }}>
                ✗ Save failed: {item.saveError}
              </span>
            )}
          </div>
          {stem && (
            <div
              style={{
                fontSize: 13,
                color: "var(--ink)",
                lineHeight: 1.4,
                marginBottom: 6,
              }}
            >
              {stem}
            </div>
          )}
          {opts && opts.length > 0 && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: "var(--ink-2)",
                lineHeight: 1.5,
              }}
            >
              {opts.map((o) => (
                <li
                  key={o.id}
                  style={{
                    color: o.is_correct
                      ? "var(--good, #10C47A)"
                      : "var(--ink-2)",
                  }}
                >
                  {o.text}
                  {o.is_correct && " ✓"}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onUse}
            disabled={saving}
            style={{
              padding: "6px 12px",
              background: "var(--info, #4F87F6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
            title="Load this draft into the form below for manual edits"
          >
            {saved ? "Use again" : "Use in form"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            style={{ ...discardBtn, opacity: saving ? 0.6 : 1 }}
            title="Discard this draft (removes it from the review list)"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--ink-3)",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  marginTop: 4,
  background: "var(--paper-2, #1f242c)",
  color: "var(--ink)",
  border: "1px solid var(--rule, #2a2f3a)",
  borderRadius: 4,
  fontSize: 13,
};

const discardBtn: React.CSSProperties = {
  padding: "5px 12px",
  background: "transparent",
  color: "var(--bad, #f43f5e)",
  border: "1px solid var(--rule, #2a2f3a)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};

const pill: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 6px",
  background: "var(--paper-2, #1f242c)",
  color: "var(--ink-3)",
  border: "1px solid var(--rule, #2a2f3a)",
  borderRadius: 3,
};

// Pull choices + correctIdx out of an AI draft. Drafts use the
// shape `options: [{id, text, is_correct}]`. content.create wants
// `choices: string[]` and `correctIdx: number`. For non-MCQ types
// the AI emits empty `options` — we synthesise a single placeholder
// choice so the create call (which validates 1+ choice) doesn't 422.
// Admins can edit later via the standard authoring form.
function extractChoices(draft: Record<string, unknown>): {
  choices: string[];
  correctIdx: number;
} {
  const opts = Array.isArray(draft.options)
    ? (draft.options as { id: string; text?: string; is_correct?: boolean }[])
    : [];
  const choices = opts
    .map((o) => (typeof o.text === "string" ? o.text : ""))
    .filter((c) => c.length > 0);
  const correctIdx = Math.max(0, opts.findIndex((o) => o.is_correct === true));
  if (choices.length === 0) {
    return { choices: ["See rubric for evaluation criteria."], correctIdx: 0 };
  }
  return { choices, correctIdx };
}