// apps/web-admin/src/pages/Languages.tsx
import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { languages, type Language } from "../lib/translation-workbench-api";

const EMPTY = { code: "", name: "", nativeName: "", script: "", enabled: true, sortOrder: 100 };

export function Languages() {
  const [rows, setRows] = useState<Language[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  async function load() {
    try {
      setRows(await languages.list(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }
  useEffect(() => { void load(); }, []);

  async function toggle(code: string, enabled: boolean) {
    try {
      await languages.patch(code, { enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    }
  }

  async function add() {
    if (!form.code || !form.name || !form.nativeName) return;
    try {
      await languages.upsert({ ...form, script: form.script || null });
      setForm({ ...EMPTY });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "add failed");
    }
  }

  return (
    <AdminShell crumbs="Quality · Languages" title="Languages">
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Native</th><th>Script</th><th>Source</th><th>Enabled</th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.code}>
                <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.code}</td>
                <td>{l.name}</td>
                <td>{l.nativeName}</td>
                <td style={{ color: "var(--ink-3)" }}>{l.script ?? ""}</td>
                <td>{l.isSource ? <Pill tone="info">source</Pill> : ""}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={l.enabled}
                    disabled={l.isSource}
                    aria-label={`toggle ${l.code}`}
                    onChange={(e) => toggle(l.code, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="code (e.g. kn)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inp} />
        <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <input placeholder="native name" value={form.nativeName} onChange={(e) => setForm({ ...form, nativeName: e.target.value })} style={inp} />
        <input placeholder="script" value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} style={inp} />
        <button className="btn btn-primary" onClick={add}>Add language</button>
      </div>
    </AdminShell>
  );
}

const inp: React.CSSProperties = {
  padding: "6px 10px", background: "var(--paper-2)", color: "var(--ink)",
  border: "1px solid var(--rule)", borderRadius: 4, fontSize: 13,
};
