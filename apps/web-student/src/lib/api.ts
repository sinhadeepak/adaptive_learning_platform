import { createAuthClient, type AuthClient } from "@alp/auth-client";
import { createApiClient, type ApiClient } from "@alp/api-client";
import { env } from "./env";

function createSessionExpiredHandler() {
  let notified = false;
  return () => {
    if (notified) return;
    notified = true;
    // Storage of the intended return path; /login consumes it.
    sessionStorage.setItem("alp.auth.returnTo", window.location.pathname + window.location.search);
    window.location.assign("/login?reason=expired");
  };
}

export const auth: AuthClient = createAuthClient({
  baseUrl: env.apiBaseUrl,
  onSessionExpired: createSessionExpiredHandler(),
});

export const api: ApiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  auth,
});
