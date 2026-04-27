import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  catalog,
  content,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
} from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/primitives";
import { AIQuestionGenerator } from "../components/AIQuestionGenerator";

export function NewQuestion() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.myExams();
        if (cancelled) return;
        setExams(list);
      } catch (err) {
        if (cancelled) return;
        setScopeError(
          err instanceof Error
            ? err.message
            : "Could not load your exam assignments.",
        );
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      setSubjectId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.mySubjects(examId);
        if (cancelled) return;
        setSubjects(list);
        setSubjectId("");
        setTopics([]);
        setTopicId("");
      } catch (err) {
        if (cancelled) return;
        setScopeError(
          err instanceof Error
            ? err.message
            : "Could not load subjects for that exam.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await catalog.topics(subjectId);
        if (cancelled) return;
        setTopics(list);
        setTopicId("");
      } catch (err) {
        if (cancelled) return;
        setScopeError(
          err instanceof Error
            ? err.message
            : "Could not load topics for that subject.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

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
    if (!topicId) {
      setError("Pick an exam, subject, and topic before saving.");
      return;
    }
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

      {scopeError ? (
        <Banner tone="danger" role="alert">
          {scopeError}
        </Banner>
      ) : null}

      {!scopeLoading && exams.length === 0 && !scopeError ? (
        <Banner tone="warning">
          You have not been assigned to any exams yet. Ask a platform
          admin to grant you authoring scope before drafting questions.
        </Banner>
      ) : null}

      <form onSubmit={handleSubmit} className="form-stack">
        <fieldset className="form-fieldset">
          <legend className="form-label">
            Where this question lives · Exam → Subject → Topic
          </legend>
          <div className="form-row">
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Exam</span>
              <select
                required
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="form-input"
                disabled={scopeLoading || exams.length === 0}
              >
                <option value="">
                  {scopeLoading ? "Loading…" : "Select an exam"}
                </option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Subject</span>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="form-input"
                disabled={!examId || subjects.length === 0}
              >
                <option value="">
                  {!examId
                    ? "Pick an exam first"
                    : subjects.length === 0
                      ? "No subjects available"
                      : "Select a subject"}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span className="form-label">Topic</span>
              <select
                required
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="form-input"
                disabled={!subjectId || topics.length === 0}
              >
                <option value="">
                  {!subjectId
                    ? "Pick a subject first"
                    : topics.length === 0
                      ? "No topics yet"
                      : "Select a topic"}
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

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
          <button
            type="submit"
            disabled={submitting || !topicId}
            className="btn btn-primary"
          >
            {submitting ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>

      <AIQuestionGenerator
        topicId={topicId}
        topicTitle={
          topics.find((t) => t.id === topicId)?.title ?? ""
        }
        onSavedAll={() => navigate("/questions", { replace: true })}
      />
    </AppShell>
  );
}
