import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@alp/auth-client";
import { auth } from "./api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<Session>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(auth.getUser());

  // Rehydrate on mount if tokens exist: call /profile/me to get the user.
  useEffect(() => {
    if (!auth.isAuthenticated() || user) return;
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) {
          const profile = (await res.json()) as { user: User };
          setUserState(profile.user);
        }
      } catch {
        // swallow — onSessionExpired will fire if refresh fails
      }
    })();
  }, [user]);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const session = await auth.login({ email, password, remember });
    setUserState(session.user);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUserState(null);
  }, []);

  const setUser = useCallback((u: User) => setUserState(u), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout, setUser }),
    [user, login, logout, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
