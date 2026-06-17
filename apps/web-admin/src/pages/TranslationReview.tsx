import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import {
  translation,
  type SingleTranslation,
  type TranslationStatusRow,
} from "../lib/phase5-api";
import { useAuth } from "../lib/auth-provider";
import { auth } from "../lib/api";
import { env } from "../lib/env";

interface QuestionSource {
  stem: string;
  choices: string[];
}

async function fetchQuestionSource(qid: string): Promise<QuestionSource | null> {
  try {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/content/questions/${encodeURIComponent(qid)}`,
    );
    if (!r.ok) return null;
    const body = (await r.json()) as { stem: string; choices: string[] };
    return { stem: body.stem, choices: body.choices };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CE-402 — translation review UI.
// Reviewer sees the source artifact + translated payload side-by-side,
// can approve or reject, and (TODO follow-up) flag for cultural review.
// Wraps the per-artifact translation routes from P5-S51.
// ─────────────────────────────────────────────────────────────────────────

function PayloadDiff({
  source,
  translation: tr,
}: {
  source: Record<string, unknown> | null;
  translation: SingleTranslation;
}) {
  const fields: Array<{ path: string; src: string; tgt: string }> = [];

  function walk(srcNode: unknown, tgtNode: unknown, path: string): void {
    if (typeof srcNode === "string" && typeof tgtNode === "string") {
      fields.push({ path, src: srcNode, tgt: tgtNode });
      return;
    }
    if (
      srcNode &&
      typeof srcNode === "object" &&
      tgtNode &&
      typeof tgtNode === "object"
    ) {
      const srcRec = srcNode as Record<string, unknown>;
      const tgtRec = tgtNode as Record<string, unknown>;
      for (const key of Object.keys(tgtRec)) {
        walk(srcRec[key], tgtRec[key], path ? `${path}.${key}` : key);
      }
    }
    if (Array.isArray(srcNode) && Array.isArray(tgtNode)) {
      for (let i = 0; i < tgtNode.length; i++) {
        walk(srcNode[i], tgtNode[i], `${path}[${i}]`);
      }
    }
  }
  walk(source ?? {}, tr.payloadTranslation, "");

  if (fields.length === 0) {
    return (
      <pre
        style={{
          background: "var(--paper-2)",
          color: "var(--ink)",
          border: "1px solid var(--rule)",
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(tr.payloadTranslation, null, 2)}
      </pre>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {fields.map((f) => (
        <div
          key={f.path}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: 12,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
              {f.path} (source)
            </div>
            <div style={{ fontSize: 14, color: "var(--ink)" }}>{f.src}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
              {f.path} ({tr.language})
            </div>
            <div style={{ fontSize: 14, color: "var(--ink)" }}>{f.tgt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TranslationReview() {
  const { user } = useAuth();
  const { questionId: routeQuestionId } = useParams<{ questionId?: string }>();
  const [questionId, setQuestionId] = useState(routeQuestionId ?? "");
  const [list, setList] = useState<TranslationStatusRow[] | null>(null);
  const [selected, setSelected] = useState<SingleTranslation | null>(null);
  const [source, setSource] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-load translations when arriving from the list page (URL has
  // /:questionId). Run only once per questionId — `lastAutoLoadedRef`
  // guards against React StrictMode double-mount or re-renders that
  // would otherwise refetch on every state change.
  const lastAutoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeQuestionId) return;
    if (lastAutoLoadedRef.current === routeQuestionId) return;
    lastAutoLoadedRef.current = routeQuestionId;
    setQuestionId(routeQuestionId);
    void loadList(routeQuestionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQuestionId]);

  async function loadList(qid: string = questionId) {
    if (!qid) return;
    setError(null);
    setSource(null);
    try {
      const rows = await translation.listForArtifact(qid);
      setList(rows);
      // Fetch the question's actual source payload so the reviewer can
      // diff source ↔ translation. Reviewer needs the EN side to judge
      // whether the HI rendering preserves intent.
      const src = await fetchQuestionSource(qid);
      if (src) setSource(src as unknown as Record<string, unknown>);
      if (rows.length > 0) {
        const first = rows.find((r) => r.status !== "PUBLISHED") ?? rows[0];
        await loadOne(first.language, qid);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load translations");
    }
  }

  async function loadOne(lang: string, qid: string = questionId) {
    if (!qid) return;
    try {
      setSelected(await translation.getOne(qid, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load translation");
    }
  }

  // Phase-2 target languages per Phase-5 plan; reviewer can kick off a
  // fresh translation for any not yet in the list.
  const SUPPORTED_LANGS = ["hi", "ta", "te", "bn", "mr"];
  const existingLangs = new Set((list ?? []).map((r) => r.language));
  const missingLangs = SUPPORTED_LANGS.filter((l) => !existingLangs.has(l));

  async function startTranslation(targetLang: string): Promise<void> {
    if (!questionId || !source) return;
    setBusy(true);
    setError(null);
    try {
      const r = await auth.fetch(`${env.apiBaseUrl}/localisation/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId: questionId,
          sourceLang: "en",
          targetLang,
          subject: "general",
          payload: source,
          translatablePaths: ["stem", "choices[*]"],
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadList(questionId);
      await loadOne(targetLang, questionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(action: "approve" | "reject") {
    if (!selected || !user) return;
    setBusy(true);
    try {
      const updated = await translation.review(
        selected.artifactId,
        selected.language,
        action,
        user.id,
      );
      setSelected(updated);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      crumbs="Quality · Translation review"
      title="Translation review"
      chips={<span className="vidya-shell__chip">Phase 5</span>}
      actions={
        <Link to="/translation-review" className="btn btn-ghost">
          ← Back to questions
        </Link>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}

      <section style={{ marginBottom: 16 }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            color: "var(--ink-2)",
            marginBottom: 4,
          }}
        >
          Question UUID
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            style={{
              flex: 1,
              padding: "6px 10px",
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              fontFamily: "monospace",
              fontSize: 13,
            }}
          />
          <button
            onClick={() => void loadList()}
            disabled={!questionId}
            style={{
              padding: "6px 16px",
              background: questionId ? "var(--info)" : "var(--paper-2)",
              color: questionId ? "white" : "var(--ink-3)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              cursor: questionId ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Load translations
          </button>
        </div>
      </section>

      {source && (
        <section
          style={{
            marginBottom: 16,
            padding: 12,
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            color: "var(--ink)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: 0.04,
              marginBottom: 6,
            }}
          >
            Source (EN)
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            {String((source as { stem?: string }).stem ?? "—")}
          </div>
          {Array.isArray((source as { choices?: unknown }).choices) && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              {((source as { choices: string[] }).choices).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {list && list.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 14,
              marginBottom: 8,
              color: "var(--ink)",
            }}
          >
            Languages
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {list.map((row) => {
              const isActive = selected?.language === row.language;
              return (
                <button
                  key={row.language}
                  onClick={() => void loadOne(row.language)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--rule)",
                    borderRadius: 4,
                    background: isActive ? "var(--info)" : "var(--card)",
                    color: isActive ? "white" : "var(--ink)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {row.language.toUpperCase()}{" "}
                  <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                </button>
              );
            })}
          </div>

          {missingLangs.length > 0 && source && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.04,
                }}
              >
                Translate to
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {missingLangs.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => void startTranslation(lang)}
                    disabled={busy}
                    style={{
                      padding: "6px 12px",
                      background: "var(--card)",
                      color: "var(--ink)",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    + {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {selected && (
        <section>
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              color: "var(--ink)",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <strong>{selected.language.toUpperCase()}</strong> · status{" "}
            <Pill tone={statusTone(selected.status)}>{selected.status}</Pill> ·
            version {selected.version} · AI confidence{" "}
            {selected.aiConfidence !== null
              ? selected.aiConfidence.toFixed(2)
              : "n/a"}
          </div>

          <PayloadDiff source={source} translation={selected} />

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              onClick={() => void handleReview("approve")}
              disabled={busy || selected.status === "PUBLISHED"}
              style={{
                padding: "8px 16px",
                background: "var(--good)",
                color: "white",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              ✓ Approve & publish
            </button>
            <button
              onClick={() => void handleReview("reject")}
              disabled={busy || selected.status === "REJECTED"}
              style={{
                padding: "8px 16px",
                background: "var(--bad)",
                color: "white",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              ✗ Reject
            </button>
          </div>
        </section>
      )}
    </AdminShell>
  );
}

function statusTone(status: string): "muted" | "warning" | "success" | "danger" {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "DRAFT":
    case "IN_REVIEW":
      return "warning";
    case "REJECTED":
      return "danger";
    default:
      return "muted";
  }
}