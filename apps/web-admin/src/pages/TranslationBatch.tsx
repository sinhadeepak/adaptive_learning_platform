// apps/web-admin/src/pages/TranslationBatch.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill, StatCard } from "../components/primitives";
import { batches, type BatchDetail } from "../lib/translation-workbench-api";

const TERMINAL = new Set(["DONE", "DONE_WITH_ERRORS"]);

export function TranslationBatch() {
  const { batchId } = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!batchId) return;
    try {
      const d = await batches.get(batchId);
      setDetail(d);
      if (!TERMINAL.has(d.batch.status)) {
        timer.current = setTimeout(load, 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load batch");
    }
  }, [batchId]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  async function retry(taskId: string) {
    if (!batchId) return;
    await batches.retryTask(batchId, taskId);
    void load();
  }

  const b = detail?.batch;
  const pct = b && b.totalTasks > 0 ? Math.round(((b.doneTasks + b.failedTasks) / b.totalTasks) * 100) : 0;

  return (
    <AdminShell crumbs="Quality · Translations · Batch" title="Translation batch">
      {error && <Banner tone="danger">{error}</Banner>}
      {b && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="Total" value={String(b.totalTasks)} />
            <StatCard label="Done" value={String(b.doneTasks)} tone="success" />
            <StatCard label="Failed" value={String(b.failedTasks)} tone={b.failedTasks ? "danger" : "muted"} />
            <StatCard label="Progress" value={`${pct}%`} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Pill tone={TERMINAL.has(b.status) ? "success" : "info"}>{b.status}</Pill>
            {TERMINAL.has(b.status) && (
              <Link to={`/translation-verify?batchId=${b.id}`} className="btn btn-primary" style={{ marginLeft: 12 }}>
                Review drafts →
              </Link>
            )}
          </div>
          <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr><th>Question</th><th>Lang</th><th>Status</th><th>Error</th><th></th></tr>
              </thead>
              <tbody>
                {detail!.tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.stem ?? t.questionId}>
                      {t.stem ?? t.questionId}
                    </td>
                    <td>{t.language.toUpperCase()}</td>
                    <td><Pill tone={t.status === "SUCCEEDED" ? "success" : t.status === "FAILED" ? "danger" : "muted"}>{t.status}</Pill></td>
                    <td style={{ color: "var(--ink-3)", fontSize: 12 }} title={t.error ?? ""}>{t.error ?? ""}</td>
                    <td>{t.status === "FAILED" && <button className="btn" onClick={() => retry(t.id)}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
