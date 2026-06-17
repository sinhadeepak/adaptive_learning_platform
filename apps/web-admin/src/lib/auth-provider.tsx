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
  // True while the provider is restoring the user from a stored token
  // on first mount. Route guards must hold off redirecting until this
  // flips to false — otherwise a hard-refresh on a deep link races
  // /profile/me, redirects to /login, then GuestOnlyRoute bounces the
  // user to /flags (losing the original URL).
  bootstrapping: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.getUser());
  // Bootstrapping window: a stored token exists but the user object
  // hasn't been hydrated yet. Without this gate, ProtectedRoute sees
  // isAuthenticated=false on first paint and bounces to /login.
  const [bootstrapping, setBootstrapping] = useState<boolean>(
    () => auth.isAuthenticated() && auth.getUser() === null,
  );

  useEffect(() => {
    if (!auth.isAuthenticated() || user) {
      setBootstrapping(false);
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
        /* swallow */
      } finally {
        setBootstrapping(false);
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
    () => ({
      user,
      isAuthenticated: user !== null,
      bootstrapping,
      login,
      logout,
    }),
    [user, bootstrapping, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const ADMIN_ROLES = ["INSTITUTION_ADMIN", "PLATFORM_ADMIN"];

export function isAdmin(role: string | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}
