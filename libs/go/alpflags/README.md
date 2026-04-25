# alpflags — Go feature-flag SDK

Counterpart of [libs/python/alp_flags](../../python/alp_flags/). Implements [ADR-0001](../../../docs/adr/0001-feature-flag-platform.md) FS-04 client-side for Go services (Quiz today; any future Go service later).

## Behaviour

1. **Lookup order**: local TTL cache → Institution `GET /flags/:name` → hardcoded fallback (mandatory at construction; missing fallback returns an error).
2. **Tenant resolution**: per-tenant override beats global default when `tenantID != ""`.
3. **Cache invalidation**: subscribes to NATS subject `flag.changed`; the matching cache entry is dropped on every event. NATS unreachable → SDK falls through to TTL polling.

## Usage

```go
import "github.com/adaptive-learn/alpflags"

flags := alpflags.New(alpflags.Options{
    InstitutionURL: "http://institution:8000",
    NatsURL:        "nats://nats:4222",
    Fallbacks: map[string]bool{
        "irt_model_enabled":  false,
        "checkout_enabled":   false,
    },
})
if err := flags.Connect(ctx); err != nil {
    return err
}
defer flags.Close()

useIRT, err := flags.Evaluate(ctx, "irt_model_enabled", tenantID)
```

## Behaviour parity with Python SDK

| Feature | Python `alp_flags` | Go `alpflags` |
|---|---|---|
| Cache key | `(name, tenant\|None)` | `cacheKey{flag, tenant}` |
| TTL default | 30 s | 30 s |
| HTTP timeout | 1.5 s | 1.5 s |
| NATS subject | `flag.changed` | `flag.changed` |
| Missing fallback | `KeyError` | `error` |
| HTTP failure | fallback + WARN log | fallback + WARN slog |
| Stops when NATS down | yes (poll only) | yes (poll only) |

The two SDKs read the same Institution payload shape and the same NATS event payload shape, so a flag flip in `web-admin` propagates to every consumer regardless of language.
