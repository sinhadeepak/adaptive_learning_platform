# @alp/auth-client

Shared auth client for ALP web apps (`web-student`, `web-portal`, `web-admin`). JWT access + refresh tokens, SSO redirect helpers, auto-refresh fetch wrapper.

**Not** for the Flutter mobile app — mobile has its own Dart equivalent using `flutter_secure_storage` per SPIKE-05.

## Design decisions

- **Storage**: localStorage for access + refresh by default. Consumers can inject a `TokenStorage` adapter (e.g. in-memory for `web-admin` if security review demands it in Sprint 3+).
- **Refresh**: automatic via a single in-flight Promise — concurrent 401s wait for one refresh. Rotation on refresh.
- **SSO**: Google + Apple via redirect; callback handler parses `?code=...&state=...` and exchanges for tokens.
- **Framework-agnostic**: no React dependency. Consumers wrap into a hook / provider at the app layer.

## Usage

```ts
import { createAuthClient } from "@alp/auth-client";

const auth = createAuthClient({ baseUrl: "/api/v1" });

// Login
const { user } = await auth.login({ email, password });

// Authenticated request — auto-refreshes on 401
const res = await auth.fetch("/profile");

// SSO
window.location.href = auth.ssoUrl("google", { returnTo: "/home" });

// Callback handler — on /auth/callback route
await auth.completeSso(window.location.search);

// Logout
await auth.logout();
```
