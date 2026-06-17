import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Hard-refresh on a deep link: tokens are still in localStorage but
  // the in-memory user hasn't rehydrated. Hold rendering until the
  // bootstrap finishes — otherwise we'd Navigate to /login, and
  // GuestOnlyRoute on /login would immediately bounce to /home,
  // dropping the original URL.
  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />;
  }

  // Onboarding gate — students who haven't completed onboarding must finish first.
  if (user && user.onboardingState !== "ONBOARDED" && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding/exam" replace />;
  }

  // Conversely, a fully-onboarded user hitting /onboarding/* gets bounced home.
  if (user && user.onboardingState === "ONBOARDED" && location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  // Same rehydrate-window guard as ProtectedRoute — without it, /login
  // would render briefly while tokens are loading and could trigger an
  // unwanted state flash before redirecting to /home.
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
