# alp-flags — Python feature-flag SDK

Implements [ADR-0001](../../../docs/adr/0001-feature-flag-platform.md) FS-04 client side: every Python service uses this SDK to evaluate flags. The library is **framework-agnostic**; consumers wrap it in their FastAPI app or worker process.

## Behaviour

1. **Lookup order** (per `evaluate(name, tenant_id=...)`):
   1. Local in-memory cache (TTL configurable, default 30 s)
   2. HTTP fetch from Institution `GET /flags/:name` (with timeout)
   3. Hardcoded fallback constant (mandatory — passed at construction)
2. **Tenant resolution**: if `tenant_id` is given AND the flag has a matching override, the override wins; otherwise the global default.
3. **Cache invalidation**: SDK subscribes to NATS subject `flag.changed`. On every event, the matching cache entry is dropped — next `evaluate()` re-fetches.
4. **Failure modes**:
   - Institution unreachable → log WARN and fall back to hardcoded constant.
   - NATS unreachable → SDK still works in poll-only mode (relies on TTL).

## Usage

```python
from alp_flags import FlagClient

flags = FlagClient(
    institution_url="http://institution:8000",
    nats_url="nats://nats:4222",
    fallbacks={
        "email_channel_enabled": True,
        "irt_model_enabled": False,
    },
)
await flags.connect()

if await flags.evaluate("email_channel_enabled"):
    await send_email(...)

# Per-tenant evaluation:
if await flags.evaluate("assignments_enabled", tenant_id="t-001"):
    ...

await flags.close()
```
