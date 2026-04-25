# @alp/api-client

Shared TypeScript API client for the three ALP web apps.

**Two layers**:

1. **Generated types** (`types.generated.ts`) — produced from [openapi/phase1.yaml](../../openapi/phase1.yaml) via `openapi-typescript`. Regenerate with `pnpm generate` whenever the spec changes.
2. **Runtime wrapper** (`client.ts`) — composes with [@alp/auth-client](../auth-client/README.md) for authenticated requests, adds OTEL trace headers, retries idempotent GETs with exponential backoff.

## Usage

```ts
import { createApiClient } from "@alp/api-client";
import { createAuthClient } from "@alp/auth-client";

const auth = createAuthClient({ baseUrl: "/api/v1" });
const api = createApiClient({ baseUrl: "/api/v1", auth });

const exams = await api.get("/catalog/exams");
const { user } = await api.post("/profile", { firstName: "Rahul" });
```

## Regeneration

```
pnpm --filter=@alp/api-client generate
```

Generated file is checked in — diff shows contract changes on every PR.
