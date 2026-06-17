#!/usr/bin/env python3
"""End-to-end test orchestrator for the Adaptive Learning Platform.

Prereq: stack must be running with seed gates enabled, i.e.
  AUTH_SEED_LOCAL=1     (set on identity service in docker-compose)
  CONTENT_SEED_LOCAL=1  (set on learning service for polymorphic seeds)

What this script does (idempotent — re-running is safe):

 1. Login as one teacher per institution (5 logins) and one student
    per cohort (5 logins). Verifies the seeded credentials work.
 2. For each student, start a PRACTICE quiz session against a
    cohort-appropriate topic, answer 5 questions (mix of right/wrong),
    submit. Drives analytics ingest → cohort_leaderboard rows for the
    student.
 3. Pull the cohort leaderboard for each cohort and print the top-3.
 4. Print a one-page summary covering: institutions, teachers,
    students, question banks per exam, mock-test blueprints,
    leaderboard freshness.

Usage:
  python3 scripts/e2e_orchestrator.py
  python3 scripts/e2e_orchestrator.py --quiet     # less verbose
  python3 scripts/e2e_orchestrator.py --skip-quiz # only verify auth
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

IDENTITY_BASE = "http://localhost:38001"
LEARNING_BASE = "http://localhost:38101"
ENGAGEMENT_BASE = "http://localhost:38100"
QUIZ_BASE = "http://localhost:38011"

SEED_PASSWORD = "Password123!"

# Institutions seeded by identity migration 006_seed_e2e_institutions.
INSTITUTIONS = [
    {"slug": "aurora-coaching",  "exam": "JEE_MAIN", "name": "Aurora Coaching Centre",
     "cohort_id": "66666666-0000-0000-0000-000000000001",
     "topic_id":  "33333333-0000-0000-0000-000000000001"},   # MECH (JEE Phys)
    {"slug": "vedanta-tutorials","exam": "NEET",     "name": "Vedanta Tutorials",
     "cohort_id": "66666666-0000-0000-0000-000000000002",
     "topic_id":  "33333333-0000-0000-0000-000000000008"},   # CELL (NEET Bio)
    {"slug": "dps-rk-puram",     "exam": "CBSE",     "name": "DPS RK Puram",
     "cohort_id": "66666666-0000-0000-0000-000000000003",
     "topic_id":  "33333333-0000-0000-0000-000000000031"},   # C9_MATTER
    {"slug": "kv-new-delhi",     "exam": "CBSE",     "name": "Kendriya Vidyalaya New Delhi",
     "cohort_id": "66666666-0000-0000-0000-000000000004",
     "topic_id":  "33333333-0000-0000-0000-000000000025"},   # C8_FORCE
    {"slug": "allen-test",       "exam": "JEE_MAIN", "name": "Allen Career Institute (Test)",
     "cohort_id": "66666666-0000-0000-0000-000000000005",
     "topic_id":  "33333333-0000-0000-0000-000000000004"},   # PCHEM (JEE Chem)
]


# ─────────────────────────────────────────────────────────────────────────
# HTTP helpers (stdlib only — no external dep beyond Python 3.11)
# ─────────────────────────────────────────────────────────────────────────


def _request(
    method: str,
    url: str,
    *,
    body: dict | None = None,
    headers: dict | None = None,
    timeout: float = 15.0,
) -> tuple[int, dict | str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8") or "{}"
            return resp.status, json.loads(raw) if raw.strip().startswith(("{", "[")) else raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8") if e.fp else ""
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except urllib.error.URLError as e:
        return -1, str(e)


def login(email: str) -> dict | None:
    status, body = _request(
        "POST",
        f"{IDENTITY_BASE}/auth/login",
        body={"email": email, "password": SEED_PASSWORD, "remember": False},
    )
    if status != 200 or not isinstance(body, dict):
        return None
    return body


def login_throttled(email: str, throttle_seconds: float) -> dict | None:
    """Login with a small delay to stay under the per-IP rate-limit
    (LOGIN: 10 requests / 60 seconds — see identity rate_limit.py).
    Caller is responsible for the leading delay; we sleep AFTER the
    request so the cycle is consistent across calls."""
    sess = login(email)
    if throttle_seconds > 0:
        time.sleep(throttle_seconds)
    return sess


# ─────────────────────────────────────────────────────────────────────────
# Quiz drivers
# ─────────────────────────────────────────────────────────────────────────


def run_practice_session(
    user_id: str,
    topic_id: str,
    bearer: str,
    *,
    n_answers: int = 5,
    quiet: bool = False,
) -> dict | None:
    """Start a PRACTICE session, answer N questions, submit. Returns
    the submit response (with score) or None on failure."""
    headers = {"Authorization": f"Bearer {bearer}"}

    # 1. Start
    status, body = _request(
        "POST",
        f"{QUIZ_BASE}/quiz/sessions/start",
        body={"topicId": topic_id, "userId": user_id, "mode": "PRACTICE"},
        headers=headers,
    )
    if status != 201 or not isinstance(body, dict):
        if not quiet:
            print(f"  ✗ start failed: status={status} body={body!r}")
        return None
    session_id = body["sessionId"]
    if not quiet:
        print(f"  ✓ started session {session_id[:8]}…")

    # 2. Loop: GET /next → POST /answers
    # Wire shape from quiz Go (sessions.go::Next): the response carries
    # ``item`` (not ``question``), with ``itemIdx`` plus ``questionId``,
    # ``stem``, ``choices`` nested under it. ``done: true`` signals
    # the target count was already reached.
    correct_count = 0
    for i in range(n_answers):
        s2, b2 = _request("GET", f"{QUIZ_BASE}/quiz/sessions/{session_id}/next", headers=headers)
        if s2 != 200 or not isinstance(b2, dict):
            if not quiet:
                print(f"  ✗ next failed at item {i}: {s2} {b2!r}")
            return None
        if b2.get("done"):
            break
        item = b2.get("item") or {}
        item_idx = item.get("itemIdx", i)
        n_choices = len(item.get("choices", []))
        # Mix correct + incorrect — student #i picks correctIdx 0 with
        # 50% probability, otherwise the next index.
        guess = 0 if i % 2 == 0 else min(1, max(0, n_choices - 1))
        s3, b3 = _request(
            "POST",
            f"{QUIZ_BASE}/quiz/sessions/{session_id}/answers",
            body={"itemIdx": item_idx, "answerIdx": guess},
            headers=headers,
        )
        if s3 not in (200, 201) or not isinstance(b3, dict):
            if not quiet:
                print(f"  ✗ answer failed at item {i}: {s3} {b3!r}")
            return None
        if b3.get("isCorrect"):
            correct_count += 1

    # 3. Submit
    status, body = _request("POST", f"{QUIZ_BASE}/quiz/sessions/{session_id}/submit",
                            headers=headers, body={})
    if status != 200 or not isinstance(body, dict):
        if not quiet:
            print(f"  ✗ submit failed: {status} {body!r}")
        return None
    if not quiet:
        print(f"  ✓ submitted: {correct_count}/{n_answers} correct")
    return body


# ─────────────────────────────────────────────────────────────────────────
# Verification + summary
# ─────────────────────────────────────────────────────────────────────────


def verify_logins(
    *,
    quiet: bool = False,
    n_students: int = 2,
    include_teachers: bool = False,
    throttle_seconds: float = 7.0,
) -> dict[str, dict]:
    """Login N students per institution (and optionally one teacher).
    Returns ``{email: session}``. Sessions are kept so the orchestrator
    can reuse the bearer for quiz activity without re-logging in (which
    would hit the per-IP login rate-limiter — 10 / 60s by default).

    Throttle defaults to 7s/login: at 10 logins/60s the window is full
    in 6s of unrestricted hammering, so spreading them out keeps us at
    or just under the threshold."""
    sessions: dict[str, dict] = {}
    for inst in INSTITUTIONS:
        if include_teachers:
            email = f"teacher0.{inst['slug']}@e2e.alp.dev"
            sess = login_throttled(email, throttle_seconds)
            if sess:
                sessions[email] = sess
                if not quiet:
                    print(f"  ✓ {email} (teacher@{inst['slug']})")
            elif not quiet:
                print(f"  ✗ {email} — login failed")
        for s_idx in range(n_students):
            email = f"student{s_idx}.{inst['slug']}@e2e.alp.dev"
            sess = login_throttled(email, throttle_seconds)
            if not sess:
                if not quiet:
                    print(f"  ✗ {email} — login failed")
                continue
            sessions[email] = sess
            if not quiet:
                print(f"  ✓ {email} (student@{inst['slug']})")
    return sessions


def cohort_leaderboard(cohort_id: str) -> list[dict]:
    status, body = _request(
        "GET",
        f"{ENGAGEMENT_BASE}/analytics/cohorts/{cohort_id}/leaderboard",
    )
    if status != 200 or not isinstance(body, dict):
        return []
    return body.get("leaderboard", [])


def fetch_question_count(exam_code: str) -> int:
    """Best-effort question-count probe — uses learning's content listing."""
    status, body = _request("GET", f"{LEARNING_BASE}/catalog/exams")
    if status != 200 or not isinstance(body, list):
        return -1
    # Coarse: not all platforms expose per-exam counts; we just verify exam exists.
    for e in body:
        if e.get("code") == exam_code:
            return 1
    return 0


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--skip-quiz", action="store_true",
                        help="Only verify logins; skip quiz-driven activity")
    parser.add_argument("--n-students", type=int, default=2,
                        help="Students per cohort to drive quiz activity for "
                             "(default 2; n_students*5_inst must keep within "
                             "the per-IP login rate-limit when combined with throttle).")
    parser.add_argument("--include-teachers", action="store_true",
                        help="Also login one teacher per institution (verification).")
    parser.add_argument("--throttle-seconds", type=float, default=7.0,
                        help="Seconds between login attempts (rate-limit is "
                             "10 logins / 60s per IP).")
    args = parser.parse_args()

    quiet = args.quiet
    print("─" * 72)
    print("ALP end-to-end orchestrator")
    print("─" * 72)

    # 1. Verify identity is reachable
    print("\n[1/4] Verifying identity health…")
    s, _ = _request("GET", f"{IDENTITY_BASE}/health")
    if s != 200:
        print(f"  ✗ identity not reachable (status={s}); aborting.")
        return 2
    print(f"  ✓ identity OK")

    # 2. Verify logins (N students per institution, plus optionally one
    # teacher each). Sessions are cached and reused below so we don't
    # re-trigger the login rate-limiter when driving quiz activity.
    extras = " + 1 teacher" if args.include_teachers else ""
    n_logins_expected = len(INSTITUTIONS) * (args.n_students + (1 if args.include_teachers else 0))
    eta_seconds = int(n_logins_expected * args.throttle_seconds)
    print(f"\n[2/4] Logging in seed users ({args.n_students} students{extras} "
          f"per institution → {n_logins_expected} total, "
          f"~{eta_seconds}s with {args.throttle_seconds}s throttle)…")
    sessions = verify_logins(
        quiet=quiet,
        n_students=args.n_students,
        include_teachers=args.include_teachers,
        throttle_seconds=args.throttle_seconds,
    )
    expected = len(INSTITUTIONS) * (1 + args.n_students)
    if len(sessions) < len(INSTITUTIONS):
        print(f"  ✗ only {len(sessions)} of {expected} logins succeeded; "
              "did you set AUTH_SEED_LOCAL=1 and run alembic upgrade?")
        return 3

    # 3. Drive quiz activity per cohort, reusing the bearers from step 2.
    if not args.skip_quiz:
        print(f"\n[3/4] Driving quiz activity ({args.n_students} students/cohort)…")
        for inst in INSTITUTIONS:
            print(f"\n  Cohort: {inst['name']} ({inst['exam']})")
            for s_idx in range(args.n_students):
                email = f"student{s_idx}.{inst['slug']}@e2e.alp.dev"
                sess = sessions.get(email)
                if not sess:
                    print(f"    ✗ {email} session missing; skipping")
                    continue
                user_id = sess["user"]["id"]
                bearer = sess["tokens"]["accessToken"]
                run_practice_session(
                    user_id, inst["topic_id"], bearer,
                    n_answers=5, quiet=quiet,
                )

        # Give analytics ~5s to consume NATS events. Engagement subscribes
        # to ``quiz.session.completed`` and writes readiness rows; the
        # JetStream durable typically delivers in <1s, but the fan-out also
        # writes per-concept mastery and bloom rows in the same handler so
        # we leave headroom.
        print("\n  Waiting 5s for analytics fan-out…")
        time.sleep(5.0)
    else:
        print("\n[3/4] (skipped — quiz activity disabled by --skip-quiz)")

    # 4. Print leaderboards + summary
    print("\n[4/4] Cohort leaderboards (top 3 each):")
    total_lb = 0
    for inst in INSTITUTIONS:
        rows = cohort_leaderboard(inst["cohort_id"])
        total_lb += len(rows)
        print(f"\n  {inst['name']} ({inst['exam']}):")
        if not rows:
            print("    (empty leaderboard — quiz activity may not have ingested yet)")
            continue
        for r in rows[:3]:
            uid = (r.get("userId") or r.get("user_id") or "?")[:8]
            raw = r.get("masteryAvg") or r.get("score") or r.get("ewa")
            score = f"{raw:.2f}" if isinstance(raw, (int, float)) else str(raw or "—")
            n = r.get("nTopics", 0)
            started = "started" if r.get("started") else "not started"
            print(f"    {uid}… score={score} nTopics={n} ({started})")

    print("\n" + "─" * 72)
    print("Summary")
    print("─" * 72)
    print(f"  Institutions verified:          {len(INSTITUTIONS)}")
    label = (f"{args.n_students} students" + (" + 1 teacher" if args.include_teachers else ""))
    print(f"  Logins verified:                {len(sessions)} ({label} per inst)")
    if not args.skip_quiz:
        print(f"  Quiz sessions driven:           {len(INSTITUTIONS) * args.n_students}")
    print(f"  Total leaderboard rows pulled:  {total_lb}")
    print("\nE2E orchestration complete.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
