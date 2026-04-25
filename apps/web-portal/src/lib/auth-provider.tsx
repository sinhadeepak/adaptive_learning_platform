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
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.getUser());

  // Hydrate user from /profile/me when tokens exist but user state doesn't yet
  // (e.g. page reload).
  useEffect(() => {
    if (!auth.isAuthenticated() || user) return;
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) {
          const profile = (await res.json()) as { user: User };
          setUser(profile.user);
        }
      } catch {
        /* swallow — onSessionExpired handles the redirect */
      }
    })();
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await auth.login({ email, password });
    setUser(session.user);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
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
