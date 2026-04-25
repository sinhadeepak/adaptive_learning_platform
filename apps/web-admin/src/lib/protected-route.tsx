import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { isAdmin, useAuth } from "./auth-provider";

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
  if (isAuthenticated) return <Navigate to="/flags" replace />;
  return <>{children}</>;
}

/// Admin-only routes — students/teachers see "your role can't access" instead
/// of a 403 from the API.
export function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isAdmin(user?.role)) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>Access denied</h1>
        <p>
          Your role ({user?.role ?? "unknown"}) cannot access the admin
          surface. The Authoring Portal at /portal is what you're looking
          for.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
