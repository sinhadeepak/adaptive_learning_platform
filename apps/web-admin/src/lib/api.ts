import { createAuthClient, type AuthClient } from "@alp/auth-client";
import { env } from "./env";

function createSessionExpiredHandler() {
  let notified = false;
  return () => {
    if (notified) return;
    notified = true;
    sessionStorage.setItem("alp.admin.returnTo", window.location.pathname + window.location.search);
    window.location.assign("/login?reason=expired");
  };
}

export const auth: AuthClient = createAuthClient({
  baseUrl: env.apiBaseUrl,
  onSessionExpired: createSessionExpiredHandler(),
});

export interface FlagSummary {
  name: string;
  description: string | null;
  defaultValue: boolean;
  dangerCritical: boolean;
  owner: string | null;
  blastRadius: string | null;
  overrideCount: number;
  updatedAt: string;
}

export interface FlagOverride {
  tenantId: string;
  value: boolean;
  setByUserId: string | null;
  setAt: string;
}

export interface FlagAuditEntry {
  ts: string;
  flagName: string;
  scope: string;
  tenantId: string | null;
  oldValue: boolean | null;
  newValue: boolean | null;
  actorUserId: string | null;
  rationale: string | null;
}

export interface FlagDetail extends FlagSummary {
  overrides: FlagOverride[];
  audit: FlagAuditEntry[];
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { detail?: { message?: string; code?: string } };
      if (body.detail?.message) msg = body.detail.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const flags = {
  async list(): Promise<FlagSummary[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags`);
    return asJson<FlagSummary[]>(res);
  },
  async get(name: string): Promise<FlagDetail> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags/${encodeURIComponent(name)}`);
    return asJson<FlagDetail>(res);
  },
  async setDefault(name: string, value: boolean, rationale?: string): Promise<FlagSummary> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, rationale: rationale ?? null }),
    });
    return asJson<FlagSummary>(res);
  },
  async setOverride(
    name: string,
    tenantId: string,
    value: boolean,
    rationale?: string,
  ): Promise<FlagSummary> {
    const url = `${env.apiBaseUrl}/flags/${encodeURIComponent(name)}/tenants/${encodeURIComponent(tenantId)}`;
    const res = await auth.fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, rationale: rationale ?? null }),
    });
    return asJson<FlagSummary>(res);
  },
};
