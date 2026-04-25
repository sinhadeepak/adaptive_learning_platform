export interface AuthAdapter {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ApiClientOptions {
  baseUrl: string;
  auth: AuthAdapter;
  retries?: number;
  onError?: (err: ApiError) => void;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  get<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const retries = opts.retries ?? 2;

  async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (body !== undefined) headers.set("content-type", "application/json");
    headers.set("x-trace-id", crypto.randomUUID());

    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= retries) {
      try {
        const res = await opts.auth.fetch(`${opts.baseUrl}${path}`, {
          ...init,
          method,
          headers,
          body: body === undefined ? init?.body : JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => undefined);
          const err = new ApiError(res.statusText, res.status, path, payload);
          opts.onError?.(err);
          if (res.status >= 500 && method === "GET" && attempt < retries) {
            await sleep(backoffMs(attempt));
            attempt++;
            continue;
          }
          throw err;
        }
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (err instanceof ApiError) throw err;
        if (attempt < retries && method === "GET") {
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  return {
    get: (path, init) => request("GET", path, undefined, init),
    post: (path, body, init) => request("POST", path, body, init),
    put: (path, body, init) => request("PUT", path, body, init),
    patch: (path, body, init) => request("PATCH", path, body, init),
    delete: (path, init) => request("DELETE", path, undefined, init),
  };
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 250 * 2 ** attempt) + Math.random() * 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
