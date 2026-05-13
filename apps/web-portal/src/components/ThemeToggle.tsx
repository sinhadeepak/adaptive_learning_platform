// Three-segment theme toggle: ☼ Light · ⌘ System · ☾ Dark.
// Lives in the AppShell topbar so it's always accessible. The selected
// segment fills in white (light mode) or a darker surface (dark mode)
// with a blue accent on the icon.

import { useTheme, type Theme } from "../lib/theme";

const OPTIONS: Array<{ value: Theme; icon: string; label: string }> = [
  { value: "light", icon: "☼", label: "Light theme" },
  { value: "system", icon: "⌘", label: "Match system theme" },
  { value: "dark", icon: "☾", label: "Dark theme" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Color theme" className="theme-toggle">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.label}
          className={`theme-toggle-opt${theme === o.value ? " on" : ""}`}
          onClick={() => setTheme(o.value)}
        >
          <span aria-hidden style={{ fontFamily: "var(--font-sans)" }}>
            {o.icon}
          </span>
        </button>
      ))}
    </div>
  );
}
