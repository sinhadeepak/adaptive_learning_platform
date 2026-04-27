import { useState } from "react";
import {
  adaptive,
  content,
  type GeneratedQuestion,
} from "../lib/api";

// AI-assisted authoring panel for educators.
//
// Workflow:
//   1. Educator picks topic via existing cascading dropdown (parent component).
//   2. Opens this panel, sets count + language + difficulty + optional brief.
//   3. Clicks Generate — items appear in a review list.
//   4. Educator can edit any field on any item, or discard items.
//   5. Clicks "Save N drafts" — each item is POSTed to /content/questions
//      as a DRAFT. The educator then submits each from MyQuestions through
//      the existing review FSM.
//
// Quality gate: items NEVER auto-publish. They land as DRAFTs.

interface Props {
  topicId: string;
  topicTitle: string;
  onSavedAll: () => void;
}

interface DraftItem extends GeneratedQuestion {
  id: string; // local-only, for React keys + delete
  saved: boolean;
  saveError: string | null;
}

let nextDraftId = 1;

function makeDraftId(): string {
  nextDraftId += 1;
  return `d${nextDraftId}`;
}

export function AIQuestionGenerator({ topicId, topicTitle, onSavedAll }: Props) {
  const [count, setCount] = useState(5);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">(
    "mixed",
  );
  const [brief, setBrief] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stubMessage, setStubMessage] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setStubMessage(null);
    setItems([]);
    setGenerating(true);
    try {
      const res = await adaptive.generateQuestions({
        topicId,
        count,
        language,
        difficulty,
        brief,
      });
      if (res.source === "stub") {
        setStubMessage(res.message || "AI authoring is unavailable.");
        return;
      }
      setItems(
        res.questions.map((q): DraftItem => ({
          ...q,
          id: makeDraftId(),
          saved: false,
          saveError: null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function discard(id: string) {
    setItems((cur) => cur.filter((it) => it.id !== id));
  }

  function setChoice(id: string, idx: number, value: string) {
    setItems((cur) =>
      cur.map((it) =>
        it.id === id
          ? { ...it, choices: it.choices.map((c, i) => (i === idx ? value : c)) }
          : it,
      ),
    );
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    let savedCount = 0;
    const next = [...items];
    for (let i = 0; i < next.length; i += 1) {
      const it = next[i];
      if (it.saved) continue;
      try {
        await content.create({
          topicId,
          stem: it.stem.trim(),
          choices: it.choices.map((c) => c.trim()),
          correctIdx: it.correctIdx,
          difficultyB: it.difficultyB,
          language: it.language,
          explanation: it.explanation,
        });
        next[i] = { ...it, saved: true, saveError: null };
        savedCount += 1;
      } catch (err) {
        next[i] = {
          ...it,
          saveError: err instanceof Error ? err.message : "Save failed",
        };
      }
      setItems([...next]);
    }
    setSaving(false);
    if (savedCount === next.filter((i) => !i.saveError).length && savedCount > 0) {
      onSavedAll();
    }
  }

  const unsavedCount = items.filter((i) => !i.saved).length;

  return (
    <section
      style={{
        marginTop: 18,
        padding: 16,
        background: "rgba(102,67,255,0.05)",
        border: "1px solid rgba(102,67,255,0.2)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          ◈ AI-assisted authoring — {topicTitle || "(pick a topic first)"}
        </h3>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          Items land as DRAFT; you submit each through the normal review flow.
        </span>
      </div>

      {!topicId ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
          Pick an exam, subject, and topic above before generating.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            <label style={{ fontSize: 11 }}>
              Count
              <input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(30, +e.target.value)))}
                disabled={generating}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: 11 }}>
              Difficulty
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as "easy" | "medium" | "hard" | "mixed")
                }
                disabled={generating}
                style={inputStyle}
              >
                <option value="easy">Easy (b ≈ -1)</option>
                <option value="medium">Medium (b ≈ 0)</option>
                <option value="hard">Hard (b ≈ +1)</option>
                <option value="mixed">Mixed (recommended)</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              Language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
                disabled={generating}
                style={inputStyle}
              >
                <option value="en">English</option>
                <option value="hi">Hindi (Devanagari)</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              Brief (optional)
              <input
                type="text"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. focus on entropy + reversible processes"
                disabled={generating}
                style={inputStyle}
                maxLength={2000}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={generating || !topicId}
            style={{
              marginTop: 12,
              background: "var(--color-purple)",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: generating ? "wait" : "pointer",
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating
              ? `Generating ${count} items…`
              : `✨ Generate ${count} draft questions`}
          </button>

          {stubMessage ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                background: "rgba(245,166,35,0.08)",
                borderLeft: "2px solid var(--color-amber)",
                fontSize: 12,
                color: "var(--text-muted)",
                borderRadius: 4,
              }}
            >
              {stubMessage}
            </div>
          ) : null}
          {error ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "var(--color-red)",
              }}
            >
              {error}
            </div>
          ) : null}

          {items.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {items.length} item{items.length === 1 ? "" : "s"} —
                  edit, then save as DRAFTs
                </strong>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={saving || unsavedCount === 0}
                  style={{
                    background: "var(--color-green)",
                    color: "white",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving || unsavedCount === 0 ? 0.5 : 1,
                  }}
                >
                  {saving
                    ? "Saving…"
                    : unsavedCount === 0
                    ? "All saved"
                    : `Save ${unsavedCount} drafts`}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((it, idx) => (
                  <DraftItemCard
                    key={it.id}
                    item={it}
                    index={idx}
                    onChange={(p) => updateItem(it.id, p)}
                    onChoiceChange={(ci, val) => setChoice(it.id, ci, val)}
                    onDiscard={() => discard(it.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "inherit",
  padding: "6px 8px",
  borderRadius: 4,
  fontSize: 12,
  marginTop: 3,
};

interface DraftItemCardProps {
  item: DraftItem;
  index: number;
  onChange: (p: Partial<DraftItem>) => void;
  onChoiceChange: (idx: number, val: string) => void;
  onDiscard: () => void;
}

function DraftItemCard({
  item,
  index,
  onChange,
  onChoiceChange,
  onDiscard,
}: DraftItemCardProps) {
  return (
    <div
      style={{
        padding: 10,
        background: item.saved
          ? "rgba(16,196,122,0.06)"
          : item.saveError
          ? "rgba(244,63,94,0.06)"
          : "rgba(255,255,255,0.03)",
        borderLeft: `3px solid ${
          item.saved
            ? "var(--color-green)"
            : item.saveError
            ? "var(--color-red)"
            : "var(--color-purple)"
        }`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          Q{index + 1} · b={item.difficultyB.toFixed(2)} · {item.language}
          {item.tags.length > 0 ? ` · ${item.tags.join(" · ")}` : ""}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {item.saved ? (
            <span style={{ fontSize: 11, color: "var(--color-green)" }}>✓ saved</span>
          ) : null}
          <button
            type="button"
            onClick={onDiscard}
            disabled={item.saved}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--text-faint)",
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 11,
              cursor: item.saved ? "not-allowed" : "pointer",
              opacity: item.saved ? 0.4 : 1,
            }}
          >
            Discard
          </button>
        </div>
      </div>

      <textarea
        value={item.stem}
        onChange={(e) => onChange({ stem: e.target.value })}
        disabled={item.saved}
        style={{
          ...inputStyle,
          minHeight: 50,
          fontFamily: "inherit",
          fontSize: 13,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginTop: 6,
        }}
      >
        {item.choices.map((c, i) => (
          <label
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <input
              type="radio"
              name={`correct-${item.id}`}
              checked={item.correctIdx === i}
              onChange={() => onChange({ correctIdx: i })}
              disabled={item.saved}
            />
            <input
              type="text"
              value={c}
              onChange={(e) => onChoiceChange(i, e.target.value)}
              disabled={item.saved}
              style={{ ...inputStyle, marginTop: 0 }}
            />
          </label>
        ))}
      </div>

      <textarea
        value={item.explanation}
        onChange={(e) => onChange({ explanation: e.target.value })}
        disabled={item.saved}
        placeholder="Explanation"
        style={{
          ...inputStyle,
          marginTop: 6,
          minHeight: 40,
          fontSize: 12,
        }}
      />

      {item.saveError ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--color-red)",
          }}
        >
          Save failed: {item.saveError}
        </div>
      ) : null}
    </div>
  );
}
