# Claude Code CLI Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `claude_code` AI provider kind that fulfils model calls by spawning the local `claude -p` CLI (subscription auth), wired into the existing admin provider chain.

**Architecture:** A new `ClaudeCodeProvider` implements the `AIProvider` interface by running `claude -p --output-format json` as a sandboxed subprocess (tools/MCP disabled, prompt via stdin, semaphore-bounded, timeout-killed). It is selected by a new branch in `from_config`. The routing/orchestration layer (`fallback.py`) is unchanged — it walks DB rows by priority. A migration widens the `kind` CHECK constraint and seeds one disabled row; the admin UI gains a model-only card; the shared Python Dockerfile installs the CLI for the `learning` service only.

**Tech Stack:** Python 3.11 / FastAPI / asyncio subprocess, SQLAlchemy + Alembic (Postgres `content_schema`), React + TypeScript (web-admin), Docker (shared `Dockerfile.python`), Node.js + `@anthropic-ai/claude-code` CLI.

---

## Reference: existing code this mirrors

- Provider interface + factory: `services/learning/src/learning/ai_providers/providers/base.py`
- Sibling provider (Anthropic, for shape): `services/learning/src/learning/ai_providers/providers/anthropic.py:22-110`
- Orchestrator (UNCHANGED): `services/learning/src/learning/ai_providers/fallback.py:24-137`
- Routes + Pydantic `Literal`s: `services/learning/src/learning/ai_providers/routes.py:46-69`
- Original table + seed migration: `services/learning/alembic/content/versions/036_ai_provider_config.py`
- Admin UI page: `apps/web-admin/src/pages/AIProviders.tsx`
- Shared Docker build: `infrastructure/docker/Dockerfile.python`; compose: `infrastructure/docker/docker-compose.yml:8-10,179-185`

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `services/learning/alembic/content/versions/042_claude_code_provider_kind.py` | Create | Widen `kind` CHECK to add `claude_code`; seed one disabled row; reversible downgrade |
| `services/learning/src/learning/ai_providers/providers/claude_code.py` | Create | `ClaudeCodeProvider` + subprocess helpers |
| `services/learning/src/learning/ai_providers/providers/base.py` | Modify (`from_config`, ~line 130) | Add `claude_code` branch |
| `services/learning/src/learning/ai_providers/routes.py` | Modify (lines 48, 62) | Widen `kind` `Literal` to include `claude_code` |
| `services/learning/tests/ai_providers/test_claude_code_provider.py` | Create | Unit tests (subprocess mocked) |
| `apps/web-admin/src/pages/AIProviders.tsx` | Modify (lines 21, ~280-333) | Widen `Kind`; render model-only card + helper text |
| `infrastructure/docker/Dockerfile.python` | Modify (runtime stage) | ARG-gated install of Node + claude CLI |
| `infrastructure/docker/docker-compose.yml` | Modify (learning service ~179-185) | Pass build arg; mount `~/.claude` volume |

---

## Task 1: Migration — widen `kind` CHECK + seed disabled row

**Files:**
- Create: `services/learning/alembic/content/versions/042_claude_code_provider_kind.py`

Postgres auto-names the inline CHECK from migration 036 `ai_provider_config_kind_check` (pattern `<table>_<column>_check`). We drop it and add a named, widened one.

- [ ] **Step 1: Write the migration**

```python
"""Add 'claude_code' provider kind.

Widens the ai_provider_config.kind CHECK constraint to allow a fourth
provider that fulfils calls via the local `claude -p` CLI (subscription
auth) instead of an HTTP API. Seeds one disabled row so it appears in
the admin AI Providers UI out of the box.

Revision ID: 042
Revises: 041
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "042"
down_revision: str | None = "041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    # Inline CHECK from migration 036 is auto-named <table>_<column>_check.
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"DROP CONSTRAINT IF EXISTS ai_provider_config_kind_check"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"ADD CONSTRAINT ai_provider_config_kind_check "
        f"CHECK (kind IN ('ollama', 'openai', 'anthropic', 'claude_code'))"
    )
    # Seed one disabled row. No key/base_url — CLI uses subscription login.
    # Priority 25 sits between OpenAI (20) and Anthropic (30) from migration 036.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.ai_provider_config
            (kind, display_name, enabled, priority, base_url, model,
             api_key_encrypted, api_key_last4, extra)
        VALUES
            ('claude_code', 'Claude Code (CLI)', FALSE, 25, NULL,
             'sonnet', NULL, NULL, '{{}}'::jsonb)
        ON CONFLICT (kind, model) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        f"DELETE FROM {SCHEMA}.ai_provider_config WHERE kind = 'claude_code'"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"DROP CONSTRAINT IF EXISTS ai_provider_config_kind_check"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"ADD CONSTRAINT ai_provider_config_kind_check "
        f"CHECK (kind IN ('ollama', 'openai', 'anthropic'))"
    )
```

- [ ] **Step 2: Apply to the local + test DBs and verify**

Run:
```bash
docker cp services/learning/alembic/content/versions/042_claude_code_provider_kind.py \
  alp-local-learning-1:/repo/services/learning/alembic/content/versions/042_claude_code_provider_kind.py
docker exec alp-local-learning-1 sh -c \
  "cd /repo/services/learning && alembic -c alembic_content.ini upgrade head"
make test-db
```
Expected: `Running upgrade 041 -> 042` in both; no errors.

- [ ] **Step 3: Verify the constraint + seed row**

Run:
```bash
docker exec alp-local-postgres-1 psql "postgresql://postgres:postgres@localhost:5432/learning" -P pager=off -c \
  "SELECT kind, display_name, enabled, priority FROM content_schema.ai_provider_config WHERE kind='claude_code';"
```
Expected: one row `claude_code | Claude Code (CLI) | f | 25`.

- [ ] **Step 4: Commit**

```bash
git add services/learning/alembic/content/versions/042_claude_code_provider_kind.py
git commit -m "feat(ai-providers): migration for claude_code kind + seeded row"
```

---

## Task 2: `ClaudeCodeProvider` (TDD, subprocess mocked)

**Files:**
- Create: `services/learning/tests/ai_providers/test_claude_code_provider.py`
- Create: `services/learning/src/learning/ai_providers/providers/claude_code.py`

- [ ] **Step 1: Write the failing tests**

Create `services/learning/tests/ai_providers/test_claude_code_provider.py`:

```python
"""Unit tests for ClaudeCodeProvider — the `claude` subprocess is mocked,
so these run in CI without the CLI installed."""

from __future__ import annotations

import json

import pytest

from learning.ai_providers.providers import claude_code as cc
from learning.ai_providers.providers.claude_code import ClaudeCodeProvider


class _FakeProc:
    def __init__(self, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self.pid = 4242

    async def communicate(self, input: bytes | None = None):  # noqa: A002
        return self._stdout, self._stderr


def _patch_cli(monkeypatch, *, proc: _FakeProc | None, which: str | None = "/usr/bin/claude"):
    monkeypatch.setattr(cc.shutil, "which", lambda _name: which)

    async def _fake_exec(*_args, **_kwargs):
        assert proc is not None
        return proc

    monkeypatch.setattr(cc.asyncio, "create_subprocess_exec", _fake_exec)


def _envelope(result: str, *, is_error: bool = False) -> bytes:
    return json.dumps(
        {"type": "result", "subtype": "success", "is_error": is_error, "result": result}
    ).encode()


@pytest.mark.asyncio
async def test_call_structured_parses_plain_json(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope('{"answer": 42}')))
    p = ClaudeCodeProvider(model="sonnet")
    out = await p.call_structured(system="sys", user="q", schema_name="S", schema={})
    assert out == {"answer": 42}


@pytest.mark.asyncio
async def test_call_structured_strips_code_fences(monkeypatch):
    fenced = "```json\n{\"a\": 1}\n```"
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope(fenced)))
    p = ClaudeCodeProvider(model="sonnet")
    out = await p.call_structured(system="", user="q", schema_name="S", schema={})
    assert out == {"a": 1}


@pytest.mark.asyncio
async def test_call_structured_returns_none_on_garbage(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope("no json here")))
    p = ClaudeCodeProvider(model="sonnet")
    assert await p.call_structured(system="", user="q", schema_name="S", schema={}) is None


@pytest.mark.asyncio
async def test_call_structured_returns_none_on_error_envelope(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope("{}", is_error=True)))
    p = ClaudeCodeProvider(model="sonnet")
    assert await p.call_structured(system="", user="q", schema_name="S", schema={}) is None


@pytest.mark.asyncio
async def test_call_structured_returns_none_on_nonzero_exit(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=b"", stderr=b"boom", returncode=1))
    p = ClaudeCodeProvider(model="sonnet")
    assert await p.call_structured(system="", user="q", schema_name="S", schema={}) is None


@pytest.mark.asyncio
async def test_stream_chat_yields_result_once(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope("hello world")))
    p = ClaudeCodeProvider(model="sonnet")
    chunks = [c async for c in p.stream_chat(system="s", messages=[{"role": "user", "content": "hi"}])]
    assert chunks == ["hello world"]


@pytest.mark.asyncio
async def test_health_check_ok(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope("ok")))
    p = ClaudeCodeProvider(model="sonnet")
    status = await p.health_check()
    assert status.ok is True


@pytest.mark.asyncio
async def test_health_check_cli_missing(monkeypatch):
    _patch_cli(monkeypatch, proc=None, which=None)
    p = ClaudeCodeProvider(model="sonnet")
    status = await p.health_check()
    assert status.ok is False
    assert "not found" in status.message.lower()


@pytest.mark.asyncio
async def test_health_check_not_logged_in(monkeypatch):
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=b"", stderr=b"not authenticated", returncode=1))
    p = ClaudeCodeProvider(model="sonnet")
    status = await p.health_check()
    assert status.ok is False
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd services/learning && uv run pytest tests/ai_providers/test_claude_code_provider.py -q
```
Expected: FAIL — `ModuleNotFoundError: ... providers.claude_code`.

- [ ] **Step 3: Implement the provider**

Create `services/learning/src/learning/ai_providers/providers/claude_code.py`:

```python
"""Claude Code provider — fulfils calls by spawning the local `claude -p`
CLI (Claude Code headless mode) using its logged-in subscription, rather
than an HTTP API.

The CLI is run as a *pure text generator*: tools and MCP are disabled, the
prompt is piped on stdin (never argv, so prompt content can't inject shell
args), and the process runs in its own group so a timeout kills it cleanly.
Every failure path returns None / an empty stream — never raises — per the
AIProvider contract, so a missing/broken CLI just falls through to the next
provider in the chain.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import signal
import time
from collections.abc import AsyncIterator
from typing import Any

from learning.ai_providers.providers.base import AIProvider, HealthStatus

log = logging.getLogger(__name__)

# Bound concurrent `claude` processes across the service. Created lazily
# inside the running loop on first use.
_MAX_CONCURRENCY = 4
_sema: asyncio.Semaphore | None = None


def _get_sema() -> asyncio.Semaphore:
    global _sema
    if _sema is None:
        _sema = asyncio.Semaphore(_MAX_CONCURRENCY)
    return _sema


def _kill(proc: asyncio.subprocess.Process) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:  # noqa: BLE001
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


def _extract_json(text: str) -> dict[str, Any] | None:
    """Pull the first balanced JSON object out of model text, tolerating
    surrounding prose or ```code fences```."""
    s = text.strip()
    start = s.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(s[start : i + 1])
                except json.JSONDecodeError:
                    return None
                return obj if isinstance(obj, dict) else None
    return None


class ClaudeCodeProvider(AIProvider):
    kind = "claude_code"
    display_name = "Claude Code (CLI)"

    async def _run(self, prompt: str) -> str | None:
        """Run `claude -p` with the prompt on stdin; return the model's
        text (`.result` from the JSON envelope) or None on any failure."""
        claude = shutil.which("claude")
        if claude is None:
            log.warning("provider.claude_code.cli_missing")
            return None
        args = [
            claude,
            "-p",
            "--output-format", "json",
            "--model", self.model,
            "--allowedTools", "",          # no tools — pure text generation
            "--mcp-config", "{}",          # load no MCP servers
            "--strict-mcp-config",
        ]
        async with _get_sema():
            try:
                proc = await asyncio.create_subprocess_exec(
                    *args,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    start_new_session=True,  # own process group for clean kill
                )
            except Exception as e:  # noqa: BLE001
                log.warning("provider.claude_code.spawn_failed", extra={"err": str(e)[:200]})
                return None
            try:
                out, err = await asyncio.wait_for(
                    proc.communicate(input=prompt.encode()),
                    timeout=self.timeout_s,
                )
            except asyncio.TimeoutError:
                _kill(proc)
                log.warning("provider.claude_code.timeout", extra={"model": self.model})
                return None

        if proc.returncode != 0:
            log.warning(
                "provider.claude_code.nonzero_exit",
                extra={"code": proc.returncode, "stderr": err.decode(errors="replace")[:200]},
            )
            return None
        try:
            envelope = json.loads(out.decode(errors="replace"))
        except json.JSONDecodeError:
            log.warning("provider.claude_code.bad_envelope")
            return None
        if envelope.get("is_error"):
            log.warning("provider.claude_code.result_error", extra={"subtype": envelope.get("subtype")})
            return None
        result = envelope.get("result")
        return result if isinstance(result, str) else None

    async def call_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
    ) -> dict[str, Any] | None:
        instruction = (
            "Respond with ONLY a single JSON object that validates against this "
            "JSON Schema. No prose, no markdown, no code fences.\n"
            f"Schema ({schema_name}):\n{json.dumps(schema)}"
        )
        prompt = f"{system}\n\n{user}\n\n{instruction}" if system else f"{user}\n\n{instruction}"
        raw = await self._run(prompt)
        if not raw:
            return None
        return _extract_json(raw)

    async def stream_chat(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        parts: list[str] = []
        if system:
            parts.append(system)
        for m in messages:
            parts.append(f"{m.get('role', 'user')}: {m.get('content', '')}")
        raw = await self._run("\n\n".join(parts))
        if raw:
            yield raw

    async def health_check(self) -> HealthStatus:
        if shutil.which("claude") is None:
            return HealthStatus(ok=False, message="claude CLI not found on PATH")
        t0 = time.monotonic()
        raw = await self._run("Reply with the single word: ok")
        if raw is None:
            return HealthStatus(
                ok=False,
                message="claude CLI call failed — not logged in? run `claude login` in the container",
            )
        return HealthStatus(
            ok=True,
            message="Reachable. CLI + login + model work.",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
```

- [ ] **Step 4: Create the tests package init if missing**

Run:
```bash
ls services/learning/tests/ai_providers/__init__.py 2>/dev/null || \
  : > services/learning/tests/ai_providers/__init__.py
```
(Only create the empty `__init__.py` if the directory's sibling test packages use them; check an existing one, e.g. `services/learning/tests/catalog/`. If catalog has no `__init__.py`, skip this step.)

- [ ] **Step 5: Run tests — verify they pass**

Run:
```bash
cd services/learning && uv run pytest tests/ai_providers/test_claude_code_provider.py -q
```
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add services/learning/src/learning/ai_providers/providers/claude_code.py \
        services/learning/tests/ai_providers/
git commit -m "feat(ai-providers): ClaudeCodeProvider via claude CLI subprocess"
```

---

## Task 3: Wire `from_config` branch + widen route `Literal`s

**Files:**
- Modify: `services/learning/src/learning/ai_providers/providers/base.py:127-129`
- Modify: `services/learning/src/learning/ai_providers/routes.py:48,62`
- Test: `services/learning/tests/ai_providers/test_claude_code_provider.py` (extend)

- [ ] **Step 1: Write the failing test for `from_config`**

Append to `tests/ai_providers/test_claude_code_provider.py`:

```python
def test_from_config_builds_claude_code():
    from learning.ai_providers.providers import from_config

    p = from_config({"kind": "claude_code", "model": "sonnet"})
    assert isinstance(p, ClaudeCodeProvider)
    assert p.model == "sonnet"
```

- [ ] **Step 2: Run it — verify it fails**

Run:
```bash
cd services/learning && uv run pytest tests/ai_providers/test_claude_code_provider.py::test_from_config_builds_claude_code -q
```
Expected: FAIL — `from_config` returns `None` (unknown kind), assertion error.

- [ ] **Step 3: Add the `from_config` branch**

In `services/learning/src/learning/ai_providers/providers/base.py`, after the `anthropic` branch (line 129), before the final `log.warning(... unknown_kind ...)`:

```python
    if kind == "claude_code":
        from learning.ai_providers.providers.claude_code import ClaudeCodeProvider
        return ClaudeCodeProvider(model=model)
```

- [ ] **Step 4: Widen the route `Literal`s**

In `services/learning/src/learning/ai_providers/routes.py`, change both occurrences (line 48 in `ProviderEntry`, line 62 in `CreateProviderRequest`):

```python
    kind: Literal["ollama", "openai", "anthropic", "claude_code"]
```

- [ ] **Step 5: Run the test — verify it passes**

Run:
```bash
cd services/learning && uv run pytest tests/ai_providers/test_claude_code_provider.py -q
```
Expected: PASS (10 tests).

- [ ] **Step 6: Run the full provider/gateway-adjacent suite for regressions**

Run:
```bash
cd services/learning && uv run pytest tests/ai_providers tests/payload_contracts/test_ai_gateway.py -q
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/learning/src/learning/ai_providers/providers/base.py \
        services/learning/src/learning/ai_providers/routes.py \
        services/learning/tests/ai_providers/test_claude_code_provider.py
git commit -m "feat(ai-providers): wire claude_code into from_config + API schema"
```

---

## Task 4: Admin UI — model-only Claude Code card

**Files:**
- Modify: `apps/web-admin/src/pages/AIProviders.tsx:21` (type) and `~280-333` (form)

- [ ] **Step 1: Widen the `Kind` type (line 21)**

```typescript
type Kind = "ollama" | "openai" | "anthropic" | "claude_code";
```

- [ ] **Step 2: Treat `claude_code` like `ollama` for grid columns**

Find the grid `gridTemplateColumns` (currently `row.kind === "ollama" ? "1fr 1fr" : "1fr 1fr 1fr"`). Claude Code has neither base URL nor key, so it is **model-only** (1 column). Change to:

```tsx
        gridTemplateColumns:
          row.kind === "claude_code"
            ? "1fr"
            : row.kind === "ollama"
              ? "1fr 1fr"
              : "1fr 1fr 1fr",
```

- [ ] **Step 3: Model placeholder for claude_code**

In the Model `<input>` placeholder ternary, add a `claude_code` case:

```tsx
            placeholder={
              row.kind === "openai"
                ? "gpt-4o-mini"
                : row.kind === "anthropic"
                  ? "claude-haiku-4-5-20251001"
                  : row.kind === "claude_code"
                    ? "sonnet"
                    : "llama3.1:8b"
            }
```

- [ ] **Step 4: Hide Base URL + API key for claude_code**

The Base URL `<Field>` currently always renders. Wrap it so it does NOT render for `claude_code` (it renders for ollama and the others). Change the Base URL field to be conditional:

```tsx
        {row.kind !== "claude_code" && (
          <Field
            label={row.kind === "ollama" ? "Base URL (Ollama server)" : "Base URL (override, optional)"}
          >
            {/* ...existing base url input unchanged... */}
          </Field>
        )}
```

The API key `<Field>` is already gated `row.kind !== "ollama"`. Change that guard to also exclude `claude_code`:

```tsx
        {row.kind !== "ollama" && row.kind !== "claude_code" && (
          <Field ...>  {/* existing API key input unchanged */}
```

- [ ] **Step 5: Add a helper line under the claude_code card header**

Near the header block where `row.has_key && (...)` renders the "key on file" hint, add an explanatory line for claude_code (it has no key):

```tsx
          {row.kind === "claude_code" && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Runs the local <code>claude</code> CLI with its logged-in
              subscription. No API key — run <code>claude login</code> inside
              the container.
            </div>
          )}
```

- [ ] **Step 6: Build the admin app to typecheck**

Run:
```bash
cd apps/web-admin && pnpm build
```
Expected: build succeeds, no TS errors about `Kind`.

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin/src/pages/AIProviders.tsx
git commit -m "feat(web-admin): Claude Code (CLI) provider card (model-only)"
```

---

## Task 5: Docker — install the CLI for the learning image + creds volume

**Files:**
- Modify: `infrastructure/docker/Dockerfile.python` (runtime stage, before `USER app`)
- Modify: `infrastructure/docker/docker-compose.yml` (learning service block ~179-185)

- [ ] **Step 1: ARG-gated CLI install in the shared Dockerfile**

In `infrastructure/docker/Dockerfile.python`, in the `runtime` stage after `COPY --from=builder ... /repo /repo` (line 51) and **before** `USER app` (line 54), add:

```dockerfile
# Optional: install the Claude Code CLI for services that use the
# `claude_code` AI provider (currently only `learning`). Gated by a build
# arg so other service images stay slim.
ARG INSTALL_CLAUDE_CODE=0
RUN if [ "$INSTALL_CLAUDE_CODE" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg && \
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
      apt-get install -y --no-install-recommends nodejs && \
      npm install -g @anthropic-ai/claude-code && \
      apt-get clean && rm -rf /var/lib/apt/lists/* ; \
    fi
```

- [ ] **Step 2: Pass the build arg + mount creds volume for learning**

In `infrastructure/docker/docker-compose.yml`, in the `learning:` service `build:` block (line ~181-182), add the arg:

```yaml
    build:
      <<: *py-build
      args: { SERVICE: learning, MODULE: learning.main, INSTALL_CLAUDE_CODE: "1" }
```

Add a volume so the CLI login persists (runtime user is `app`, home `/home/app`). Under the `learning:` service add (or extend) a `volumes:` key:

```yaml
    volumes:
      - claude-cli-creds:/home/app/.claude
```

And register the named volume in the top-level `volumes:` section at the bottom of the compose file:

```yaml
volumes:
  claude-cli-creds:
```

- [ ] **Step 3: Rebuild the learning image**

Run:
```bash
docker compose -f infrastructure/docker/docker-compose.yml build learning
docker compose -f infrastructure/docker/docker-compose.yml up -d learning
```
Expected: build pulls Node 20 + installs the CLI; container restarts healthy.

- [ ] **Step 4: Verify the CLI is present, then log in**

Run:
```bash
docker exec alp-local-learning-1 sh -lc "claude --version"
docker exec -it -u app alp-local-learning-1 claude login
```
Expected: version prints; `claude login` walks the OAuth flow (open the printed URL, paste the code). Login persists in the mounted volume.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/docker/Dockerfile.python infrastructure/docker/docker-compose.yml
git commit -m "build(learning): install claude CLI (arg-gated) + persist ~/.claude volume"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Test button via the admin UI**

In web-admin → AI providers, the **Claude Code (CLI)** card appears (model-only). Set model to `sonnet`, click **Test**.
Expected: green "Reachable. CLI + login + model work. (NNN ms)".

- [ ] **Step 2: Exercise the chain**

Temporarily set Claude Code to **Enabled** with the lowest priority number (highest priority) and disable the others, then trigger an AI touchpoint that routes through `admin_chain` (e.g. an authoring draft). Confirm in logs:
```bash
docker logs alp-local-learning-1 2>&1 | grep ai_providers.served | tail -1
```
Expected: a `served` log with `kind=claude_code`. Restore provider priorities/enabled state afterward.

- [ ] **Step 3: Full learning test suite (no regressions)**

Run:
```bash
cd services/learning && uv run pytest -q
```
Expected: all pass.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A && git commit -m "chore(ai-providers): claude_code provider end-to-end verified" || true
```

---

## Self-Review notes (addressed)

- **Spec coverage:** migration + CHECK (§3.3, Task 1); provider subprocess/parse/stream/health (§3.2, Task 2); from_config + routes (§3.4, Task 3); UI model-only card (§3.5, Task 4); Dockerfile + creds volume (§3.6, Task 5); error-handling table (§4) realised by None-returning paths + tests; security (§5) via stdin/`shell=False`/tools-off; testing (§6) in Tasks 2-3.
- **`extra`-driven concurrency/timeout** from the spec was simplified to module constants — `from_config`'s row SELECT does not include `extra` (see `_list_enabled`), so per-row tuning would require widening that query; deferred to future work to keep the change minimal. Defaults: concurrency 4, timeout 120s (base default).
- **No placeholders:** every code/command step is concrete.
- **Type consistency:** `ClaudeCodeProvider`, `_run`, `_extract_json`, `_get_sema`, `kind="claude_code"`, model alias `sonnet` used consistently across tasks.
