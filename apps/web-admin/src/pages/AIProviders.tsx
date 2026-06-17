/**
 * AIProviders — admin page for the multi-provider AI chain.
 *
 * Lists every provider configured (seeded with disabled rows for
 * Ollama / OpenAI / Anthropic). Admin reorders by clicking the
 * priority arrows, toggles enabled, edits the model + base URL,
 * pastes an API key (encrypted server-side), and tests connectivity
 * with one click.
 *
 * The runtime chain (services/learning/.../ai_providers/fallback.py)
 * walks `enabled` rows by `priority` order — this page IS the
 * priority order.
 */

import { useEffect, useState } from "react";

import { AdminShell } from "../components/AdminShell";
import { Banner } from "../components/primitives";
import { auth } from "../lib/api";

type Kind = "ollama" | "openai" | "anthropic" | "claude_code";

interface ProviderEntry {
  id: string;
  kind: Kind;
  display_name: string;
  enabled: boolean;
  priority: number;
  base_url: string | null;
  model: string;
  has_key: boolean;
  key_hint: string | null;
  extra: Record<string, unknown>;
}

export function AIProviders() {
  const [rows, setRows] = useState<ProviderEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function load() {
    setError(null);
    try {
      const res = await auth.fetch("/api/v1/admin/ai-providers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((await res.json()) as ProviderEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, body: Partial<ProviderEntry> & { api_key?: string }) {
    setBusyId(id);
    setError(null);
    try {
      const res = await auth.fetch(`/api/v1/admin/ai-providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as ProviderEntry;
      setRows((prev) => (prev ? prev.map((r) => (r.id === id ? updated : r)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function moveBy(id: string, delta: number) {
    if (!rows) return;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swap = idx + delta;
    if (swap < 0 || swap >= rows.length) return;
    const a = rows[idx];
    const b = rows[swap];
    // Swap priorities so the chain re-orders. If both have the same
    // priority, give them deterministic ones.
    const aPrio = a.priority === b.priority ? a.priority : b.priority;
    const bPrio = a.priority === b.priority ? a.priority + 1 : a.priority;

    setBusyId(id);
    setError(null);
    try {
      const res = await auth.fetch("/api/v1/admin/ai-providers/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: a.id, priority: aPrio },
            { id: b.id, priority: bPrio },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as ProviderEntry[];
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
    } finally {
      setBusyId(null);
    }
  }

  async function runTest(id: string) {
    setBusyId(id);
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: "Testing…" } }));
    try {
      const res = await auth.fetch(`/api/v1/admin/ai-providers/${id}/test`, {
        method: "POST",
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult((prev) => ({ ...prev, [id]: body }));
    } catch (e) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, message: e instanceof Error ? e.message : "Test failed" },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      crumbs="Analyse · AI providers"
      title="AI providers"
      subtitle="Calls walk this list top-to-bottom. The first enabled provider that returns a usable response wins; on failure the next is tried. Keys are stored encrypted server-side (Fernet AES + HMAC) — paste them once, they don't round-trip back to the browser."
      chips={<span className="vidya-shell__chip">Analyse</span>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
        {error && (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        )}

        {rows === null ? (
          <div className="card" style={{ padding: 20, fontSize: 13 }}>
            Loading providers…
          </div>
        ) : rows.length === 0 ? (
          <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--ink-3)" }}>
            No providers configured.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row, idx) => (
              <ProviderCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                isFirst={idx === 0}
                isLast={idx === rows.length - 1}
                test={testResult[row.id]}
                onUp={() => moveBy(row.id, -1)}
                onDown={() => moveBy(row.id, 1)}
                onPatch={(p) => patch(row.id, p)}
                onTest={() => runTest(row.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ProviderCard({
  row,
  busy,
  isFirst,
  isLast,
  test,
  onUp,
  onDown,
  onPatch,
  onTest,
}: {
  row: ProviderEntry;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  test?: { ok: boolean; message: string };
  onUp: () => void;
  onDown: () => void;
  onPatch: (p: Partial<ProviderEntry> & { api_key?: string }) => void;
  onTest: () => void;
}) {
  const [model, setModel] = useState(row.model);
  const [baseUrl, setBaseUrl] = useState(row.base_url ?? "");
  const [keyDraft, setKeyDraft] = useState("");

  // Re-sync local fields if the parent reloads the row (after save).
  useEffect(() => {
    setModel(row.model);
    setBaseUrl(row.base_url ?? "");
  }, [row.id, row.model, row.base_url]);

  const dirty = model !== row.model || (row.base_url ?? "") !== baseUrl;

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderLeft: `3px solid ${
          row.enabled ? "var(--good)" : "var(--ink-4)"
        }`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {/* Priority arrows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            type="button"
            onClick={onUp}
            disabled={isFirst || busy}
            style={arrowBtn(isFirst || busy)}
            aria-label="Move up"
            title="Move up in priority"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={isLast || busy}
            style={arrowBtn(isLast || busy)}
            aria-label="Move down"
            title="Move down in priority"
          >
            ▼
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{row.display_name}</strong>
            <span style={pill(row.kind)}>{row.kind}</span>
            <code style={{ fontSize: 11, color: "var(--gold)" }}>
              priority {row.priority}
            </code>
          </div>
          {row.has_key && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              key on file: {row.key_hint ?? "(set)"}
            </div>
          )}
          {row.kind === "claude_code" && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Runs the local <code>claude</code> CLI with its logged-in
              subscription. No API key — run <code>claude login</code> inside
              the container.
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={row.enabled}
            disabled={busy}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            row.kind === "claude_code"
              ? "1fr"
              : row.kind === "ollama"
                ? "1fr 1fr"
                : "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <Field label="Model">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              row.kind === "openai"
                ? "gpt-4o-mini"
                : row.kind === "anthropic"
                  ? "claude-haiku-4-5-20251001"
                  : row.kind === "claude_code"
                    ? "sonnet"
                    : "llama3.1:8b"
            }
            style={inputStyle}
          />
        </Field>
        {row.kind !== "claude_code" && (
          <Field
            label={row.kind === "ollama" ? "Base URL (Ollama server)" : "Base URL (override, optional)"}
          >
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                row.kind === "ollama"
                  ? "http://host.docker.internal:11434"
                  : "leave blank for default"
              }
              style={inputStyle}
            />
          </Field>
        )}
        {row.kind !== "ollama" && row.kind !== "claude_code" && (
          <Field
            label={row.has_key ? "Replace API key" : "API key"}
            hint={
              row.has_key
                ? "Pasting a new key replaces the existing one."
                : "Pasted once; stored encrypted; not returned to the browser."
            }
          >
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={row.kind === "openai" ? "sk-…" : "sk-ant-…"}
              autoComplete="new-password"
              style={inputStyle}
            />
          </Field>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            const body: Partial<ProviderEntry> & { api_key?: string } = {};
            if (dirty) {
              body.model = model;
              body.base_url = baseUrl || null;
            }
            if (keyDraft.trim()) body.api_key = keyDraft.trim();
            if (Object.keys(body).length === 0) return;
            onPatch(body);
            setKeyDraft("");
          }}
          disabled={busy || (!dirty && !keyDraft.trim())}
          className="btn btn-primary"
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          {busy ? "Saving…" : "Save"}
        </button>

        {row.has_key && row.kind !== "ollama" && (
          <button
            type="button"
            onClick={() => onPatch({ api_key: "" })}
            disabled={busy}
            className="btn btn-ghost"
            style={{ padding: "6px 14px", fontSize: 12 }}
            title="Remove the stored API key"
          >
            Clear key
          </button>
        )}

        <button
          type="button"
          onClick={onTest}
          disabled={busy}
          className="btn btn-ghost"
          style={{ padding: "6px 14px", fontSize: 12 }}
          title="Send a test prompt to verify reachability + key"
        >
          🧪 Test
        </button>

        {test && (
          <span
            style={{
              fontSize: 12,
              color: test.ok ? "var(--good)" : "var(--bad)",
            }}
          >
            {test.ok ? "✓" : "✗"} {test.message}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 4,
          color: "var(--ink-2)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    background: "var(--paper-2)",
    color: disabled ? "var(--ink-4)" : "var(--ink)",
    border: "1px solid var(--rule-2)",
    borderRadius: 4,
    width: 28,
    height: 22,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 10,
    padding: 0,
  };
}

function pill(kind: Kind): React.CSSProperties {
  const colors: Record<Kind, string> = {
    ollama: "rgba(34,212,238,0.18)",
    openai: "var(--good-soft)",
    anthropic: "rgba(167,139,250,0.18)",
    claude_code: "rgba(217,119,87,0.18)",
  };
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    background: colors[kind],
    color: "var(--ink)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "var(--paper-2)",
  border: "1px solid var(--rule-2)",
  borderRadius: 4,
  color: "var(--ink)",
  fontSize: 12,
  outline: "none",
};

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: { message?: string } | string };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail && typeof body.detail === "object" && body.detail.message)
      return body.detail.message;
  } catch {
    /* not json */
  }
  return null;
}