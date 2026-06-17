import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { isAdmin, useAuth } from "./auth-provider";

// Both route guards must hold off redirecting while the auth provider
// is still restoring a stored session — otherwise a hard-refresh on a
// deep link races /profile/me, hits ProtectedRoute with
// isAuthenticated=false, redirects to /login, then GuestOnlyRoute
// (once /profile/me resolves) bounces the user to /flags. Net effect:
// hard-refresh on /ai-cost lands the user on /flags every time. The
// fix is a "bootstrapping" gate exposed by AuthProvider; while it is
// true we render nothing, then re-evaluate.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, bootstrapping } = useAuth();
  const location = useLocation();
  if (bootstrapping) return null;
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
  const { isAuthenticated, bootstrapping } = useAuth();
  const location = useLocation();
  if (bootstrapping) return null;
  if (isAuthenticated) {
    // Respect the returnTo state set by ProtectedRoute when bouncing
    // here pre-bootstrap. Falls back to /dashboard so a manual hit on
    // /login while logged-in still leads somewhere sensible.
    const returnTo =
      (location.state as { returnTo?: string } | null)?.returnTo ?? "/dashboard";
    return <Navigate to={returnTo} replace />;
  }
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
