"""Shared fixtures for consolidation contract tests."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import pytest

RECORDINGS_DIR = Path(__file__).parent / "recordings"

UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    flags=re.IGNORECASE,
)
TIMESTAMP_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"
)

VOLATILE_KEYS = frozenset(
    {
        "id",
        "createdAt",
        "updatedAt",
        "submittedAt",
        "publishedAt",
        "completedAt",
        "joinedAt",
        "lastActiveDate",
        "iat",
        "exp",
        "traceparent",
        "trace_id",
        "expiresAt",
        "set_at",
        "ts",
    }
)


def normalise_response(body: Any) -> Any:
    """Strip volatile fields so contract tests can compare old vs new
    service responses byte-for-byte. Recursive: handles nested objects
    and lists."""
    if isinstance(body, dict):
        return {
            k: ("<redacted>" if k in VOLATILE_KEYS else normalise_response(v))
            for k, v in body.items()
        }
    if isinstance(body, list):
        return [normalise_response(item) for item in body]
    if isinstance(body, str):
        s = UUID_RE.sub("<uuid>", body)
        s = TIMESTAMP_RE.sub("<ts>", s)
        return s
    return body


@pytest.fixture(scope="session")
def recordings_root() -> Path:
    """Root directory for captured request/response fixtures."""
    return RECORDINGS_DIR


@pytest.fixture
def load_recording(recordings_root: Path):
    """Loader for a single recording file. Skips the test cleanly if
    the recording isn't present yet (so partial coverage doesn't fail
    the suite during early sprints)."""

    def _load(old_service: str, route_key: str) -> dict[str, Any] | None:
        slug = re.sub(r"[^a-zA-Z0-9]+", "_", route_key).strip("_")
        path = recordings_root / old_service / f"{slug}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text())

    return _load


@pytest.fixture
def new_service_url() -> str:
    """Base URL for the consolidated service under test. Set per
    contract-test module via `pytest --new-service-url=...` or the
    `NEW_SERVICE_URL` env var. Defaults assume `make dev-new` is up."""
    return os.environ.get("NEW_SERVICE_URL", "http://localhost:38100")
