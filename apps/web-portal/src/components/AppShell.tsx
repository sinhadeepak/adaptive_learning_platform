import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar, type TopbarChip } from "./Topbar";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";
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

  function canSee(id: string): boolean {
    if (id === "review") return canReview(user?.role);
    if (id === "questions") return true; // anyone authenticated can view their drafts (empty if non-author)
    if (id === "resources") return canAuthor(user?.role);
    return true;
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user ? { firstName: user.firstName, role: user.role } : null}
        canSee={canSee}
        onSignOut={() => void logout()}
      />
      <div className="app-content">
        <Topbar title={title} chips={chips} actions={actions} />
        <main className="app-main">
          {!canAuthor(user?.role) ? (
            <div
              className="card"
              style={{
                marginBottom: "var(--sp-4)",
                padding: "var(--sp-4)",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              Your role <strong>{user?.role ?? "—"}</strong> is read-only on
              authoring screens. Authoring is open to TEACHER and above.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}