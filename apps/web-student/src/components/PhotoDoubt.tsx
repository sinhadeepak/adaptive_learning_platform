import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";

// Photo-doubt resolution panel.
// User snaps a photo (or picks one) of a stuck question; we send it as a
// data:image base64 to /adaptive/doubt/photo and render the OCR extract +
// step-by-step solution + 3 IRT-calibrated similar problems for the matched
// topic.
//
// The endpoint always returns the same shape (real AI result or stub when
// OPENAI_API_KEY isn't set) so the UI is unconditional — it just renders
// the response.

interface SimilarProblem {
  id: string;
  topicId: string;
  stem: string;
  choices: string[];
}

interface DoubtResponse {
  extracted_question: string;
  subject: string;
  suggested_topic: string;
  solution_steps: string[];
  final_answer: string;
  confidence: "high" | "medium" | "low";
  matched_topic_id: string | null;
  similar_problems: SimilarProblem[];
  source: "ai" | "stub";
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — server cap matches via Pydantic length

export function PhotoDoubt() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DoubtResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB.");
      return;
    }
    setError(null);
    setResult(null);

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setPreviewUrl(dataUrl);
    await solve(dataUrl);
  }

  async function solve(dataUrl: string) {
    setLoading(true);
    try {
      const res = await auth.fetch("/api/v1/adaptive/doubt/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (!res.ok) {
        setError("Couldn't reach the doubt-solver service.");
        return;
      }
      setResult((await res.json()) as DoubtResponse);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="card" style={{ marginTop: "var(--sp-5)" }}>
      <div className="sec-row">
        <h2 className="section-heading">Stuck on a problem? Snap it</h2>
        <span className="pill pill-info">◈ AI doubt-solver</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
        Photograph a handwritten or printed question. The AI tutor reads it,
        works through the solution, and gives you 3 calibrated similar problems
        from your topic.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: "none" }}
      />

      {!previewUrl ? (
        <button
          type="button"
          onClick={pickFile}
          style={{
            marginTop: 10,
            background: "linear-gradient(90deg, var(--color-blue), var(--color-purple))",
            color: "white",
            border: "none",
            padding: "10px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📷 Snap or upload a doubt
        </button>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 16,
            marginTop: 10,
            alignItems: "start",
          }}
        >
          <img
            src={previewUrl}
            alt="Doubt preview"
            style={{
              width: 180,
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
            }}
          />
          <div>
            {loading ? (
              <div style={{ fontSize: 13, color: "var(--text-faint)" }}>
                Reading the question and working out the solution…
              </div>
            ) : error ? (
              <div style={{ fontSize: 13, color: "var(--color-red)" }}>{error}</div>
            ) : result ? (
              <DoubtResult result={result} />
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 10,
                background: "transparent",
                border: "1px solid var(--border-strong)",
                color: "var(--text-muted)",
                padding: "6px 14px",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Try another
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DoubtResult({ result }: { result: DoubtResponse }) {
  const confTone =
    result.confidence === "high"
      ? "var(--color-green)"
      : result.confidence === "medium"
      ? "var(--color-amber)"
      : "var(--color-red)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 11,
          color: "var(--text-faint)",
        }}
      >
        <span
          style={{
            background:
              result.source === "ai"
                ? "rgba(79,135,246,0.15)"
                : "var(--surface-elev1)",
            color: result.source === "ai" ? "var(--color-blue)" : "var(--text-faint)",
            padding: "2px 8px",
            borderRadius: 3,
          }}
        >
          {result.source === "ai" ? "◈ AI vision" : "◈ Stub (set OPENAI_API_KEY)"}
        </span>
        <span style={{ color: confTone }}>● {result.confidence} confidence</span>
        {result.subject ? <span>{result.subject}</span> : null}
        {result.suggested_topic ? <span>· {result.suggested_topic}</span> : null}
      </div>

      {result.extracted_question ? (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            Question read from your photo
          </div>
          <div
            style={{
              fontSize: 13,
              padding: "8px 12px",
              background: "var(--surface-elev1)",
              borderRadius: 4,
              fontFamily: "Georgia, serif",
            }}
          >
            {result.extracted_question}
          </div>
        </div>
      ) : null}

      {result.solution_steps.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            Solution
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {result.solution_steps.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {result.final_answer ? (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            Final answer
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: "6px 12px",
              background: "rgba(16,196,122,0.08)",
              borderLeft: "2px solid var(--color-green)",
              borderRadius: 4,
            }}
          >
            {result.final_answer}
          </div>
        </div>
      ) : null}

      {result.similar_problems.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
            3 similar problems from your topic bank
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.similar_problems.map((p) => (
              <Link
                key={p.id}
                to={
                  result.matched_topic_id
                    ? `/catalog/topic/${result.matched_topic_id}`
                    : "/catalog"
                }
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  background: "var(--surface-elev1)",
                  borderRadius: 4,
                  color: "inherit",
                  textDecoration: "none",
                  borderLeft: "2px solid var(--color-blue)",
                }}
              >
                {p.stem}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
