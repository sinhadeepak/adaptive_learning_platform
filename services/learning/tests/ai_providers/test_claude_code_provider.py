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
    chunks = [
        c
        async for c in p.stream_chat(
            system="s", messages=[{"role": "user", "content": "hi"}]
        )
    ]
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


@pytest.mark.asyncio
async def test_call_structured_handles_braces_in_string_values(monkeypatch):
    # A valid JSON payload whose string values contain { and } must parse.
    payload = '{"code": "if (x) { return {1}; }", "n": 2}'
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope(payload)))
    p = ClaudeCodeProvider(model="sonnet")
    out = await p.call_structured(system="", user="q", schema_name="S", schema={})
    assert out == {"code": "if (x) { return {1}; }", "n": 2}


@pytest.mark.asyncio
async def test_run_times_out_and_kills_process(monkeypatch):
    # When the subprocess overruns, _run kills it and returns None.
    _patch_cli(monkeypatch, proc=_FakeProc(stdout=_envelope("late")))

    async def _boom(*_a, **_k):
        raise TimeoutError

    killed = {"called": False}
    monkeypatch.setattr(cc.asyncio, "wait_for", _boom)
    monkeypatch.setattr(cc, "_kill", lambda _proc: killed.__setitem__("called", True))

    p = ClaudeCodeProvider(model="sonnet")
    out = await p.call_structured(system="", user="q", schema_name="S", schema={})
    assert out is None
    assert killed["called"] is True


def test_from_config_builds_claude_code():
    from learning.ai_providers.providers import from_config

    p = from_config({"kind": "claude_code", "model": "sonnet"})
    assert isinstance(p, ClaudeCodeProvider)
    assert p.model == "sonnet"
