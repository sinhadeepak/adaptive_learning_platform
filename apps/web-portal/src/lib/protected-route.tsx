import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}

export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/questions" replace />;
  return <>{children}</>;
}

export function RoleGate({
  allow,
  children,
}: {
  allow: (role: string | undefined) => boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!allow(user?.role)) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>Forbidden</h1>
        <p>
          Your role ({user?.role ?? "unknown"}) cannot access this surface. If
          you believe this is wrong, contact your institution admin.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
