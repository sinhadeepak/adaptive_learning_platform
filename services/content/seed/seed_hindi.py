"""Seed Hindi MCQ content via the Content service's HTTP API.

Drives the full author → submit → approve loop for every question in
`hindi_questions.json`, exercising the same code path a real teacher does.
The Content→Quiz JetStream bridge then mirrors the approved rows into
`quiz_schema.questions`, so students start seeing them on the next /next
call against the matching topic.

Usage:
  uv run python seed/seed_hindi.py [--base-url URL] [--jwt-secret SECRET]

Defaults to localhost ports + the local-dev JWT secret. CI / staging
override via env vars (CONTENT_BASE_URL, CONTENT_JWT_SECRET).

Idempotency: each invocation creates fresh question rows. To re-run safely
without duplicates, prune by stem prefix or call --dry-run first.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx
import jwt

DEFAULT_SECRET = "dev-only-change-me-in-staging-at-least-32-bytes-long"
DEFAULT_BASE_URL = "http://localhost:38003"
SEED_FILE = Path(__file__).parent / "hindi_questions.json"


def _mint_token(secret: str, role: str, user_id: str | None = None) -> str:
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", default=os.environ.get("CONTENT_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--jwt-secret", default=os.environ.get("CONTENT_JWT_SECRET", DEFAULT_SECRET))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    questions = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    print(f"loaded {len(questions)} questions from {SEED_FILE.name}")
    if args.dry_run:
        for q in questions:
            print(
                f"  [dry] {q['topicCode']:<8} b={q['difficultyB']:+.1f} "
                f"a={q.get('discriminationA', 1.0):.2f} c={q.get('guessingC', 0.0):.2f}"
            )
        return 0

    # Mint as PLATFORM_ADMIN so the seed bypasses the educator-assignment
    # scope check on POST /content/questions (catalog migration 005 +
    # content's authorize_topic round-trip). Seeding is conceptually an
    # admin/ops action — a real teacher uses the cascading-dropdown UI.
    teacher_token = _mint_token(args.jwt_secret, "PLATFORM_ADMIN")
    moderator_token = _mint_token(args.jwt_secret, "PLATFORM_ADMIN")
    teacher_h = {"authorization": f"Bearer {teacher_token}", "content-type": "application/json"}
    moderator_h = {"authorization": f"Bearer {moderator_token}"}

    seeded: list[str] = []
    with httpx.Client(base_url=args.base_url, timeout=10.0) as client:
        # Probe health to fail fast on a wrong URL.
        h = client.get("/health")
        if h.status_code != 200:
            print(f"  ✗ health probe failed: {h.status_code} {h.text}", file=sys.stderr)
            return 2

        for i, q in enumerate(questions, 1):
            body = {
                "topicId": q["topicId"],
                "stem": q["stem"],
                "choices": q["choices"],
                "correctIdx": q["correctIdx"],
                "difficultyB": q["difficultyB"],
                "discriminationA": q.get("discriminationA", 1.0),
                "guessingC": q.get("guessingC", 0.0),
                "language": "hi",
            }
            r = client.post("/content/questions", json=body, headers=teacher_h)
            if r.status_code != 201:
                print(
                    f"  ✗ {i}/{len(questions)} {q['topicCode']:<8} create: "
                    f"{r.status_code} {r.text[:120]}",
                    file=sys.stderr,
                )
                return 3
            qid = r.json()["id"]

            r = client.post(f"/content/questions/{qid}/submit", headers=teacher_h)
            if r.status_code != 200:
                print(f"  ✗ {qid} submit: {r.status_code} {r.text[:120]}", file=sys.stderr)
                return 4

            r = client.post(
                f"/content/questions/{qid}/review",
                json={"approve": True, "notes": "Hindi seed"},
                headers={**moderator_h, "content-type": "application/json"},
            )
            if r.status_code != 200:
                print(f"  ✗ {qid} review: {r.status_code} {r.text[:120]}", file=sys.stderr)
                return 5

            seeded.append(qid)
            print(f"  ✓ {i}/{len(questions)} {q['topicCode']:<8} {qid[:8]}…  PUBLISHED")

    print(f"\nDone: {len(seeded)} Hindi questions seeded.")
    print("Quiz bank should reflect them within ~1s via the content.question.published bridge.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
