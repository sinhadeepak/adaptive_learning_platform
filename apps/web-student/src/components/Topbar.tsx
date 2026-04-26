import type { ReactNode } from "react";

export interface TopbarChip {
  label: string;
  live?: boolean;
}

export function Topbar({
  title,
  chips = [],
  actions,
}: {
  title: string;
  chips?: TopbarChip[];
  actions?: ReactNode;
}): ReactNode {
  return (
    <header className="topbar">
      <span className="topbar-title">{title}</span>
      {chips.map((chip, i) => (
        <span key={i} className="topbar-chip">
          {chip.live ? <span className="live-dot" aria-hidden /> : null}
          {chip.label}
        </span>
      ))}
      <span className="topbar-spacer" />
      {actions}
    </header>
  );
}
