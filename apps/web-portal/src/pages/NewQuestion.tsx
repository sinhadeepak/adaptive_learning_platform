import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { content } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/primitives";

export function NewQuestion() {
  const navigate = useNavigate();
  const [topicId, setTopicId] = useState("");
  const [stem, setStem] = useState("");
  const [choices, setChoices] = useState<string[]>(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [difficultyB, setDifficultyB] = useState(0);
  const [discriminationA, setDiscriminationA] = useState(1.0);
  const [guessingC, setGuessingC] = useState(0.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
        ...(showAdvanced ? { discriminationA, guessingC } : {}),
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
    <AppShell
      title="New question"
      actions={
        <Link to="/questions" className="btn btn-ghost">
          ← Cancel
        </Link>
      }
    >
      <p className="page-subhead">
        Saved as DRAFT. Submit it from “My questions” when you’re ready for peer review.
      </p>

      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">Topic ID (UUID)</span>
          <input
            required
            placeholder="e.g. 11111111-1111-1111-1111-111111111111"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="form-input"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </label>

        <label className="form-field">
          <span className="form-label">Stem</span>
          <textarea
            required
            minLength={8}
            maxLength={2000}
            rows={4}
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            className="form-input"
          />
        </label>

        <fieldset className="form-fieldset">
          <legend className="form-label">Choices · pick the correct one</legend>
          {choices.map((c, idx) => (
            <div key={idx} className="form-choice-row">
              <input
                type="radio"
                name="correctIdx"
                checked={correctIdx === idx}
                onChange={() => setCorrectIdx(idx)}
                aria-label={`Mark choice ${String.fromCharCode(65 + idx)} correct`}
              />
              <span className="form-choice-letter">{String.fromCharCode(65 + idx)}.</span>
              <input
                required
                value={c}
                onChange={(e) => setChoice(idx, e.target.value)}
                className="form-input"
                style={{ flex: 1 }}
              />
              {choices.length > 2 ? (
                <button
                  type="button"
                  onClick={() => removeChoice(idx)}
                  className="link-button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          {choices.length < 8 ? (
            <button type="button" onClick={addChoice} className="btn btn-ghost">
              + Add choice
            </button>
          ) : null}
        </fieldset>

        <div className="form-row">
          <label className="form-field">
            <span className="form-label">Difficulty (b, IRT scale)</span>
            <input
              type="number"
              min={-4}
              max={4}
              step={0.1}
              value={difficultyB}
              onChange={(e) => setDifficultyB(parseFloat(e.target.value))}
              className="form-input"
              style={{ width: 120 }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "hi")}
              className="form-input"
              style={{ width: 160 }}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
        </div>

        <details
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          className="form-fieldset"
        >
          <summary className="form-label" style={{ cursor: "pointer" }}>
            Advanced — IRT calibration (only set if you have data)
          </summary>
          <p className="page-subhead" style={{ margin: "var(--sp-2) 0" }}>
            Defaults a=1.0, c=0.0 reduce to 2PL with no guessing floor. Increase
            a for sharper items; increase c for easy-to-guess items (typical
            0.20–0.25 for 4-choice MCQs).
          </p>
          <div className="form-row">
            <label className="form-field">
              <span className="form-label">Discrimination (a)</span>
              <input
                type="number"
                min={0.1}
                max={4}
                step={0.05}
                value={discriminationA}
                onChange={(e) => setDiscriminationA(parseFloat(e.target.value))}
                className="form-input"
                style={{ width: 120 }}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Guessing (c)</span>
              <input
                type="number"
                min={0}
                max={0.5}
                step={0.01}
                value={guessingC}
                onChange={(e) => setGuessingC(parseFloat(e.target.value))}
                className="form-input"
                style={{ width: 120 }}
              />
            </label>
          </div>
        </details>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  );
}
