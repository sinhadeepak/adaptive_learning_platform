import { AuthError, type LoginRequest, type RegisterRequest, type Session, type SsoProvider, type Tokens, type User } from "./types";
import { localStorageTokenStorage, type TokenStorage } from "./storage";

export interface AuthClientOptions {
  baseUrl: string;
  storage?: TokenStorage;
  onSessionExpired?: () => void;
}

export interface AuthClient {
  login(req: LoginRequest): Promise<Session>;
  register(req: RegisterRequest): Promise<{ userId: string; otpChannel: "email" | "sms" }>;
  verifyOtp(userId: string, code: string, channel: "email" | "sms"): Promise<Session>;
  logout(): Promise<void>;
  ssoUrl(provider: SsoProvider, params?: { returnTo?: string }): string;
  completeSso(search: string): Promise<Session>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /**
   * Silently restore a session on page load from the HttpOnly refresh cookie.
   * Resolves `true` if an access token was minted, `false` if the visitor is
   * simply logged out. Unlike the internal 401-triggered refresh, a failure
   * here does NOT fire `onSessionExpired` — it's the expected anonymous case.
   */
  restore(): Promise<boolean>;
  getUser(): User | null;
  // Set by the auth provider after rehydrating user state from /profile/me.
  // Without this, `getUser()` returns null after a page refresh because
  // `currentUser` is only populated by login()/verifyOtp() — anything that
  // depends on getUser() (e.g. X-User-Id header propagation) fails silently.
  setUser(user: User | null): void;
  getTokens(): Tokens | null;
  isAuthenticated(): boolean;
  /**
   * Whether a returning session likely exists — a non-sensitive boolean flag
   * (NOT a token) persisted alongside the HttpOnly refresh cookie. Lets the UI
   * skip the silent-restore round-trip for anonymous visitors while still
   * attempting it for users who were previously signed in. Leaking this flag
   * reveals nothing exploitable.
   */
  hasPersistedSession(): boolean;
}

const PRESENCE_KEY = "alp.auth.present";

function markPresent(present: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (present) localStorage.setItem(PRESENCE_KEY, "1");
    else localStorage.removeItem(PRESENCE_KEY);
  } catch {
    /* storage unavailable (private mode / SSR) — ignore */
  }
}

function readPresent(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(PRESENCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function createAuthClient(opts: AuthClientOptions): AuthClient {
  const storage = opts.storage ?? localStorageTokenStorage;
  let currentUser: User | null = null;
  let refreshInFlight: Promise<Tokens> | null = null;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${opts.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Send + receive the HttpOnly refresh cookie on auth endpoints.
      credentials: "include",
    });
    if (!res.ok) throw await toAuthError(res);
    return (await res.json()) as T;
  }

  async function toAuthError(res: Response): Promise<AuthError> {
    let code: AuthError["code"] = "unknown";
    if (res.status === 401) code = "invalid_credentials";
    else if (res.status === 423) code = "locked";
    else if (res.status === 429) code = "rate_limited";
    const msg = await res.text().catch(() => res.statusText);
    return new AuthError(msg || res.statusText, code, res.status);
  }

  function setSession(session: Session) {
    storage.set(session.tokens);
    currentUser = session.user;
    markPresent(true);
  }

  async function refresh(): Promise<Tokens> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        // The refresh token normally rides in the HttpOnly cookie; only send a
        // body for legacy clients that still hold it in JS-readable storage.
        const existing = storage.get();
        const body = existing?.refreshToken ? { refreshToken: existing.refreshToken } : {};
        const tokens = await post<Tokens>("/auth/refresh", body);
        storage.set(tokens);
        markPresent(true);
        return tokens;
      } catch (err) {
        storage.clear();
        currentUser = null;
        markPresent(false);
        opts.onSessionExpired?.();
        throw err instanceof AuthError ? err : new AuthError(String(err), "refresh_failed");
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function restore(): Promise<boolean> {
    if (storage.get()) return true;
    try {
      const tokens = await post<Tokens>("/auth/refresh", {});
      storage.set(tokens);
      markPresent(true);
      return true;
    } catch {
      // 401 = not logged in. Stay quiet — do not fire onSessionExpired.
      markPresent(false);
      return false;
    }
  }

  return {
    async login(req) {
      const session = await post<Session>("/auth/login", req);
      setSession(session);
      return session;
    },
    async register(req) {
      return await post<{ userId: string; otpChannel: "email" | "sms" }>("/auth/register", req);
    },
    async verifyOtp(userId, code, channel) {
      const session = await post<Session>("/auth/otp/verify", { userId, code, channel });
      setSession(session);
      return session;
    },
    async logout() {
      const t = storage.get();
      // Body is legacy; the server also reads + clears the HttpOnly cookie.
      await post("/auth/logout", t ? { refreshToken: t.refreshToken } : {}).catch(() => undefined);
      storage.clear();
      currentUser = null;
      markPresent(false);
    },
    async forgotPassword(email) {
      // Auth returns 204 regardless of whether the email exists (enumeration-safe).
      // Network/server errors still surface to the caller so they can retry.
      const res = await fetch(`${opts.baseUrl}/auth/password/forgot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 204) throw await toAuthError(res);
    },
    async resetPassword(token, newPassword) {
      const res = await fetch(`${opts.baseUrl}/auth/password/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        // 410 = token expired/used; 400 = invalid (e.g. weak password).
        let code: AuthError["code"] = "unknown";
        if (res.status === 410) code = "reset_token_invalid";
        else if (res.status === 400) code = "weak_password";
        const msg = await res.text().catch(() => res.statusText);
        throw new AuthError(msg || res.statusText, code, res.status);
      }
    },
    ssoUrl(provider, params) {
      const u = new URL(`${opts.baseUrl}/auth/oauth/${provider}/url`, window.location.origin);
      if (params?.returnTo) u.searchParams.set("returnTo", params.returnTo);
      return u.toString();
    },
    async completeSso(search) {
      const qs = new URLSearchParams(search);
      const session = await post<Session>("/auth/oauth/callback", {
        code: qs.get("code"),
        state: qs.get("state"),
      });
      setSession(session);
      return session;
    },
    async fetch(input, init) {
      const headers = new Headers(init?.headers);
      const tokens = storage.get();
      if (tokens) headers.set("authorization", `Bearer ${tokens.accessToken}`);
      let res = await fetch(input, { ...init, headers });
      if (res.status === 401 && tokens) {
        const fresh = await refresh();
        headers.set("authorization", `Bearer ${fresh.accessToken}`);
        res = await fetch(input, { ...init, headers });
      }
      return res;
    },
    restore,
    hasPersistedSession: readPresent,
    getUser: () => currentUser,
    setUser: (u) => {
      currentUser = u;
    },
    getTokens: () => storage.get(),
    isAuthenticated: () => storage.get() !== null,
  };
}
