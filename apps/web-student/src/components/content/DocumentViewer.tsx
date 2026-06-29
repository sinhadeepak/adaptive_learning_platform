import { useEffect, useState } from "react";
import { contentResources, type StudentResource } from "../../lib/api";

// ─────────────────────────────────────────────────────────────────────────
// DocumentViewer (Study Materials hub)
//
// Modal that displays an uploaded PDF/document. The stored resource carries
// only an S3 object key (doc_object_key); we re-sign a fresh, short-lived
// GET URL via /uploads/sign each time the modal opens (presigned URLs have
// a 5-min TTL and aren't persistable). Renders in a native <iframe> — no
// react-pdf dependency. Fires started/closed view events so document
// engagement lands in the same telemetry stream as videos.
//
// Shares EmbeddedVideoPlayer's modal shell for a consistent look.
// ─────────────────────────────────────────────────────────────────────────

export function DocumentViewer({
  resource,
  onClose,
}: {
  resource: StudentResource;
  onClose: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void contentResources.recordView(resource.id, { event_type: "started" });
    (async () => {
      const key = resource.doc_object_key;
      if (!key) {
        // Fallback: some rows store the key in `url`.
        if (resource.url) {
          if (!cancelled) setSignedUrl(resource.url);
          return;
        }
        if (!cancelled) setError("This document has no file attached.");
        return;
      }
      const url = await contentResources.signDocument(key);
      if (cancelled) return;
      if (url) setSignedUrl(url);
      else setError("Couldn't open this document. Try again in a moment.");
    })();
    return () => {
      cancelled = true;
      void contentResources.recordView(resource.id, { event_type: "closed" });
    };
  }, [resource.id, resource.doc_object_key, resource.url]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Read ${resource.title}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper-2, #0C1422)",
          borderRadius: 10,
          maxWidth: 1000,
          width: "100%",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--rule-2, rgba(255,255,255,0.11))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--rule, rgba(255,255,255,0.07))",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink, #EEF2FF)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            📄 {resource.title}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {signedUrl ? (
              <a
                href={signedUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "transparent",
                  border: "1px solid var(--rule-2, rgba(255,255,255,0.11))",
                  color: "var(--ink-2, #B8C5E0)",
                  borderRadius: 6,
                  padding: "4px 12px",
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Open in new tab
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document"
              style={{
                background: "transparent",
                border: "1px solid var(--rule-2, rgba(255,255,255,0.11))",
                color: "var(--ink-2, #B8C5E0)",
                borderRadius: 6,
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div style={{ flex: 1, background: "#1b1b1b", position: "relative" }}>
          {error ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--warn, #F5A623)",
                fontSize: 13,
                padding: 16,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          ) : signedUrl ? (
            <iframe
              src={signedUrl}
              title={resource.title}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-4, #7A8BAD)",
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
