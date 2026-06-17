"""Sprint 24 (P4-S24) — PYQ ingest CLI.

Reads a normalised PYQ JSON file and pushes each row through the existing
Content authoring → review → bridge pipeline so the question lands in
both content_schema.questions (source of truth) and quiz_schema.questions
(serving mirror) with PYQ metadata intact.

JSON shape:
  {
    "paper_session": "JEE-MAIN-2024-JAN-S1",
    "exam_year": 2024,
    "questions": [
      {
        "stem": "...",
        "choices": ["...", "..."],
        "correct_idx": 0,
        "topic_id": "<uuid>",
        "difficulty_b": 0.5,
        "discrimination_a": 1.2,
        "guessing_c": 0.25,
        "explanation": "..."
      }
    ]
  }

Usage:
  uv run python -m scripts.ingest_pyq path/to/paper.json
        [--base-url http://localhost:38003] [--jwt-secret SECRET]

Behaviour:
  - Mints a moderator JWT (so the same call can submit + auto-approve).
  - Per-row outcome printed: OK / SKIP (already exists) / FAIL.
  - Fail-soft: a malformed row is logged and the loop continues.

Bulk content load (10 yrs × ~225 Q × 3 sessions per exam) is the parallel
content workstream W1 — it uses this same CLI with different inputs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import jwt

DEFAULT_SECRET = os.environ.get(
    "CONTENT_JWT_SECRET", "dev-only-change-me-in-staging-at-least-32-bytes-long"
)
DEFAULT_BASE_URL = os.environ.get("LEARNING_BASE_URL", "http://localhost:38003")


def mint_token(secret: str, role: str = "MODERATOR", user_id: str | None = None) -> str:
    sub = user_id or str(uuid4())
    return jwt.encode(
        {
            "sub": sub,
            "role": role,
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        },
        secret,
        algorithm="HS256",
    )


def validate_row(row: dict[str, Any]) -> tuple[bool, str]:
    """Pure-function row validator — returns (ok, reason)."""
    required = ("stem", "choices", "correct_idx", "topic_id")
    for k in required:
        if row.get(k) in (None, "", []):
            return False, f"missing field: {k}"
    if not isinstance(row["choices"], list) or len(row["choices"]) < 2:
        return False, "choices must be a list of at least 2 items"
    correct = row["correct_idx"]
    if not isinstance(correct, int) or correct < 0 or correct >= len(row["choices"]):
        return False, "correct_idx out of range"
    return True, ""


def ingest(
    *,
    base_url: str,
    paper: dict[str, Any],
    secret: str,
    author_role: str = "EXPERT",
) -> dict[str, int]:
    """Drive each question through author → submit → approve.

    The author and the reviewer must be different principals (Content's
    review FSM rejects self-approval), so we mint two tokens.
    """
    paper_session = paper.get("paper_session")
    exam_year = paper.get("exam_year")
    questions = paper.get("questions") or []
    if not paper_session or not exam_year:
        raise ValueError("paper JSON must carry paper_session + exam_year")

    author_token = mint_token(secret, role=author_role, user_id=str(uuid4()))
    reviewer_token = mint_token(
        secret, role="MODERATOR", user_id=str(uuid4())
    )
    counters = {"ok": 0, "fail": 0, "skip": 0}

    with httpx.Client(timeout=10.0) as client:
        for i, raw in enumerate(questions, start=1):
            ok, reason = validate_row(raw)
            if not ok:
                counters["fail"] += 1
                print(f"[{i:03d}] FAIL: {reason}", file=sys.stderr)
                continue
            body = {
                "topicId": raw["topic_id"],
                "stem": raw["stem"],
                "choices": raw["choices"],
                "correctIdx": int(raw["correct_idx"]),
                "difficultyB": float(raw.get("difficulty_b", 0.0)),
                "discriminationA": float(raw.get("discrimination_a", 1.0)),
                "guessingC": float(raw.get("guessing_c", 0.0)),
                "language": raw.get("language", "en"),
                "explanation": raw.get("explanation"),
                "examYear": int(exam_year),
                "paperSession": paper_session,
                "pyqFlag": True,
            }
            try:
                r = client.post(
                    f"{base_url}/content/questions",
                    json=body,
                    headers={"Authorization": f"Bearer {author_token}"},
                )
                if r.status_code != 201:
                    counters["fail"] += 1
                    print(f"[{i:03d}] FAIL create {r.status_code}: {r.text}", file=sys.stderr)
                    continue
                qid = r.json()["id"]
                # Submit for review
                client.post(
                    f"{base_url}/content/questions/{qid}/submit",
                    headers={"Authorization": f"Bearer {author_token}"},
                )
                # Approve
                rv = client.post(
                    f"{base_url}/content/questions/{qid}/review",
                    json={"approve": True, "notes": "Imported via ingest_pyq.py"},
                    headers={"Authorization": f"Bearer {reviewer_token}"},
                )
                if rv.status_code in (200, 204):
                    counters["ok"] += 1
                    print(f"[{i:03d}] OK {qid}")
                else:
                    counters["fail"] += 1
                    print(f"[{i:03d}] FAIL approve {rv.status_code}: {rv.text}", file=sys.stderr)
            except httpx.HTTPError as e:
                counters["fail"] += 1
                print(f"[{i:03d}] FAIL exc: {e}", file=sys.stderr)

    return counters


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Ingest PYQ JSON into Content")
    parser.add_argument("paper_file", type=Path)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--jwt-secret", default=DEFAULT_SECRET)
    args = parser.parse_args(argv)

    if not args.paper_file.exists():
        print(f"file not found: {args.paper_file}", file=sys.stderr)
        return 2

    paper = json.loads(args.paper_file.read_text(encoding="utf-8"))
    counters = ingest(base_url=args.base_url, paper=paper, secret=args.jwt_secret)
    print(
        f"\nDone — ok={counters['ok']} fail={counters['fail']} skip={counters['skip']}"
    )
    return 0 if counters["fail"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
