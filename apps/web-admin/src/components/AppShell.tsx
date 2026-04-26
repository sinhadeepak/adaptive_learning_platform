import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar, type TopbarChip } from "./Topbar";
import { useAuth } from "../lib/auth-provider";
import "@alp/design-system/shell.css";
import "../styles/shell.css";

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

  return (
    <div className="app-shell">
      <Sidebar
        user={user ? { firstName: user.firstName, role: user.role } : null}
        onSignOut={() => void logout()}
      />
      <div className="app-content">
        <Topbar title={title} chips={chips} actions={actions} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
