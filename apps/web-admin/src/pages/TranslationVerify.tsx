// apps/web-admin/src/pages/TranslationVerify.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { PayloadDiff, setAtPath } from "../components/PayloadDiff";
import { useAuth } from "../lib/auth-provider";
import {
  reviewQueue,
  translationEdit,
  type ReviewItem,
} from "../lib/translation-workbench-api";

function rowKey(i: { questionId: string; language: string }) {
  return `${i.questionId}::${i.language}`;
}

export function TranslationVerify() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const batchId = params.get("batchId") ?? undefined;

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [langFilter, setLangFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const out = await reviewQueue.list({ batchId, lang: langFilter || undefined, status: "DRAFT" });
      setItems(out.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load review queue");
    }
  }, [batchId, langFilter]);

  useEffect(() => { void load(); }, [load]);

  function toggleSel(k: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  async function saveEdit(item: ReviewItem, path: string, value: string) {
    const k = rowKey(item);
    const base = edits[k] ?? item.payloadTranslation;
    const next = setAtPath(base, path, value);
    setEdits((e) => ({ ...e, [k]: next }));
    await translationEdit.save(item.questionId, item.language, next);
  }

  async function decide(action: "approve" | "reject") {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const decisions = items
        .filter((i) => selected.has(rowKey(i)))
        .map((i) => ({ questionId: i.questionId, lang: i.language, action }));
      await reviewQueue.bulk(decisions, user!.id);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  const langs = useMemo(
    () => Array.from(new Set(items.map((i) => i.language))).sort(),
    [items],
  );

  return (
    <AdminShell crumbs="Quality · Verify translations" title="Verify translations">
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}
          style={{ padding: "6px 10px", background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <option value="">All languages</option>
          {langs.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{items.length} draft(s)</span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => {
          const k = rowKey(item);
          const isOpen = expanded.has(k);
          return (
            <div key={k} style={{ border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper-2)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
                <input type="checkbox" checked={selected.has(k)} onChange={() => toggleSel(k)}
                  aria-label={`Select ${item.questionId} ${item.language}`} />
                <Pill tone="muted">{item.language.toUpperCase()}</Pill>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.stem}>{item.stem}</span>
                {item.aiConfidence != null && (
                  <Pill tone={item.aiConfidence < 0.6 ? "warning" : "info"}>conf {item.aiConfidence.toFixed(2)}</Pill>
                )}
                {item.culturalFlags.length > 0 && <Pill tone="danger">cultural</Pill>}
                <button className="btn" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}>
                  {isOpen ? "Hide" : "Diff"}
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: 12, borderTop: "1px solid var(--rule)" }}>
                  <PayloadDiff
                    paths={item.translatablePaths}
                    source={item.sourcePayload}
                    translation={edits[k] ?? item.payloadTranslation}
                    editable
                    onEdit={(path, value) => saveEdit(item, path, value)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && !error && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>No drafts pending review.</div>
        )}
      </div>

      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", marginTop: 12, background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 8 }}>
          <strong>{selected.size} selected</strong>
          <button className="btn btn-primary" disabled={busy} onClick={() => decide("approve")}>Approve & Publish</button>
          <button className="btn" disabled={busy} onClick={() => decide("reject")}>Reject</button>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </AdminShell>
  );
}
