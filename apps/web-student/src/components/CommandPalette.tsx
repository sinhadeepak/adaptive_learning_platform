// CommandPalette — global Cmd+K palette (Phase 6 S58).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S58
//
// Opens on Cmd+K / Ctrl+K from anywhere. Fuzzy-matches against a
// static list of navigation + quick actions. Arrow-key navigable,
// Enter executes, Esc closes.
//
// v0 ships navigation actions only — wired actions (like "Generate
// weekly narrative") can plug in via the actions prop without
// touching this file.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface CommandPaletteAction {
  id: string;
  label: string;
  /** Optional eyebrow group label, rendered above the item in headings. */
  group?: string;
  /** Optional keywords to widen the search match. */
  keywords?: string[];
  /** Route to navigate to. Either `to` OR `onRun` must be set. */
  to?: string;
  /** Callback when activated. Receives no args. */
  onRun?: () => void;
  /** Optional glyph rendered alongside the label. */
  glyph?: string;
}

const DEFAULT_ACTIONS: CommandPaletteAction[] = [
  { id: "home", group: "Navigate", glyph: "⚡", label: "Home", to: "/home", keywords: ["dashboard"] },
  { id: "catalog", group: "Navigate", glyph: "📚", label: "Catalog", to: "/catalog", keywords: ["study", "exams"] },
  { id: "practice", group: "Navigate", glyph: "🎯", label: "Practice", to: "/practice" },
  { id: "plan", group: "Navigate", glyph: "🗓", label: "Plan editor", to: "/plan", keywords: ["schedule", "week"] },
  { id: "insights", group: "Navigate", glyph: "✦", label: "Insights hub", to: "/insights" },
  { id: "analysis", group: "Navigate", glyph: "📊", label: "Analysis", to: "/analysis" },
  { id: "experts", group: "Navigate", glyph: "✦", label: "AI Tutor", to: "/experts", keywords: ["tutor"] },
  { id: "doubts", group: "Navigate", glyph: "❓", label: "Doubts", to: "/doubts" },
  { id: "revision", group: "Navigate", glyph: "↻", label: "Revision queue", to: "/revision" },
  { id: "history", group: "Navigate", glyph: "📜", label: "History", to: "/history" },
  { id: "bookmarks", group: "Navigate", glyph: "★", label: "Saved", to: "/bookmarks" },
  { id: "search", group: "Navigate", glyph: "🔍", label: "Search", to: "/search" },
  {
    id: "concept-profile",
    group: "Drill-downs",
    glyph: "🧠",
    label: "Concept profile",
    to: "/concept-profile",
    keywords: ["mastery", "fluency"],
  },
  {
    id: "diagnostic-deep-dive",
    group: "Drill-downs",
    glyph: "🔬",
    label: "Diagnostic deep-dive",
    to: "/diagnostic-deep-dive",
    keywords: ["errors", "weakness"],
  },
  {
    id: "bandwidth",
    group: "Settings",
    glyph: "📶",
    label: "Low-bandwidth mode",
    to: "/settings/bandwidth",
    keywords: ["data", "mobile"],
  },
  { id: "settings", group: "Settings", glyph: "⚙", label: "Settings", to: "/settings" },
  { id: "profile", group: "Settings", glyph: "👤", label: "Profile", to: "/profile" },
];

export interface CommandPaletteProps {
  /**
   * Override / extend the default action set. Caller-supplied actions
   * are merged AFTER defaults, so they win on id collisions.
   */
  extraActions?: CommandPaletteAction[];
}

export function CommandPalette({ extraActions = [] }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K opens; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isToggle =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input every time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const actions = useMemo<CommandPaletteAction[]>(() => {
    const byId = new Map<string, CommandPaletteAction>();
    for (const a of DEFAULT_ACTIONS) byId.set(a.id, a);
    for (const a of extraActions) byId.set(a.id, a);
    return Array.from(byId.values());
  }, [extraActions]);

  const filtered = useMemo<CommandPaletteAction[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const hay = [
        a.label,
        a.group ?? "",
        ...(a.keywords ?? []),
        a.id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [actions, query]);

  // Group filtered actions by `group` while preserving order.
  const grouped = useMemo<Array<{ group: string; items: CommandPaletteAction[] }>>(() => {
    const out: Array<{ group: string; items: CommandPaletteAction[] }> = [];
    const map = new Map<string, CommandPaletteAction[]>();
    for (const a of filtered) {
      const g = a.group ?? "Actions";
      if (!map.has(g)) {
        map.set(g, []);
        out.push({ group: g, items: map.get(g)! });
      }
      map.get(g)!.push(a);
    }
    return out;
  }, [filtered]);

  // Flat list mirrors visual order — used for arrow-key navigation.
  const flat = useMemo<CommandPaletteAction[]>(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  function activate(a: CommandPaletteAction) {
    if (a.onRun) a.onRun();
    if (a.to) navigate(a.to);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = flat[activeIdx];
      if (a) activate(a);
    }
  }

  if (!open) return null;

  return (
    <div
      className="cmdk-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="cmdk-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <span className="cmdk-prompt" aria-hidden>
            ▸
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Where do you want to go? (type to filter)"
            className="cmdk-input"
            aria-label="Command query"
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        {flat.length === 0 ? (
          <div className="cmdk-empty">No matches. Try a different word.</div>
        ) : (
          <ul className="cmdk-list">
            {grouped.map((g) => (
              <li key={g.group} className="cmdk-group">
                <div className="cmdk-group-label">{g.group}</div>
                <ul className="cmdk-group-items">
                  {g.items.map((a) => {
                    const idx = flat.indexOf(a);
                    const active = idx === activeIdx;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          className={`cmdk-item${active ? " is-active" : ""}`}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => activate(a)}
                        >
                          {a.glyph && (
                            <span className="cmdk-item-glyph" aria-hidden>
                              {a.glyph}
                            </span>
                          )}
                          <span className="cmdk-item-label">{a.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <footer className="cmdk-footer">
          <span>
            <kbd className="cmdk-kbd">↑</kbd>
            <kbd className="cmdk-kbd">↓</kbd> navigate
          </span>
          <span>
            <kbd className="cmdk-kbd">↵</kbd> select
          </span>
          <span>
            <kbd className="cmdk-kbd">⌘</kbd>
            <kbd className="cmdk-kbd">K</kbd> toggle
          </span>
        </footer>
      </div>
    </div>
  );
}
