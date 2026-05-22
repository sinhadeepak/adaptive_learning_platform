// F4 — Share Test Modal.
//
// Opens from the MyTests row "Share" button. POSTs /share, gets a slug,
// builds the public URL, and provides Copy + Open. Idempotent: hitting
// Share twice returns the same slug. An Unshare button breaks the link.

import { useState } from "react";

import { auth } from "../lib/api";

interface Props {
  blueprintId: string;
  initialSlug: string | null;
  onClose: () => void;
  onShared: (slug: string | null) => void;
}

function shareUrl(slug: string): string {
  if (typeof window === "undefined") return `/t/${slug}`;
  return `${window.location.origin}/t/${slug}`;
}

export function ShareTestModal({
  blueprintId,
  initialSlug,
  onClose,
  onShared,
}: Props) {
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const r = await auth.fetch(
        `/api/v1/catalog/exam-blueprints/${blueprintId}/share`,
        { method: "POST" },
      );
      if (!r.ok) {
        setError(`Couldn't share (HTTP ${r.status}).`);
        return;
      }
      const body = (await r.json()) as { shareSlug: string | null };
      setSlug(body.shareSlug);
      onShared(body.shareSlug);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function unshare() {
    if (!confirm("Remove the share link? Anyone with the old URL can no longer take the test.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await auth.fetch(
        `/api/v1/catalog/exam-blueprints/${blueprintId}/unshare`,
        { method: "POST" },
      );
      if (!r.ok) {
        setError(`Couldn't unshare (HTTP ${r.status}).`);
        return;
      }
      setSlug(null);
      onShared(null);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(shareUrl(slug));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy to clipboard — copy the link manually.");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          width: "100%",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          padding: "20px 22px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          Share this test
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          Anyone with the link can take your test. The recipient signs in
          (or signs up), takes the test, and can optionally rate it. You
          can break the link any time.
        </p>

        {error && (
          <div
            style={{
              padding: "8px 12px",
              marginBottom: 12,
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.30)",
              borderRadius: 6,
              color: "var(--bad)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {slug ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <input
                readOnly
                value={shareUrl(slug)}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 12,
                  background: "var(--paper-2)",
                  color: "var(--ink)",
                  border: "1px solid var(--rule-2)",
                  borderRadius: 6,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={copy}
                style={btnPrimaryStyle(false)}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div style={actionsRowStyle}>
              <button
                type="button"
                onClick={unshare}
                disabled={busy}
                style={btnGhostStyle(busy)}
              >
                {busy ? "Working…" : "Unshare"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={btnPrimaryStyle(false)}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <div style={actionsRowStyle}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={btnGhostStyle(busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={share}
              disabled={busy}
              style={btnPrimaryStyle(busy)}
            >
              {busy ? "Generating…" : "Mint share link →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

function btnPrimaryStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    background: "var(--accent)",
    color: "var(--paper)",
    border: "1px solid var(--accent)",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function btnGhostStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    background: "transparent",
    color: "var(--ink-2)",
    border: "1px solid var(--rule)",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}