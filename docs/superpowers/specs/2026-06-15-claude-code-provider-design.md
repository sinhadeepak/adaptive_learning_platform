# Claude Code CLI Provider — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)
**Author:** Deepak Sinha (with Claude)

## 1. Summary

Add a new AI provider **kind** — `claude_code` — to the admin-managed AI
provider chain. Unlike the existing `ollama` / `openai` / `anthropic`
providers, which make network calls (httpx / official SDKs), the Claude
Code provider **spawns the local `claude -p` CLI** (Claude Code headless
"print" mode) as a subprocess and returns its output.

The motivation is to use a **Claude subscription (Pro/Max) login** instead
of per-token API billing, so the platform can make many model calls
("run multiple different calls to claude") against subscription quota.

It plugs into the existing provider abstraction with **no changes to the
routing/orchestration layer** — `fallback.py` and the Phase-5
`admin_chain` façade are provider-agnostic and walk DB rows by priority.

## 2. Goals / Non-Goals

### Goals
- New provider kind `claude_code`, selectable in the admin AI Providers UI
  ([apps/web-admin/src/pages/AIProviders.tsx](../../../apps/web-admin/src/pages/AIProviders.tsx)).
- Implements the full `AIProvider` interface
  (`call_structured`, `stream_chat`, `health_check`) by shelling out to
  `claude -p`.
- Participates in the priority-ordered fallback chain exactly like other
  providers (enable/disable, reorder, Test button).
- Subscription auth via the CLI's own login state (`~/.claude`), persisted
  in a Docker volume so it survives container restarts.
- Available in all environments (local, staging, prod) — operator logs in
  inside the container once.

### Non-Goals
- No API-key field for this kind (auth is the CLI's logged-in session).
- No true token streaming in v1 — `stream_chat` yields the full result
  once (the print CLI returns a final result, not incremental deltas in
  the simple path).
- No tool/agent/file-access use — the CLI is run as a pure text generator
  (tools disabled).
- No changes to `config/ai_routing.yaml` semantics — Claude Code is just
  another row in the admin chain reached via `admin_chain`.

## 3. Architecture

### 3.1 Where it fits

```
touchpoint code
  └─ ai_gateway (Phase 5)  -- routes "admin_chain" --> AdminChainProvider
       └─ ai_providers.fallback.call_structured()      [UNCHANGED]
            └─ _build_chain() -> [providers by priority]
                 └─ from_config(row) -> ClaudeCodeProvider   [NEW BRANCH]
                      └─ asyncio.create_subprocess_exec("claude", ...)  [NEW]
```

Only two code touch points change in the dispatch path:
1. `from_config()` in
   [base.py](../../../services/learning/src/learning/ai_providers/providers/base.py)
   gains a `claude_code` branch.
2. A new provider class `ClaudeCodeProvider`.

Everything else (chain building, fallback loop, Test endpoint, gateway
façade) already handles arbitrary providers.

### 3.2 New component: `ClaudeCodeProvider`

File: `services/learning/src/learning/ai_providers/providers/claude_code.py`

```python
class ClaudeCodeProvider(AIProvider):
    kind = "claude_code"
    display_name = "Claude Code (CLI)"
```

Construction (from `from_config`): only `model` and `extra` are relevant —
no `api_key`, no `base_url` (network base URL is meaningless for a CLI).
`model` maps to the CLI `--model` flag (accepts aliases `sonnet` / `opus`
/ `haiku` or full ids like `claude-haiku-4-5-20251001`).

#### Subprocess invocation (shared helper `_run`)

```
claude -p \
  --output-format json \
  --model <model> \
  --allowedTools "" \
  --mcp-config '{}' --strict-mcp-config \
  --permission-mode <safe-default>
# prompt delivered on STDIN (never argv); shell=False
```

- **stdin** carries the full prompt → no command-injection surface, no
  `ARG_MAX` limit on large prompts.
- **`--allowedTools ""` + empty strict MCP** → the model can't read/write
  files, run bash, or load project MCP servers; it's a pure text call and
  cannot hang waiting on a permission prompt.
- Spawned with `asyncio.create_subprocess_exec` in its own process group;
  on timeout the whole group is killed (`SIGKILL`).
- Wrapped in a module-level `asyncio.Semaphore` (default 4, configurable
  via `extra.max_concurrency`) to bound the number of live `claude`
  processes.
- Per-call timeout from `self.timeout_s` (default 120s; overridable via
  `extra.timeout_s`).

#### Output parsing

`--output-format json` yields an envelope like:

```json
{ "type": "result", "subtype": "success",
  "result": "<assistant text>", "is_error": false,
  "total_cost_usd": 0.0, "usage": { ... }, "session_id": "..." }
```

- We read `.result` as the model's text. `is_error: true` or non-zero exit
  → treat as failure (return `None` / empty stream), logged but never
  raised (matches the contract in base.py).
- `total_cost_usd` / `usage` are captured in logs for a future AI-cost
  dashboard tie-in (out of scope to wire up here).

#### `call_structured`

Anthropic's API uses a tool-call trick for strict JSON; the CLI has no
equivalent, so we use **prompt-instructed JSON**:

1. Build a prompt = `system` + `user` + an appended instruction:
   *"Respond with ONLY a single JSON object that validates against this
   JSON Schema. No prose, no code fences. Schema: <schema>."*
2. Run the CLI, take `.result`.
3. Extract the JSON object (strip ``` fences / leading prose if present;
   parse the first balanced `{...}`); `json.loads`.
4. Return the dict, or `None` if parsing fails (caller falls through to
   the next provider in the chain — graceful degradation).

#### `stream_chat`

v1: run the same `_run` (assembling `system` + messages into one prompt),
then `yield` the whole `.result` string once. Empty generator on failure.
(A later iteration can switch to `--output-format stream-json --verbose`
for incremental deltas.)

#### `health_check`

1. Confirm CLI presence/PATH with `claude --version` (cheap, no quota).
2. If present, a minimal `claude -p` "ping" with the configured model to
   confirm login + model validity, short timeout.
3. Return `HealthStatus(ok, message, latency_ms)`:
   - CLI missing → `ok=False, "claude CLI not found on PATH"`.
   - Not logged in (auth error in output) → `ok=False, "not logged in —
     run `claude login` inside the container"`.
   - Success → `ok=True, "Reachable. CLI + login + model work."`.

### 3.3 Persistence / schema

Table `content_schema.ai_provider_config` already has every field we need.
A new migration widens the CHECK constraint:

```
-- new migration in services/learning/alembic/content/versions/
ALTER TABLE content_schema.ai_provider_config
  DROP CONSTRAINT <existing kind check>,
  ADD CONSTRAINT ai_provider_config_kind_check
    CHECK (kind IN ('ollama','openai','anthropic','claude_code'));
```

A `claude_code` row stores: `kind='claude_code'`, `display_name`,
`model` (alias or full id), `enabled`, `priority`,
`base_url = NULL`, `api_key_encrypted = NULL`, `api_key_last4 = NULL`,
and optional `extra` (`{ "max_concurrency": 4, "timeout_s": 120,
"permission_mode": "default" }`).

Optionally seed one disabled `claude_code` row in the migration so it
appears in the UI out of the box (disabled, priority just above/below
Anthropic). **Decision: yes — seed it disabled** so admins discover it.

### 3.4 API routes

[routes.py](../../../services/learning/src/learning/ai_providers/routes.py)
already exposes list/create/update/delete/test/reorder. The only change:
the `kind` `Literal` widens to include `"claude_code"`. Create/update for
this kind simply leaves key/base_url null; no new endpoint needed.

### 3.5 Admin UI

[AIProviders.tsx](../../../apps/web-admin/src/pages/AIProviders.tsx):
- Widen `type Kind` to include `"claude_code"`.
- Render a `claude_code` card with a **model-only** row (no Base URL, no
  API key) — like the Ollama layout minus the base URL, plus a short
  helper line: *"Runs the local `claude` CLI using its logged-in
  subscription. No API key — authenticate with `claude login` inside the
  container."*
- Keep Enabled toggle, priority up/down, Save, and Test.

### 3.6 Image & runtime (deployment)

- **Dockerfile** for `alp/learning`: install Node.js LTS and
  `npm i -g @anthropic-ai/claude-code` so `claude` is on PATH.
- **docker-compose**: mount a named volume at the learning container's
  home `~/.claude` (e.g. `/root/.claude`) so a one-time
  `docker exec -it alp-local-learning-1 claude login` persists across
  restarts. Document the same pattern for staging/prod.
- Set `HOME` appropriately if the service runs as non-root.

## 4. Error Handling

| Failure | Behavior |
|---|---|
| `claude` not on PATH | `call_*` → None / empty; `health_check` ok=False with clear message |
| Not logged in / auth error | same as above; message tells operator to `claude login` |
| Subprocess timeout | process group killed; return None; logged `provider.claude_code.timeout` |
| Non-zero exit / `is_error` | return None; stderr tail logged (truncated) |
| Unparseable JSON (structured) | return None → chain falls through to next provider |
| Concurrency cap reached | call waits on semaphore (bounded by timeout) |

All failures return `None` / empty generator — never raise out of the
provider, per the base contract, so one bad provider can't break the chain.

## 5. Security

- `shell=False`, prompt via **stdin**, args as a fixed list → no shell
  injection even with adversarial prompt content.
- Tools/MCP disabled → the subprocess cannot read/write the repo,
  exfiltrate files, or execute commands; it only generates text.
- Subscription credentials live only in the mounted `~/.claude` volume,
  never in the DB and never returned to the browser.
- Operator-only: provider CRUD is already admin-gated (`_require_admin`).

## 6. Testing

Mirror existing provider tests; subprocess is mocked (no real CLI in CI):
- `from_config({kind:"claude_code", model:"sonnet"})` returns a
  `ClaudeCodeProvider` (no key/base_url needed).
- `call_structured` parses a mocked JSON envelope → dict; malformed
  `result` → `None`; `is_error` envelope → `None`.
- `stream_chat` yields the full result once; failure → empty.
- `health_check`: CLI-missing path, not-logged-in path, success path
  (all via a patched `_run`/`asyncio.create_subprocess_exec`).
- Migration: CHECK constraint accepts `claude_code`, rejects junk; the
  seeded disabled row exists; downgrade removes it / restores constraint.
- A chain test: `claude_code` enabled at top priority is tried first and,
  on its failure, the loop falls through to the next provider.
- Widen/adjust any existing test that asserts the exact set of provider
  kinds.

## 7. Open Questions / Future Work

- True streaming via `--output-format stream-json` (v2).
- Surface `total_cost_usd`/`usage` into the AI Cost dashboard.
- Optional: a settings-driven hard guard to disable `claude_code` per
  environment if subscription-on-server policy changes.

## 8. Build Sequence (high level)

1. Backend: new migration (CHECK + seeded disabled row).
2. Backend: `ClaudeCodeProvider` + `from_config` branch.
3. Backend: widen `kind` Literal in routes; unit tests.
4. Image: Dockerfile (node + CLI) and compose volume for `~/.claude`.
5. Frontend: widen `Kind`, add the model-only card + helper text.
6. Verify end-to-end: build image, `claude login` in container, Test
   button green, run a touchpoint through the chain.
