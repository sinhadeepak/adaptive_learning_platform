import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@alp/auth-client";
import { auth } from "./api";
import { _resetContentLanguageCache } from "./session-start";

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
  // The access token now lives in memory, so after a hard refresh there's no
  // JS-visible token. We block on a silent cookie-based restore only when a
  // returning session is signalled by the non-sensitive presence flag —
  // anonymous visitors render immediately (no wasted /auth/refresh round-trip).
  const [loading, setLoading] = useState<boolean>(
    () => auth.getUser() === null && auth.hasPersistedSession(),
  );

  // Rehydrate on mount: restore the session from the HttpOnly refresh cookie
  // (no-op if we already hold an access token), then fetch /profile/me.
  useEffect(() => {
    if (user || (!auth.hasPersistedSession() && !auth.isAuthenticated())) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const restored = auth.isAuthenticated() || (await auth.restore());
        if (!restored) return; // session gone — stay logged out, no redirect
        const res = await auth.fetch("/api/v1/profile/me");
        if (res.ok) {
          const profile = (await res.json()) as { user: User };
          // Both: React state for components, and the auth-client's
          // internal currentUser so auth.getUser() works after refresh.
          // Without the auth.setUser call, helpers like social.fetch
          // can't read the user id and the backend 401s on every call.
          if (!cancelled) {
            setUserState(profile.user);
            auth.setUser(profile.user);
          }
        }
      } catch {
        // swallow — onSessionExpired will fire if a mid-session refresh fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const session = await auth.login({ email, password, remember });
    setUserState(session.user);
    setLoading(false);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    _resetContentLanguageCache();
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
