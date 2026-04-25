import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

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
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
