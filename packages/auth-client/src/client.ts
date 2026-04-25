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
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getUser(): User | null;
  getTokens(): Tokens | null;
  isAuthenticated(): boolean;
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
  }

  async function refresh(): Promise<Tokens> {
    if (refreshInFlight) return refreshInFlight;
    const existing = storage.get();
    if (!existing) throw new AuthError("No refresh token", "refresh_failed");
    refreshInFlight = (async () => {
      try {
        const tokens = await post<Tokens>("/auth/refresh", { refreshToken: existing.refreshToken });
        storage.set(tokens);
        return tokens;
      } catch (err) {
        storage.clear();
        currentUser = null;
        opts.onSessionExpired?.();
        throw err instanceof AuthError ? err : new AuthError(String(err), "refresh_failed");
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
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
      if (t) await post("/auth/logout", { refreshToken: t.refreshToken }).catch(() => undefined);
      storage.clear();
      currentUser = null;
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
    getUser: () => currentUser,
    getTokens: () => storage.get(),
    isAuthenticated: () => storage.get() !== null,
  };
}
