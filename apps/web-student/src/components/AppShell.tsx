import type { ReactNode } from "react";
import { InboxBell } from "./InboxBell";
import { Sidebar } from "./Sidebar";
import { Topbar, type TopbarChip } from "./Topbar";
import { useAuth } from "../lib/auth-provider";
import "@alp/design-system/shell.css";

export function AppShell({
  title,
  chips,
  actions,
  children,
}: {
  title: string;
  chips?: TopbarChip[];
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { user, logout } = useAuth();

  // The InboxBell is always last so caller-supplied actions render to its
  // left. It self-suppresses when there's no signed-in user.
  const composedActions = (
    <>
      {actions}
      <InboxBell />
    </>
  );

  return (
    <div className="app-shell">
      <Sidebar user={user} onSignOut={() => void logout()} />
      <div className="app-content">
        <Topbar title={title} chips={chips} actions={composedActions} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
