// apps/web-admin/src/pages/TranslationBatches.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { batches, type BatchSummary } from "../lib/translation-workbench-api";

export function TranslationBatches() {
  const [rows, setRows] = useState<BatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    batches.list().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "load failed"));
  }, []);

  return (
    <AdminShell crumbs="Quality · Translation batches" title="Translation batches">
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr><th>Batch</th><th>Status</th><th>Langs</th><th>Done</th><th>Failed</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link to={`/translation-batches/${b.id}`}>{b.id.slice(0, 8)}…</Link></td>
                <td><Pill tone={b.status.startsWith("DONE") ? "success" : "info"}>{b.status}</Pill></td>
                <td>{b.targetLangs.join(", ").toUpperCase()}</td>
                <td>{b.doneTasks}/{b.totalTasks}</td>
                <td>{b.failedTasks}</td>
                <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{new Date(b.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>No batches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
