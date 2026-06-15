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
import contextlib
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
    except Exception:
        with contextlib.suppress(Exception):
            proc.kill()


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
            except Exception as e:
                log.warning("provider.claude_code.spawn_failed", extra={"err": str(e)[:200]})
                return None
            try:
                out, err = await asyncio.wait_for(
                    proc.communicate(input=prompt.encode()),
                    timeout=self.timeout_s,
                )
            except TimeoutError:
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
            log.warning(
                "provider.claude_code.result_error",
                extra={"subtype": envelope.get("subtype")},
            )
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
                message=(
                    "claude CLI call failed — not logged in? "
                    "run `claude login` in the container"
                ),
            )
        return HealthStatus(
            ok=True,
            message="Reachable. CLI + login + model work.",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
