import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@alp/auth-client";
import { auth } from "./api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  // True while we have stored tokens but the in-memory `user` hasn't
  // rehydrated yet (deep-link refresh case). Route guards must hold
  // off until this clears — otherwise ProtectedRoute redirects to
  // /login, GuestOnlyRoute on /login bounces to /questions, and the
  // returnTo state is dropped. Same pattern as the web-student fix.
  loading: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.getUser());
  const [loading, setLoading] = useState<boolean>(
    () => auth.isAuthenticated() && auth.getUser() === null,
  );

  // Hydrate user from /profile/me when tokens exist but user state doesn't yet
  // (e.g. page reload).
  useEffect(() => {
    if (!auth.isAuthenticated() || user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) {
          const profile = (await res.json()) as { user: User };
          setUser(profile.user);
        }
      } catch {
        /* swallow — onSessionExpired handles the redirect */
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await auth.login({ email, password });
    setUser(session.user);
    setLoading(false);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const AUTHORS = ["TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"];
const REVIEWERS = ["MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"];

export function canAuthor(role: string | undefined): boolean {
  return !!role && AUTHORS.includes(role);
}

export function canReview(role: string | undefined): boolean {
  return !!role && REVIEWERS.includes(role);
}
