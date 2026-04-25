import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { content } from "../lib/api";

export function NewQuestion() {
  const navigate = useNavigate();
  const [topicId, setTopicId] = useState("");
  const [stem, setStem] = useState("");
  const [choices, setChoices] = useState<string[]>(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [difficultyB, setDifficultyB] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setChoice(idx: number, val: string) {
    setChoices((cur) => cur.map((c, i) => (i === idx ? val : c)));
  }

  function addChoice() {
    setChoices((cur) => (cur.length < 8 ? [...cur, ""] : cur));
  }

  function removeChoice(idx: number) {
    setChoices((cur) => {
      if (cur.length <= 2) return cur;
      const next = cur.filter((_, i) => i !== idx);
      if (correctIdx >= next.length) setCorrectIdx(next.length - 1);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedChoices = choices.map((c) => c.trim());
    if (trimmedChoices.some((c) => c === "")) {
      setError("All choices must be non-empty.");
      return;
    }
    setSubmitting(true);
    try {
      await content.create({
        topicId: topicId.trim(),
        stem: stem.trim(),
        choices: trimmedChoices,
        correctIdx,
        difficultyB,
        language,
      });
      navigate("/questions", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save question");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22 }}>New question</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Saved as DRAFT. Submit it from “My questions” when you’re ready for peer review.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Topic ID (UUID)
          <input
            required
            placeholder="e.g. 11111111-1111-1111-1111-111111111111"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            style={{ padding: 8, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Stem
          <textarea
            required
            minLength={8}
            maxLength={2000}
            rows={4}
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          />
        </label>

        <fieldset style={{ border: "1px solid #ddd", padding: 12 }}>
          <legend style={{ fontSize: 13 }}>Choices (mark the correct one)</legend>
          {choices.map((c, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input
                type="radio"
                name="correctIdx"
                checked={correctIdx === idx}
                onChange={() => setCorrectIdx(idx)}
              />
              <span style={{ width: 16, fontSize: 13, color: "#666" }}>
                {String.fromCharCode(65 + idx)}.
              </span>
              <input
                required
                value={c}
                onChange={(e) => setChoice(idx, e.target.value)}
                style={{ flex: 1, padding: 6, fontSize: 14 }}
              />
              {choices.length > 2 && (
                <button type="button" onClick={() => removeChoice(idx)} style={{ fontSize: 12 }}>
                  remove
                </button>
              )}
            </div>
          ))}
          {choices.length < 8 && (
            <button type="button" onClick={addChoice} style={{ marginTop: 4, fontSize: 13 }}>
              + Add choice
            </button>
          )}
        </fieldset>

        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Difficulty (b, IRT scale)
            <input
              type="number"
              min={-4}
              max={4}
              step={0.1}
              value={difficultyB}
              onChange={(e) => setDifficultyB(parseFloat(e.target.value))}
              style={{ width: 100, padding: 8, fontSize: 14 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
              style={{ padding: 8, fontSize: 14 }}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
        </div>

        {error && (
          <div role="alert" style={{ color: "#a51c30", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={submitting} style={{ padding: 10, fontSize: 14 }}>
            {submitting ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={() => navigate(-1)} style={{ padding: 10, fontSize: 14 }}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
