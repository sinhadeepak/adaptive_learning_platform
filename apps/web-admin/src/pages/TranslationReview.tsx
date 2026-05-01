import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import {
  translation,
  type SingleTranslation,
  type TranslationStatusRow,
} from "../lib/phase5-api";
import { useAuth } from "../lib/auth-provider";

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
          background: "var(--bg-subtle, #f8f9fc)",
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
            border: "1px solid var(--border-subtle, #f0f2f6)",
            borderRadius: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{f.path} (source)</div>
            <div style={{ fontSize: 14 }}>{f.src}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
              {f.path} ({tr.language})
            </div>
            <div style={{ fontSize: 14 }}>{f.tgt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TranslationReview() {
  const { user } = useAuth();
  const [questionId, setQuestionId] = useState("");
  const [list, setList] = useState<TranslationStatusRow[] | null>(null);
  const [selected, setSelected] = useState<SingleTranslation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadList() {
    setError(null);
    try {
      const rows = await translation.listForArtifact(questionId);
      setList(rows);
      if (rows.length > 0) {
        const first = rows.find((r) => r.status !== "PUBLISHED") ?? rows[0];
        await loadOne(first.language);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load translations");
    }
  }

  async function loadOne(lang: string) {
    try {
      setSelected(await translation.getOne(questionId, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load translation");
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
    <AppShell title="Translation Review" chips={[{ label: "Phase 5" }]}>
      {error && <Banner tone="danger">{error}</Banner>}

      <section style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
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
              border: "1px solid var(--border, #e1e5ee)",
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
              background: "var(--color-blue, #4f87f6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: questionId ? "pointer" : "not-allowed",
            }}
          >
            Load translations
          </button>
        </div>
      </section>

      {list && list.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>Languages</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {list.map((row) => (
              <button
                key={row.language}
                onClick={() => void loadOne(row.language)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 4,
                  background:
                    selected?.language === row.language ? "var(--color-blue, #4f87f6)" : "white",
                  color: selected?.language === row.language ? "white" : "inherit",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {row.language.toUpperCase()}{" "}
                <Pill tone={statusTone(row.status)}>{row.status}</Pill>
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <section>
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              background: "var(--bg-subtle, #f8f9fc)",
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

          <PayloadDiff source={null} translation={selected} />

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              onClick={() => void handleReview("approve")}
              disabled={busy || selected.status === "PUBLISHED"}
              style={{
                padding: "8px 16px",
                background: "var(--color-green, #10c47a)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              ✓ Approve & publish
            </button>
            <button
              onClick={() => void handleReview("reject")}
              disabled={busy || selected.status === "REJECTED"}
              style={{
                padding: "8px 16px",
                background: "var(--color-red, #f43f5e)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              ✗ Reject
            </button>
          </div>
        </section>
      )}
    </AppShell>
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
