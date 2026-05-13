import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@alp/auth-client";
import { auth } from "./api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  // True while the provider is rehydrating from stored tokens. Routes
  // that gate on auth must wait this out — otherwise a hard refresh on
  // a deep link sees `user === null` for one tick, redirects to /login,
  // and the auth-already-present GuestOnlyRoute bounces to /home,
  // losing the original URL.
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<Session>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(auth.getUser());
  // We're "loading" only when there are tokens in storage but the
  // in-memory user object hasn't been hydrated yet. No tokens → no
  // loading; a fresh login already populates the user before we render.
  const [loading, setLoading] = useState<boolean>(
    () => auth.isAuthenticated() && auth.getUser() === null,
  );

  // Rehydrate on mount if tokens exist: call /profile/me to get the user.
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
          // Both: React state for components, and the auth-client's
          // internal currentUser so auth.getUser() works after refresh.
          // Without the auth.setUser call, helpers like social.fetch
          // can't read the user id and the backend 401s on every call.
          setUserState(profile.user);
          auth.setUser(profile.user);
        }
      } catch {
        // swallow — onSessionExpired will fire if refresh fails
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const session = await auth.login({ email, password, remember });
    setUserState(session.user);
    setLoading(false);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUserState(null);
    setLoading(false);
  }, []);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    auth.setUser(u);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, loading, login, logout, setUser }),
    [user, loading, login, logout, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
